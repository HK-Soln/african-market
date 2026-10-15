import { DataSource } from 'typeorm';
import { AppRpcException } from '@am/core';
import {
  IdentityErrorCode,
  IdentityErrors,
  normalizePhone,
  phoneCountry,
  RequestOtpRequest,
  RequestOtpResponse,
  SessionTokens,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { DEFAULT_LOCALE, isLocale } from '@am/i18n';
import { ALLOW_EVERY_PHONE, PhoneCountryPolicy } from '../countries/countries.service';
import { User } from '../entities';
import { identityError } from '../errors';
import { SessionService } from '../sessions/session.service';
import { SmsProvider } from '../sms/sms-provider';
import { toUserDto } from '../users/user.mapper';
import { OtpChallenges } from './otp-challenges';
import { isOtpCodeFormat } from './otp-code';
import { otpMessage } from './otp-message';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpTestNumbers } from './otp-test-numbers';
import { DEFAULT_OTP_CHANNEL } from './otp.constants';

type VerifyOutcome =
  | { user: User; isNewUser: boolean; session: SessionTokens }
  | { error: IdentityErrorCode; details?: Record<string, unknown> };

/** Phone sign-up and sign-in by one-time code. */
export class OtpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly limiter: OtpRateLimiter,
    private readonly sms: SmsProvider,
    private readonly outbox: OutboxService,
    private readonly challenges: OtpChallenges,
    private readonly sessions: SessionService,
    private readonly testNumbers: OtpTestNumbers = OtpTestNumbers.none(),
    private readonly countries: PhoneCountryPolicy = ALLOW_EVERY_PHONE,
  ) {}

  /**
   * Sends a code to the phone. The response is the same whether or not an account exists, so
   * this cannot be used to discover who is registered.
   */
  async requestOtp(input: RequestOtpRequest): Promise<RequestOtpResponse> {
    const phone = this.requirePhone(input.phone);
    const { resendAfterSeconds } = await this.limiter.consume(phone, input.ip);
    const channel = input.channel ?? DEFAULT_OTP_CHANNEL;
    const testCode = this.testNumbers.codeFor(phone);

    const issued = await this.dataSource.transaction(async (manager) => {
      const isRegistered = await manager.existsBy(User, { phone });
      // Only new accounts: someone already registered keeps signing in if their country is
      // switched off later.
      if (!isRegistered && !(await this.countries.allowsNewPhone(phone))) {
        throw identityError(IdentityErrors.phoneCountryNotSupported, {
          country: phoneCountry(phone),
        });
      }
      // Only the newest code for a phone is ever valid.
      return this.challenges.issue(manager, {
        target: phone,
        channel,
        purpose: isRegistered ? 'login' : 'signup',
        supersede: ['signup', 'login'],
        code: testCode,
      });
    });

    // A test number's code is known to the test already: nothing is sent.
    if (testCode) {
      return { phone, channel, expiresAt: issued.expiresAt.toISOString(), resendAfterSeconds };
    }

    try {
      await this.sms.send({ to: phone, channel, body: otpMessage(issued.code, input.locale) });
    } catch (err) {
      await this.challenges.discard(this.dataSource.manager, issued.id);
      if (err instanceof AppRpcException) throw err;
      throw identityError(IdentityErrors.otpSendFailed);
    }

    return { phone, channel, expiresAt: issued.expiresAt.toISOString(), resendAfterSeconds };
  }

  /**
   * Checks a code. A correct code for an unknown phone creates the account and publishes
   * `user.registered` in the same transaction; for a known phone it signs the user in. Either
   * way a session starts.
   */
  async verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const phone = this.requirePhone(input.phone);
    if (!isOtpCodeFormat(input.code)) throw identityError(IdentityErrors.otpInvalid);

    // Failures are returned, not thrown, inside the transaction so that a wrong guess still
    // commits its attempt count.
    const outcome = await this.dataSource.transaction(async (manager): Promise<VerifyOutcome> => {
      const checked = await this.challenges.check(manager, {
        target: phone,
        purposes: ['signup', 'login'],
        code: input.code,
      });
      if ('error' in checked) return checked;

      const now = new Date();
      let user = await manager.findOneBy(User, { phone });
      let isNewUser = false;
      if (!user) {
        // Checked before the code is consumed, so the client can retry with consent given.
        if (input.termsAccepted !== true) return { error: IdentityErrors.termsNotAccepted };
        const preferredLanguage =
          input.preferredLanguage && isLocale(input.preferredLanguage)
            ? input.preferredLanguage
            : DEFAULT_LOCALE;
        const created = await manager.save(
          manager.create(User, {
            phone,
            preferredLanguage,
            phoneVerifiedAt: now,
            termsAcceptedAt: now,
            marketingConsentAt: input.marketingConsent === true ? now : null,
          }),
        );
        user = await manager.findOneByOrFail(User, { id: created.id });
        isNewUser = true;
        await this.outbox.enqueue(
          manager,
          'user.registered',
          { userId: user.id, phone, preferredLanguage },
          input.correlationId,
        );
      } else if (user.status !== 'active') {
        return { error: IdentityErrors.userSuspended };
      } else if (!user.phoneVerifiedAt) {
        user.phoneVerifiedAt = now;
        await manager.update(User, { id: user.id }, { phoneVerifiedAt: now });
      }

      await this.challenges.consume(manager, checked.challenge.id);
      return { user, isNewUser, session: await this.sessions.start(manager, user, input) };
    });

    if ('error' in outcome) throw identityError(outcome.error, outcome.details);
    return {
      user: toUserDto(outcome.user),
      isNewUser: outcome.isNewUser,
      session: outcome.session,
    };
  }

  private requirePhone(input: string): string {
    const phone = typeof input === 'string' ? normalizePhone(input) : null;
    if (!phone) throw identityError(IdentityErrors.phoneInvalid);
    return phone;
  }
}
