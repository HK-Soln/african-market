import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { MediaObject } from '../entities';
import { CdnPurger } from '../storage/cdn';
import { ObjectStore } from '../storage/object-store';

const RUN_EVERY_MS = 60 * 60 * 1000;
const BATCH_SIZE = 200;

/** Unconfirmed uploads are given up after this long; their quarantined file goes too. */
export const PENDING_RETENTION = '1 day';
/** A stored object nothing uses is deleted after this long (it was uploaded, never attached). */
export const UNATTACHED_RETENTION = '24 hours';
/** An object that stopped being used is deleted after this long. */
export const DETACHED_RETENTION = '7 days';

/**
 * Deletes what nobody uses: stored files go from the buckets (and public ones from the CDN), the
 * row stays as `deleted` for the record. Runs hourly in every media task; rows are claimed with
 * SKIP LOCKED so replicas share the work.
 */
export class MediaCleanup implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanup.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly store: ObjectStore,
    private readonly cdn: CdnPurger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), RUN_EVERY_MS);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns how many objects it deleted. Failures are logged and retried next hour. */
  async run(): Promise<number> {
    try {
      let total = 0;
      for (;;) {
        const removed = await this.removeBatch(
          `(m.status = 'pending' AND m.created_at < now() - interval '${PENDING_RETENTION}')
           OR (m.status = 'ready' AND m.attached_id IS NULL AND m.detached_at IS NULL
               AND m.created_at < now() - interval '${UNATTACHED_RETENTION}')
           OR (m.status = 'ready' AND m.attached_id IS NULL
               AND m.detached_at < now() - interval '${DETACHED_RETENTION}')`,
        );
        total += removed;
        if (removed < BATCH_SIZE) break;
      }
      if (total > 0) this.logger.log(`Deleted ${total} unused media objects`);
      return total;
    } catch (err) {
      this.logger.warn(`Media cleanup failed, will retry: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Deletes a person's objects at once when their account is deleted: their avatar and anything
   * they uploaded that is not in use. What a shop uses belongs to the shop and leaves with it.
   */
  async removeForUser(userId: string): Promise<number> {
    return this.removeBatch(
      `m.owner_id = :userId AND m.status IN ('pending', 'ready')
       AND (m.purpose = 'avatar' OR m.attached_id IS NULL)`,
      { userId },
      Number.MAX_SAFE_INTEGER,
    );
  }

  private removeBatch(
    where: string,
    params: Record<string, unknown> = {},
    limit = BATCH_SIZE,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const due = await manager
        .getRepository(MediaObject)
        .createQueryBuilder('m')
        .where(`(${where})`, params)
        .orderBy('m.created_at', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      if (due.length === 0) return 0;
      await this.removeFiles(due);
      await this.markDeleted(manager, due);
      return due.length;
    });
  }

  private async removeFiles(objects: MediaObject[]): Promise<void> {
    const publicKeys: string[] = [];
    const privateKeys: string[] = [];
    for (const object of objects) {
      for (const file of Object.values(object.files)) {
        if (!file) continue;
        (object.visibility === 'public' ? publicKeys : privateKeys).push(file.key);
      }
    }
    await this.store.remove(
      'uploads',
      objects.filter((o) => o.status === 'pending').map((o) => o.id),
    );
    await this.store.remove('public', publicKeys);
    await this.store.remove('private', privateKeys);
    if (publicKeys.length) await this.cdn.purge(publicKeys);
  }

  private async markDeleted(manager: EntityManager, objects: MediaObject[]): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(MediaObject)
      .set({
        status: 'deleted',
        files: {},
        attachedType: null,
        attachedId: null,
        deletedAt: () => 'now()',
      })
      .whereInIds(objects.map((o) => o.id))
      .execute();
  }
}
