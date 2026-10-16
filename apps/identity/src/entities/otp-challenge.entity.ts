import { Check, Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@am/database';

export const OTP_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

export const OTP_PURPOSES = ['signup', 'login', 'verify', 'reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/**
 * One issued one-time code. Only the hash is stored; the code itself is never persisted or logged.
 * `target` is the E.164 phone or the email the code was sent to, so a challenge can exist before
 * the user does (sign-up).
 */
@Entity({ name: 'otp_challenge' })
@Index('otp_challenge_target_idx', ['target', 'purpose', 'createdAt'])
@Index('otp_challenge_created_idx', ['createdAt'])
@Check('otp_challenge_channel_chk', `channel IN ('sms', 'whatsapp', 'email')`)
@Check('otp_challenge_purpose_chk', `purpose IN ('signup', 'login', 'verify', 'reset')`)
@Check('otp_challenge_attempts_chk', `attempts >= 0`)
export class OtpChallenge extends AppBaseEntity {
  @Column({ type: 'citext' })
  target!: string;

  @Column({ type: 'text' })
  channel!: OtpChannel;

  @Column({ type: 'text' })
  purpose!: OtpPurpose;

  @Column({ type: 'text' })
  codeHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
