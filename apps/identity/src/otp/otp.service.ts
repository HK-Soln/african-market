import { randomUUID } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import { AppRpcException } from '@am/core';
import {
  IdentityErrorCode,
  IdentityErrors,
  normalizePhone,
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { DEFAULT_LOCALE, isLocale } from '@am/i18n';
import { OtpChallenge, User } from '../entities';
import { SmsProvider } from '../sms/sms-provider';
import { toUserDto } from '../users/user.mapper';
import { generateOtpCode, hashOtpCode, isOtpCodeFormat, otpCodeMatches } from './otp-code';
import { otpMessage } from './otp-message';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS } from './otp.constants';

type VerifyOutcome =
  | { user: User; isNewUser: boolean }
  | { error: IdentityErrorCode; details?: Record<string, unknown> };

const ERROR_STATUS: Partial<Record<IdentityErrorCode, number>> = {
  [IdentityErrors.otpTooManyAttempts]: 429,
  [IdentityErrors.userSuspended]: 403,
};

const ERROR_MESSAGE: Partial<Record<IdentityErrorCode, string>> = {
  [IdentityErrors.otpInvalid]: 'That code did not match',
  [IdentityErrors.otpExpired]: 'That code has expired or was already used',
  [IdentityErrors.otpTooManyAttempts]: 'Too many wrong codes; request a new one',
  [IdentityErrors.termsNotAccepted]: 'The terms must be accepted to create an account',
  [IdentityErrors.userSuspended]: 'This account is suspended',
};

/** Phone sign-up and sign-in by one-time code. */
export class OtpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly limiter: OtpRateLimiter,
    private readonly sms: SmsProvider,
    private readonly outbox: OutboxService,
    private readonly hmacSecret: string,
  ) {}

  /**
   * Sends a code to the phone. The response is the same whether or not an account exists, so
   * this cannot be used to discover who is registered.
   */
  async requestOtp(input: RequestOtpRequest): Promise<RequestOtpResponse> {
    const phone = this.requirePhone(input.phone);
    await this.limiter.consume(phone, input.ip);

    const channel = input.channel ?? 'sms';
    const id = randomUUID();
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.dataSource.transaction(async (manager) => {
      const isRegistered = await manager.existsBy(User, { phone });
      // Only the newest code for a phone is ever valid.
      await manager.softDelete(OtpChallenge, { target: phone, consumedAt: IsNull() });
      await manager.insert(OtpChallenge, {
        id,
        target: phone,
        channel,
        purpose: isRegistered ? 'login' : 'signup',
        codeHash: hashOtpCode(this.hmacSecret, id, code),
        expiresAt,
      });
    });

    try {
      await this.sms.send({ to: phone, channel, body: otpMessage(code, input.locale) });
    } catch (err) {
      await this.dataSource.getRepository(OtpChallenge).softDelete(id);
      if (err instanceof AppRpcException) throw err;
      throw new AppRpcException({
        status: 502,
        code: IdentityErrors.otpSendFailed,
        message: 'The code could not be sent',
      });
    }

    return {
      phone,
      channel,
      expiresAt: expiresAt.toISOString(),
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Checks a code. A correct code for an unknown phone creates the account and publishes
   * `user.registered` in the same transaction; for a known phone it signs the user in.
   */
  async verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const phone = this.requirePhone(input.phone);
    if (!isOtpCodeFormat(input.code)) throw this.error(IdentityErrors.otpInvalid);

    // Failures are returned, not thrown, inside the transaction so that a wrong guess still
    // commits its attempt count.
    const outcome = await this.dataSource.transaction(async (manager): Promise<VerifyOutcome> => {
      const now = new Date();
      const challenge = await manager
        .getRepository(OtpChallenge)
        .createQueryBuilder('c')
        .where('c.target = :phone', { phone })
        .andWhere('c.consumed_at IS NULL')
        .orderBy('c.created_at', 'DESC')
        .setLock('pessimistic_write')
        .getOne();

      if (!challenge || challenge.expiresAt <= now) return { error: IdentityErrors.otpExpired };
      if (challenge.attempts >= OTP_MAX_ATTEMPTS)
        return { error: IdentityErrors.otpTooManyAttempts };
      if (!otpCodeMatches(this.hmacSecret, challenge.id, input.code, challenge.codeHash)) {
        await manager.increment(OtpChallenge, { id: challenge.id }, 'attempts', 1);
        return {
          error: IdentityErrors.otpInvalid,
          details: { attemptsLeft: OTP_MAX_ATTEMPTS - challenge.attempts - 1 },
        };
      }

      let user = await manager.findOneBy(User, { phone });
      let isNewUser = false;
      if (!user) {
        // Checked before the code is consumed, so the client can retry with consent given.
        if (input.termsAccepted !== true) return { error: IdentityErrors.termsNotAccepted };
        const preferredLanguage =
          input.preferredLanguage && isLocale(input.preferredLanguage)
            ? input.preferredLanguage
            : DEFAULT_LOCALE;
        user = await manager.save(
          manager.create(User, {
            phone,
            preferredLanguage,
            phoneVerifiedAt: now,
            termsAcceptedAt: now,
            marketingConsentAt: input.marketingConsent === true ? now : null,
          }),
        );
        user = await manager.findOneByOrFail(User, { id: user.id });
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

      await manager.update(OtpChallenge, { id: challenge.id }, { consumedAt: now });
      return { user, isNewUser };
    });

    if ('error' in outcome) throw this.error(outcome.error, outcome.details);
    return { user: toUserDto(outcome.user), isNewUser: outcome.isNewUser };
  }

  private requirePhone(input: string): string {
    const phone = typeof input === 'string' ? normalizePhone(input) : null;
    if (!phone)
      throw AppRpcException.badRequest(IdentityErrors.phoneInvalid, 'Enter a valid phone number');
    return phone;
  }

  private error(code: IdentityErrorCode, details?: Record<string, unknown>): AppRpcException {
    return new AppRpcException({
      status: ERROR_STATUS[code] ?? 400,
      code,
      message: ERROR_MESSAGE[code] ?? 'Request failed',
      details,
    });
  }
}
