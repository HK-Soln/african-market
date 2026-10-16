import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Every time a private document was opened: who, when, and the request that asked. */
@Entity({ name: 'media_access_log' })
@Index('media_access_log_media_idx', ['mediaId', 'createdAt'])
export class MediaAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  mediaId!: string;

  @Column({ type: 'uuid' })
  actorId!: string;

  @Column({ type: 'text', nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
