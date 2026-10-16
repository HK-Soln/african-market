import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Whether customers can search an emirate yet (an admin's switch, F1-08). */
@Entity({ name: 'emirate_search' })
export class EmirateSearch {
  /** DXB, AUH, SHJ, AJM, UAQ, RAK, FUJ. */
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'PK_emirate_search' })
  code!: string;

  @Column({ type: 'boolean', default: false })
  searchOpen!: boolean;

  @Column({ type: 'uuid', nullable: true })
  changedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  changedAt!: Date | null;
}
