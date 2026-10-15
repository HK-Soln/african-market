import { randomUUID } from 'node:crypto';
import { EntityManager, In, IsNull } from 'typeorm';
import { IdentityErrorCode, IdentityErrors } from '@am/contracts';
import { OtpChallenge, OtpChannel, OtpPurpose } from '../entities';
import { generateOtpCode, hashOtpCode, otpCodeMatches } from './otp-code';
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from './otp.constants';

export interface IssuedChallenge {
  id: string;
  /** The plain code, to hand to the sender. Never store or log it. */
  code: string;
  expiresAt: Date;
}

export type ChallengeCheck =
  { challenge: OtpChallenge } | { error: IdentityErrorCode; details?: Record<string, unknown> };

/**
 * Issues and checks one-time codes for a target (an E.164 phone or an email address). Shared by
 * phone sign-in, email verification and password reset, so the rules are the same everywhere:
 * only the newest code is valid, it lives five minutes, allows five wrong guesses and works once.
 */
export class OtpChallenges {
  constructor(private readonly hmacSecret: string) {}

  /** Cancels earlier unused codes for the target in `purposes`, then stores a new one. */
  async issue(
    manager: EntityManager,
    input: {
      target: string;
      channel: OtpChannel;
      purpose: OtpPurpose;
      supersede: OtpPurpose[];
      /** A test number's fixed code (OtpTestNumbers); a random one otherwise. */
      code?: string;
    },
  ): Promise<IssuedChallenge> {
    const id = randomUUID();
    const code = input.code ?? generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await manager.softDelete(OtpChallenge, {
      target: input.target,
      purpose: In(input.supersede),
      consumedAt: IsNull(),
    });
    await manager.insert(OtpChallenge, {
      id,
      target: input.target,
      channel: input.channel,
      purpose: input.purpose,
      codeHash: hashOtpCode(this.hmacSecret, id, code),
      expiresAt,
    });
    return { id, code, expiresAt };
  }

  /**
   * Checks a code against the newest unused challenge, holding a row lock so two attempts cannot
   * race. A wrong guess is counted here; the caller must let the transaction commit for the count
   * to stick, so failures are returned rather than thrown. The caller consumes the challenge once
   * everything else has succeeded.
   */
  async check(
    manager: EntityManager,
    input: { target: string; purposes: OtpPurpose[]; code: string },
  ): Promise<ChallengeCheck> {
    const challenge = await manager
      .getRepository(OtpChallenge)
      .createQueryBuilder('c')
      .where('c.target = :target', { target: input.target })
      .andWhere('c.purpose IN (:...purposes)', { purposes: input.purposes })
      .andWhere('c.consumed_at IS NULL')
      .orderBy('c.created_at', 'DESC')
      .setLock('pessimistic_write')
      .getOne();

    if (!challenge || challenge.expiresAt <= new Date())
      return { error: IdentityErrors.otpExpired };
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { error: IdentityErrors.otpTooManyAttempts };
    if (!otpCodeMatches(this.hmacSecret, challenge.id, input.code, challenge.codeHash)) {
      await manager.increment(OtpChallenge, { id: challenge.id }, 'attempts', 1);
      return {
        error: IdentityErrors.otpInvalid,
        details: { attemptsLeft: OTP_MAX_ATTEMPTS - challenge.attempts - 1 },
      };
    }
    return { challenge };
  }

  /** Counts a failed attempt that the caller detected after the code itself matched. */
  async recordFailure(manager: EntityManager, id: string): Promise<void> {
    await manager.increment(OtpChallenge, { id }, 'attempts', 1);
  }

  async consume(manager: EntityManager, id: string): Promise<void> {
    await manager.update(OtpChallenge, { id }, { consumedAt: new Date() });
  }

  /** Removes a code that could not be delivered, so it cannot be guessed at. */
  async discard(manager: EntityManager, id: string): Promise<void> {
    await manager.softDelete(OtpChallenge, { id });
  }
}
