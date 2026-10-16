import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { LocalizedString } from '@am/contracts';
import { AppBaseEntity } from '@am/database';
import { Branch } from './branch.entity';

/** A date that differs from the weekly schedule: closed for Eid, open late in Ramadan. */
@Entity({ name: 'special_hours' })
@Index('special_hours_branch_date_uq', ['branchId', 'date'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Check(
  'special_hours_times_chk',
  `closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)`,
)
export class SpecialHours extends AppBaseEntity {
  @Column({ type: 'uuid' })
  branchId!: string;

  @ManyToOne(() => Branch, (branch) => branch.specialHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch?: Branch;

  /** `YYYY-MM-DD`, Asia/Dubai. */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'boolean', default: false })
  closed!: boolean;

  @Column({ type: 'time', nullable: true })
  opensAt!: string | null;

  @Column({ type: 'time', nullable: true })
  closesAt!: string | null;

  /** What the day is, shown to customers ("Eid al-Fitr"). */
  @Column({ type: 'jsonb', nullable: true })
  label!: LocalizedString | null;
}
