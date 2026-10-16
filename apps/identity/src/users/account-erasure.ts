import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ACCOUNT_ERASURE_DAYS } from '@am/contracts';
import { Address, Credential, OtpChallenge, Session, ShopMember, User } from '../entities';

/** One-time codes are kept this long, for the resend limits and for support, then deleted. */
export const OTP_RETENTION_DAYS = 7;
const RUN_EVERY_MS = 60 * 60 * 1000;
const BATCH_SIZE = 100;

/**
 * Erases the personal data of accounts deleted ACCOUNT_ERASURE_DAYS ago: the user row keeps its
 * id, dates, roles and consent versions, and loses everything that identifies the person; their
 * sessions, sign-in methods, addresses, shop memberships and one-time codes are deleted. Also
 * deletes one-time codes older than OTP_RETENTION_DAYS for everyone.
 *
 * Runs hourly in every identity task; rows are claimed with SKIP LOCKED, so replicas share the
 * work instead of repeating it.
 */
export class AccountErasure implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountErasure.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly erasureDays = ACCOUNT_ERASURE_DAYS,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), RUN_EVERY_MS);
    // Housekeeping must never be what keeps a stopping process alive.
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns what it removed. Failures are logged and retried on the next pass. */
  async run(): Promise<{ erasedAccounts: number; removedCodes: number }> {
    try {
      let erasedAccounts = 0;
      for (;;) {
        const erased = await this.eraseBatch();
        erasedAccounts += erased;
        if (erased < BATCH_SIZE) break;
      }
      const removedCodes = await this.removeOldCodes();
      if (erasedAccounts > 0) this.logger.log(`Erased ${erasedAccounts} deleted accounts`);
      return { erasedAccounts, removedCodes };
    } catch (err) {
      this.logger.warn(`Account erasure failed, will retry: ${(err as Error).message}`);
      return { erasedAccounts: 0, removedCodes: 0 };
    }
  }

  private eraseBatch(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const due = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .withDeleted()
        .where('u.deleted_at IS NOT NULL')
        .andWhere('u.erased_at IS NULL')
        .andWhere('u.deleted_at < now() - make_interval(days => :days)', { days: this.erasureDays })
        .orderBy('u.deleted_at', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const user of due) await this.erase(manager, user);
      return due.length;
    });
  }

  private async erase(manager: EntityManager, user: User): Promise<void> {
    const targets = [user.phone, user.email].filter((t): t is string => Boolean(t));
    if (targets.length) await manager.delete(OtpChallenge, { target: In(targets) });
    for (const entity of [Session, Credential, Address, ShopMember]) {
      // Hard deletes: a soft-deleted row would still hold the data.
      await manager
        .createQueryBuilder()
        .delete()
        .from(entity)
        .where('user_id = :id', { id: user.id })
        .execute();
    }
    await manager
      .createQueryBuilder()
      .update(User)
      .set({
        phone: null,
        email: null,
        name: null,
        homeEmirate: null,
        avatarMediaId: null,
        marketingConsentAt: null,
        erasedAt: () => 'now()',
      })
      .where('id = :id', { id: user.id })
      .execute();
  }

  private async removeOldCodes(): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(OtpChallenge)
      .where('created_at < now() - make_interval(days => :days)', { days: OTP_RETENTION_DAYS })
      .execute();
    return result.affected ?? 0;
  }
}
