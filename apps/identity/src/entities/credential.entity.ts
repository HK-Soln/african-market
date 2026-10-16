import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@am/database';
import { User } from './user.entity';

export const CREDENTIAL_TYPES = ['password', 'google', 'facebook', 'apple'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

/**
 * A way to prove who a user is. `password` rows carry `secret_hash` (argon2id); social rows carry
 * the provider's stable subject id. OTP sign-in needs no credential row.
 */
@Entity({ name: 'credential' })
@Index('credential_provider_subject_uq', ['type', 'providerSubject'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('credential_user_type_uq', ['userId', 'type'], { unique: true, where: 'deleted_at IS NULL' })
@Check('credential_type_chk', `type IN ('password', 'google', 'facebook', 'apple')`)
@Check(
  'credential_secret_chk',
  `(type = 'password' AND secret_hash IS NOT NULL AND provider_subject IS NULL) OR (type <> 'password' AND provider_subject IS NOT NULL AND secret_hash IS NULL)`,
)
export class Credential extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'text' })
  type!: CredentialType;

  @Column({ type: 'text', nullable: true })
  secretHash!: string | null;

  @Column({ type: 'text', nullable: true })
  providerSubject!: string | null;
}
