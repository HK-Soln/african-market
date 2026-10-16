import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@am/database';
import { User } from './user.entity';

/**
 * One refresh token. Tokens rotate on every use: the old row gets `replaced_by` and a new row is
 * created in the same `family_id`. Presenting a token that was already replaced means it leaked,
 * and the whole family is revoked.
 */
@Entity({ name: 'session' })
@Index('session_refresh_token_hash_uq', ['refreshTokenHash'], { unique: true })
@Index('session_family_idx', ['familyId'])
@Index('session_user_idx', ['userId'])
export class Session extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid' })
  familyId!: string;

  /** Hash of the opaque refresh token; the token itself is never stored. */
  @Column({ type: 'text' })
  refreshTokenHash!: string;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /** When the person signed in to start this family; copied on every rotation. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  authenticatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** Id of the session that replaced this one on rotation. */
  @Column({ type: 'uuid', nullable: true })
  replacedBy!: string | null;
}
