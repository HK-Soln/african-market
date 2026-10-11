import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AppRpcException } from '@am/core';
import {
  AuthenticatedUserResponse,
  EmailCodeResponse,
  IdentityErrorCode,
  IdentityErrors,
  LoginWithPasswordRequest,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RegisterWithEmailRequest,
  RequestPasswordResetRequest,
  ResendEmailCodeRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  VerifyOtpResponse,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { DEFAULT_LOCALE, isLocale } from '@am/i18n';
import { EmailMessage, EmailProvider } from '../email/email-provider';
import {
  alreadyRegisteredEmail,
  passwordResetEmail,
  verificationEmail,
} from '../email/email-templates';
import { Credential, Session, User } from '../entities';
import { identityError } from '../errors';
import { IssuedChallenge, OtpChallenges } from '../otp/otp-challenges';
import { isOtpCodeFormat } from '../otp/otp-code';
import { OtpRateLimiter } from '../otp/otp-rate-limiter';
import { OTP_TTL_SECONDS } from '../otp/otp.constants';
import { LoginRateLimiter } from '../password/login-rate-limiter';
import {
  burnPasswordCheck,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from '../password/password-hasher';
import { toUserDto } from '../users/user.mapper';

type Outcome<T> = T | { error: IdentityErrorCode; details?: Record<string, unknown> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cased and trimmed, or null when it is not an email address. */
export function normalizeEmail(input: string): string | null {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Register, verify, sign in and reset a password with an email address. */
export class EmailAuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly codeLimiter: OtpRateLimiter,
    private readonly loginLimiter: LoginRateLimiter,
    private readonly email: EmailProvider,
    private readonly outbox: OutboxService,
    private readonly challenges: OtpChallenges,
  ) {}

  /**
   * Creates an unverified account and emails a code. The account cannot sign in until the code
   * is confirmed. If the address already has a verified account, nothing changes and its owner
   * is told by email; the response is identical either way.
   */
  async register(input: RegisterWithEmailRequest): Promise<EmailCodeResponse> {
    const email = this.requireEmail(input.email);
    this.requirePassword(input.password);
    if (input.termsAccepted !== true) throw identityError(IdentityErrors.termsNotAccepted);
    const { resendAfterSeconds } = await this.codeLimiter.consume(email, input.ip, 'email-verify');
    const secretHash = await hashPassword(input.password);
    const preferredLanguage =
      input.preferredLanguage && isLocale(input.preferredLanguage)
        ? input.preferredLanguage
        : DEFAULT_LOCALE;
    const name = input.name?.trim() || null;

    const issued = await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      let user = await manager.findOneBy(User, { email });
      if (user?.emailVerifiedAt) return null;
      if (!user) {
        user = await manager.save(
          manager.create(User, {
            email,
            name,
            preferredLanguage,
            termsAcceptedAt: now,
            marketingConsentAt: input.marketingConsent === true ? now : null,
          }),
        );
      } else {
        // Registered before but never verified: whoever confirms the code owns the account, so
        // the newest details and password win.
        await manager.update(
          User,
          { id: user.id },
          {
            name,
            preferredLanguage,
            termsAcceptedAt: now,
            marketingConsentAt: input.marketingConsent === true ? now : null,
          },
        );
      }
      await this.setPassword(manager, user.id, secretHash);
      return this.challenges.issue(manager, {
        target: email,
        channel: 'email',
        purpose: 'signup',
        supersede: ['signup'],
      });
    });

    await this.deliver(
      issued
        ? verificationEmail(email, issued.code, input.locale ?? preferredLanguage)
        : alreadyRegisteredEmail(email, input.locale),
      issued,
    );
    return this.codeResponse(email, issued, resendAfterSeconds);
  }

  /** Sends a fresh verification code to an address that registered but has not confirmed it. */
  async resendCode(input: ResendEmailCodeRequest): Promise<EmailCodeResponse> {
    const email = this.requireEmail(input.email);
    const { resendAfterSeconds } = await this.codeLimiter.consume(email, input.ip, 'email-verify');

    const issued = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOneBy(User, { email });
      if (!user || user.emailVerifiedAt) return null;
      return this.challenges.issue(manager, {
        target: email,
        channel: 'email',
        purpose: 'signup',
        supersede: ['signup'],
      });
    });

    if (issued) await this.deliver(verificationEmail(email, issued.code, input.locale), issued);
    return this.codeResponse(email, issued, resendAfterSeconds);
  }

  /**
   * Confirms the address with the emailed code and the password chosen at registration. The
   * account becomes real here, so `user.registered` is published.
   */
  async verifyEmail(input: VerifyEmailRequest): Promise<VerifyOtpResponse> {
    const email = this.requireEmail(input.email);
    if (!isOtpCodeFormat(input.code)) throw identityError(IdentityErrors.otpInvalid);
    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
      throw identityError(IdentityErrors.invalidCredentials);
    }

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<Outcome<{ user: User; isNewUser: boolean }>> => {
        const checked = await this.challenges.check(manager, {
          target: email,
          purposes: ['signup'],
          code: input.code,
        });
        if ('error' in checked) return checked;

        const user = await manager.findOneBy(User, { email });
        if (!user) return { error: IdentityErrors.otpExpired };
        if (user.status !== 'active') return { error: IdentityErrors.userSuspended };

        // The code proves who reads the inbox; the password proves this is the registration
        // that person made. A mismatch counts as a failed attempt and leaves the code unused.
        const credential = await manager.findOneBy(Credential, {
          userId: user.id,
          type: 'password',
        });
        if (!credential?.secretHash || !(await verifyPassword(credential.secretHash, password))) {
          await this.challenges.recordFailure(manager, checked.challenge.id);
          return { error: IdentityErrors.invalidCredentials };
        }

        const isNewUser = !user.emailVerifiedAt;
        if (isNewUser) {
          user.emailVerifiedAt = new Date();
          await manager.update(User, { id: user.id }, { emailVerifiedAt: user.emailVerifiedAt });
          await this.outbox.enqueue(
            manager,
            'user.registered',
            { userId: user.id, email, preferredLanguage: user.preferredLanguage },
            input.correlationId,
          );
        }
        await this.challenges.consume(manager, checked.challenge.id);
        return { user, isNewUser };
      },
    );

    if ('error' in outcome) throw identityError(outcome.error, outcome.details);
    return { user: toUserDto(outcome.user), isNewUser: outcome.isNewUser };
  }

  /**
   * Signs in with an email and password. A wrong email and a wrong password give the same
   * answer in the same time. An unverified address is only revealed after the right password.
   */
  async login(input: LoginWithPasswordRequest): Promise<AuthenticatedUserResponse> {
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
      throw identityError(IdentityErrors.invalidCredentials);
    }
    await this.loginLimiter.assertAllowed(email, input.ip);

    const user = await this.dataSource.manager.findOneBy(User, { email });
    const credential = user
      ? await this.dataSource.manager.findOneBy(Credential, { userId: user.id, type: 'password' })
      : null;

    if (!user || !credential?.secretHash) {
      await burnPasswordCheck(password);
      await this.loginLimiter.recordFailure(email, input.ip);
      throw identityError(IdentityErrors.invalidCredentials);
    }
    if (!(await verifyPassword(credential.secretHash, password))) {
      await this.loginLimiter.recordFailure(email, input.ip);
      throw identityError(IdentityErrors.invalidCredentials);
    }
    if (user.status !== 'active') throw identityError(IdentityErrors.userSuspended);
    if (!user.emailVerifiedAt) throw identityError(IdentityErrors.emailNotVerified);

    await this.loginLimiter.reset(email);
    if (passwordNeedsRehash(credential.secretHash)) {
      await this.dataSource.manager.update(
        Credential,
        { id: credential.id },
        { secretHash: await hashPassword(password) },
      );
    }
    return { user: toUserDto(user) };
  }

  /**
   * Emails a reset code to a verified account. The response is identical when there is no such
   * account, so this cannot be used to find out who is registered.
   */
  async requestPasswordReset(input: RequestPasswordResetRequest): Promise<EmailCodeResponse> {
    const email = this.requireEmail(input.email);
    const { resendAfterSeconds } = await this.codeLimiter.consume(email, input.ip, 'email-reset');

    const result = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOneBy(User, { email });
      if (!user || !user.emailVerifiedAt || user.status !== 'active') return null;
      const issued = await this.challenges.issue(manager, {
        target: email,
        channel: 'email',
        purpose: 'reset',
        supersede: ['reset'],
      });
      return { issued, locale: input.locale ?? user.preferredLanguage };
    });

    if (result) {
      await this.deliver(
        passwordResetEmail(email, result.issued.code, result.locale),
        result.issued,
      );
    }
    return this.codeResponse(email, result?.issued ?? null, resendAfterSeconds);
  }

  /** Sets a new password with the emailed code and signs every existing session out. */
  async resetPassword(input: ResetPasswordRequest): Promise<AuthenticatedUserResponse> {
    const email = this.requireEmail(input.email);
    if (!isOtpCodeFormat(input.code)) throw identityError(IdentityErrors.otpInvalid);
    this.requirePassword(input.newPassword);
    const secretHash = await hashPassword(input.newPassword);

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<Outcome<{ user: User }>> => {
        const checked = await this.challenges.check(manager, {
          target: email,
          purposes: ['reset'],
          code: input.code,
        });
        if ('error' in checked) return checked;

        const user = await manager.findOneBy(User, { email });
        if (!user) return { error: IdentityErrors.otpExpired };
        if (user.status !== 'active') return { error: IdentityErrors.userSuspended };

        await this.setPassword(manager, user.id, secretHash);
        // Whoever knew the old password, or held a stolen session, is signed out.
        await manager.update(
          Session,
          { userId: user.id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        await this.challenges.consume(manager, checked.challenge.id);
        return { user };
      },
    );

    if ('error' in outcome) throw identityError(outcome.error, outcome.details);
    await this.loginLimiter.reset(email);
    return { user: toUserDto(outcome.user) };
  }

  private async setPassword(
    manager: EntityManager,
    userId: string,
    secretHash: string,
  ): Promise<void> {
    const existing = await manager.findOneBy(Credential, { userId, type: 'password' });
    if (existing) await manager.update(Credential, { id: existing.id }, { secretHash });
    else await manager.insert(Credential, { userId, type: 'password', secretHash });
  }

  /** Sends the email; if that fails, the code it carried is cancelled so it cannot be guessed at. */
  private async deliver(message: EmailMessage, issued: IssuedChallenge | null): Promise<void> {
    try {
      await this.email.send(message);
    } catch (err) {
      if (issued) await this.challenges.discard(this.dataSource.manager, issued.id);
      if (err instanceof AppRpcException) throw err;
      throw identityError(IdentityErrors.emailSendFailed);
    }
  }

  private codeResponse(
    email: string,
    issued: IssuedChallenge | null,
    resendAfterSeconds: number,
  ): EmailCodeResponse {
    // With no code issued, the expiry is what a real one would have been, so the answers match.
    const expiresAt = issued?.expiresAt ?? new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    return { email, expiresAt: expiresAt.toISOString(), resendAfterSeconds };
  }

  private requireEmail(input: string): string {
    const email = normalizeEmail(input);
    if (!email) throw identityError(IdentityErrors.emailInvalid);
    return email;
  }

  private requirePassword(password: string): void {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      throw identityError(IdentityErrors.passwordTooShort, { minLength: PASSWORD_MIN_LENGTH });
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw identityError(IdentityErrors.passwordTooLong, { maxLength: PASSWORD_MAX_LENGTH });
    }
  }
}
