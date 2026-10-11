import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenClaims,
  REFRESH_TOKEN_TTL_SECONDS,
  ShopMembershipClaim,
} from '@am/auth';
import {
  AuthenticatedUserResponse,
  IdentityErrorCode,
  IdentityErrors,
  LogoutRequest,
  LogoutResponse,
  RefreshSessionRequest,
  SessionTokens,
} from '@am/contracts';
import { Session, ShopMember, User } from '../entities';
import { identityError } from '../errors';
import { toUserDto } from '../users/user.mapper';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { REFRESH_REUSE_LEEWAY_SECONDS, USER_AGENT_MAX_LENGTH } from './session.constants';

/** Where a sign-in came from; stored on the session so a person can recognise their devices. */
export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

type RefreshOutcome = { user: User; tokens: SessionTokens } | { error: IdentityErrorCode };

/** A user's shop memberships in the shape the access token carries. */
export async function loadMemberships(
  manager: EntityManager,
  userId: string,
): Promise<ShopMembershipClaim[]> {
  const members = await manager.find(ShopMember, {
    where: { userId },
    order: { createdAt: 'ASC' },
  });
  return members.map((m) => ({ shopId: m.shopId, role: m.role, branchIds: m.branchIds }));
}

/**
 * Access and refresh tokens. A sign-in starts a "family"; every refresh replaces the refresh
 * token with a new one in the same family. A replaced token that comes back means it was copied,
 * so the whole family is signed out.
 */
export class SessionService {
  private readonly jwt: JwtService;

  constructor(
    private readonly dataSource: DataSource,
    accessSecret: string,
    private readonly reuseLeewaySeconds = REFRESH_REUSE_LEEWAY_SECONDS,
  ) {
    this.jwt = new JwtService({
      secret: accessSecret,
      signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    });
  }

  /**
   * Starts a session for a user who has just proved who they are. Runs on the caller's
   * transaction, so a sign-in that rolls back leaves no session behind.
   */
  async start(manager: EntityManager, user: User, context: SessionContext): Promise<SessionTokens> {
    return (await this.issue(manager, user, randomUUID(), context)).tokens;
  }

  /**
   * Swaps a refresh token for a new pair. The access token is rebuilt from the database, so a
   * changed role or shop membership shows up here at the latest.
   */
  async refresh(input: RefreshSessionRequest): Promise<AuthenticatedUserResponse> {
    const hash = hashRefreshToken(input.refreshToken);

    // Failures are returned, not thrown, so that revoking a family still commits.
    const outcome = await this.dataSource.transaction(async (manager): Promise<RefreshOutcome> => {
      // The lock makes two simultaneous refreshes of one token take turns.
      const session = await manager.findOne(Session, {
        where: { refreshTokenHash: hash },
        lock: { mode: 'pessimistic_write' },
      });
      const now = Date.now();
      if (!session || session.revokedAt || session.expiresAt.getTime() <= now) {
        return { error: IdentityErrors.sessionInvalid };
      }

      if (session.replacedBy) {
        // Measured on the database clock, which also stamped `created_at`.
        const justRotated =
          this.reuseLeewaySeconds > 0 &&
          (await manager
            .createQueryBuilder(Session, 's')
            .where('s.id = :id', { id: session.replacedBy })
            .andWhere('s.revoked_at IS NULL')
            .andWhere('s.created_at > now() - make_interval(secs => :leeway)', {
              leeway: this.reuseLeewaySeconds,
            })
            .getExists());
        if (!justRotated) {
          await this.revokeFamily(manager, session.familyId);
          return { error: IdentityErrors.sessionReused };
        }
      }

      const user = await manager.findOneBy(User, { id: session.userId });
      if (!user || user.status !== 'active') {
        await this.revokeFamily(manager, session.familyId);
        return { error: user ? IdentityErrors.userSuspended : IdentityErrors.sessionInvalid };
      }

      const issued = await this.issue(manager, user, session.familyId, input);
      if (!session.replacedBy) {
        await manager.update(Session, { id: session.id }, { replacedBy: issued.sessionId });
      }
      return { user, tokens: issued.tokens };
    });

    if ('error' in outcome) throw identityError(outcome.error);
    return { user: toUserDto(outcome.user), session: outcome.tokens };
  }

  /** Signs out the session the token belongs to. Answers the same for an unknown token. */
  async logout(input: LogoutRequest): Promise<LogoutResponse> {
    const session = await this.dataSource.manager.findOneBy(Session, {
      refreshTokenHash: hashRefreshToken(input.refreshToken),
    });
    if (session) await this.revokeFamily(this.dataSource.manager, session.familyId);
    return { loggedOut: true };
  }

  /** Signs the user out on every device, for example after a password reset. */
  async revokeAllForUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.update(Session, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async revokeFamily(manager: EntityManager, familyId: string): Promise<void> {
    await manager.update(Session, { familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issue(
    manager: EntityManager,
    user: User,
    familyId: string,
    context: SessionContext,
  ): Promise<{ sessionId: string; tokens: SessionTokens }> {
    const sessionId = randomUUID();
    const refreshToken = generateRefreshToken();
    const now = Date.now();
    const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await manager.insert(Session, {
      id: sessionId,
      userId: user.id,
      familyId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: context.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) || null,
      // The column is `inet`; anything that is not an address is dropped, not stored.
      ip: context.ip && isIP(context.ip) ? context.ip : null,
      expiresAt: refreshExpiresAt,
    });

    const claims: AccessTokenClaims = {
      sub: user.id,
      roles: user.roles,
      shops: await loadMemberships(manager, user.id),
      locale: user.preferredLanguage,
    };
    return {
      sessionId,
      tokens: {
        accessToken: await this.jwt.signAsync(claims),
        accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
        refreshToken,
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      },
    };
  }
}
