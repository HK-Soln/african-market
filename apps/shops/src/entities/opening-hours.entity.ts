import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@am/database';
import { Branch } from './branch.entity';

/**
 * One opening period in the weekly schedule, Asia/Dubai time. 0 is Sunday. A day can have several
 * periods (a lunch break). A closing time earlier than the opening means it runs past midnight.
 */
@Entity({ name: 'opening_hours' })
@Index('opening_hours_branch_idx', ['branchId', 'weekday'])
@Check('opening_hours_weekday_chk', `weekday BETWEEN 0 AND 6`)
@Check('opening_hours_span_chk', `opens_at <> closes_at`)
export class OpeningHours extends AppBaseEntity {
  @Column({ type: 'uuid' })
  branchId!: string;

  @ManyToOne(() => Branch, (branch) => branch.openingHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  @Column({ type: 'smallint' })
  weekday!: number;

  /** `HH:MM:SS` as Postgres returns it. */
  @Column({ type: 'time' })
  opensAt!: string;

  @Column({ type: 'time' })
  closesAt!: string;
}
