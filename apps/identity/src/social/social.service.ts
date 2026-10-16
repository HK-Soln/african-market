import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import {
  IdentityErrors,
  SocialProvider,
  SocialProvidersResponse,
  SocialSignInRequest,
  VerifyOtpResponse,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { DEFAULT_LOCALE, isLocale } from '@am/i18n';
import { Credential, User } from '../entities';
import { identityError } from '../errors';
import { SessionService } from '../sessions/session.service';
import { termsAcceptance } from '../users/consent';
import { toUserDto } from '../users/user.mapper';
import {
  SocialIdentity,
  SocialProviderDown,
  SocialTokenRejected,
  SocialVerifier,
} from './social-verifier';

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505';

type Outcome =
  | { user: User; isNewUser: boolean }
  | { error: (typeof IdentityErrors)[keyof typeof IdentityErrors] };

/**
 * Google and Facebook sign-in (F1-09, decision P-10). The provider's token is checked with the
 * provider; then, in order:
 * 1. a known link (provider and subject) signs its account in;
 * 2. an address the provider vouches for, of an existing account, links to that account;
 * 3. otherwise a new account is made, which needs the terms accepted.
 */
export class SocialService {
  private readonly verifiers: Map<SocialProvider, SocialVerifier>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly sessions: SessionService,
    verifiers: SocialVerifier[],
    private readonly publicIds: { googleClientId?: string; facebookAppId?: string },
  ) {
    this.verifiers = new Map(verifiers.map((v) => [v.provider, v]));
  }

  providers(): SocialProvidersResponse {
    return {
      google:
        this.verifiers.has('google') && this.publicIds.googleClientId
          ? { clientId: this.publicIds.googleClientId }
          : null,
      facebook:
        this.verifiers.has('facebook') && this.publicIds.facebookAppId
          ? { appId: this.publicIds.facebookAppId }
          : null,
    };
  }

  async signIn(input: SocialSignInRequest): Promise<VerifyOtpResponse> {
    const verifier = this.verifiers.get(input.provider);
    if (!verifier) throw identityError(IdentityErrors.socialProviderDisabled);
    let identity: SocialIdentity;
    try {
      identity = await verifier.verify(input.token);
    } catch (err) {
      if (err instanceof SocialTokenRejected)
        throw identityError(IdentityErrors.socialTokenInvalid);
      if (err instanceof SocialProviderDown)
        throw identityError(IdentityErrors.socialProviderUnavailable);
      throw err;
    }
    const email = identity.email?.trim().toLowerCase() || null;

    // Two first sign-ins at once both try to create the link; the second then finds it.
    let outcome: Outcome;
    try {
      outcome = await this.dataSource.transaction((m) => this.resolve(m, input, identity, email));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      outcome = await this.dataSource.transaction((m) => this.resolve(m, input, identity, email));
    }
    if ('error' in outcome) throw identityError(outcome.error);

    const session = await this.sessions.start(this.dataSource.manager, outcome.user, input);
    return { user: toUserDto(outcome.user), isNewUser: outcome.isNewUser, session };
  }

  private async resolve(
    manager: EntityManager,
    input: SocialSignInRequest,
    identity: SocialIdentity,
    email: string | null,
  ): Promise<Outcome> {
    const link = await manager.findOneBy(Credential, {
      type: input.provider,
      providerSubject: identity.subject,
    });
    if (link) {
      const user = await manager.findOneBy(User, { id: link.userId });
      if (user) {
        if (user.status !== 'active') return { error: IdentityErrors.userSuspended };
        return { user, isNewUser: false };
      }
      // The account was deleted (its data waits for erasure): the link is retired, so the person
      // can start again.
      await manager.softDelete(Credential, { id: link.id });
    }

    const existing = email ? await manager.findOneBy(User, { email }) : null;
    if (existing?.emailVerifiedAt) {
      if (existing.status !== 'active') return { error: IdentityErrors.userSuspended };
      await this.link(manager, existing.id, input.provider, identity.subject);
      return { user: existing, isNewUser: false };
    }

    if (input.termsAccepted !== true) return { error: IdentityErrors.termsNotAccepted };
    const now = new Date();
    const preferredLanguage =
      input.preferredLanguage && isLocale(input.preferredLanguage)
        ? input.preferredLanguage
        : DEFAULT_LOCALE;
    const consent = {
      ...termsAcceptance(now),
      marketingConsentAt: input.marketingConsent === true ? now : null,
    };

    let user: User;
    if (existing) {
      // Registered by email but never confirmed: the provider has just confirmed who owns the
      // address, so the account is theirs, and the password someone set without confirming goes.
      await manager.delete(Credential, { userId: existing.id, type: 'password' });
      await manager.update(
        User,
        { id: existing.id },
        {
          emailVerifiedAt: now,
          name: existing.name ?? identity.name,
          preferredLanguage,
          ...consent,
        },
      );
      user = (await manager.findOneBy(User, { id: existing.id }))!;
    } else {
      user = await manager.save(
        manager.create(User, {
          email,
          emailVerifiedAt: email ? now : null,
          name: identity.name?.trim() || null,
          preferredLanguage,
          ...consent,
        }),
      );
    }
    await this.link(manager, user.id, input.provider, identity.subject);
    await this.outbox.enqueue(
      manager,
      'user.registered',
      { userId: user.id, ...(email ? { email } : {}), preferredLanguage: user.preferredLanguage },
      input.correlationId,
    );
    return { user, isNewUser: true };
  }

  private async link(
    manager: EntityManager,
    userId: string,
    provider: SocialProvider,
    subject: string,
  ): Promise<void> {
    // One link per provider and account: a newer Google account replaces an older one.
    await manager.softDelete(Credential, { userId, type: provider });
    await manager.insert(Credential, {
      userId,
      type: provider,
      providerSubject: subject,
      secretHash: null,
    });
  }
}
