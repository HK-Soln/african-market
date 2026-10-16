import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  CONTACT_CHANNELS,
  CONTACT_DEDUP_MINUTES,
  ContactErrors,
  ContactStatsDto,
  ContactStatsRequest,
  RecordContactRequest,
  RecordContactResponse,
} from '@am/contracts';
import { AppRpcException } from '@am/core';
import { Branch, ContactEvent, Shop } from '../entities';
import { requireEditor } from '../shops/access';

/** Partitions made ahead of time: this month and the next three. */
export const PARTITION_MONTHS_AHEAD = 3;

const notFound = () => AppRpcException.notFound(ContactErrors.shopNotFound, 'No such shop');

/** `YYYY-MM-DD` in Asia/Dubai (UTC+4 all year). */
const dubaiDate = (at: Date) => new Date(at.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);

export class ContactService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * A tap on a public shop. Repeats by the same visitor on the same shop and channel within
   * CONTACT_DEDUP_MINUTES are not counted again; concurrent repeats wait on one lock, so only one
   * of them is.
   */
  async record(input: RecordContactRequest): Promise<RecordContactResponse> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await manager.findOneBy(Shop, {
        id: input.shopId,
        verificationStatus: 'verified',
      });
      if (!shop) throw notFound();
      if (input.branchId) {
        const branch = await manager.findOneBy(Branch, { id: input.branchId, shopId: shop.id });
        if (!branch) throw notFound();
      }
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `contact:${input.sessionId}:${shop.id}:${input.channel}`,
      ]);
      const since = new Date(this.now().getTime() - CONTACT_DEDUP_MINUTES * 60_000);
      const [repeat] = await manager.query(
        `SELECT 1 FROM shops.contact_event
          WHERE session_id = $1 AND shop_id = $2 AND channel = $3 AND created_at > $4 LIMIT 1`,
        [input.sessionId, shop.id, input.channel, since],
      );
      if (repeat) return { recorded: false };
      await manager.insert(ContactEvent, {
        id: randomUUID(),
        createdAt: this.now(),
        shopId: shop.id,
        branchId: input.branchId ?? null,
        productId: input.productId ?? null,
        channel: input.channel,
        userId: input.userId ?? null,
        sessionId: input.sessionId,
        sourcePage: input.sourcePage ?? null,
      });
      return { recorded: true };
    });
  }

  /** The shop's taps over the last `days` Dubai days, today included. */
  async stats(input: ContactStatsRequest): Promise<ContactStatsDto> {
    const manager = this.dataSource.manager;
    const shop = await manager.findOneBy(Shop, { id: input.shopId });
    if (!shop) throw notFound();
    requireEditor(input.actor, shop);

    const today = dubaiDate(this.now());
    const fromDate = new Date(`${today}T00:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - (input.days - 1));
    const from = fromDate.toISOString().slice(0, 10);
    // Midnight in Dubai is 20:00 UTC the day before.
    const since = new Date(`${from}T00:00:00+04:00`);

    const rows: Array<{ day: string; channel: string; n: number }> = await manager.query(
      `SELECT to_char(created_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day, channel, count(*)::int AS n
         FROM shops.contact_event WHERE shop_id = $1 AND created_at >= $2
        GROUP BY 1, 2`,
      [shop.id, since],
    );
    const products: Array<{ product_id: string; n: number }> = await manager.query(
      `SELECT product_id, count(*)::int AS n FROM shops.contact_event
        WHERE shop_id = $1 AND created_at >= $2 AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY n DESC, product_id LIMIT 20`,
      [shop.id, since],
    );

    const zero = () => ({ whatsapp: 0, call: 0, email: 0 });
    const byDay = new Map<string, ReturnType<typeof zero>>();
    for (let d = new Date(fromDate); isoDay(d) <= today; d.setUTCDate(d.getUTCDate() + 1))
      byDay.set(isoDay(d), zero());
    const byChannel = zero();
    for (const r of rows) {
      const channel = r.channel as (typeof CONTACT_CHANNELS)[number];
      const day = byDay.get(r.day);
      if (day) day[channel] += r.n;
      byChannel[channel] += r.n;
    }
    return {
      shopId: shop.id,
      days: input.days,
      from,
      to: today,
      total: byChannel.whatsapp + byChannel.call + byChannel.email,
      byChannel,
      byDay: [...byDay].map(([date, counts]) => ({ date, ...counts })),
      byProduct: products.map((p) => ({ productId: p.product_id, count: p.n })),
    };
  }

  /** A deleted account's taps stay counted for the shop, without the person (T-23). */
  async forgetUser(userId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE shops.contact_event SET user_id = NULL WHERE user_id = $1`,
      [userId],
    );
  }

  ensurePartitions(): Promise<number> {
    return this.dataSource
      .query(`SELECT shops.ensure_contact_partitions($1) AS made`, [PARTITION_MONTHS_AHEAD])
      .then(([row]: Array<{ made: number }>) => row.made);
  }
}

/** The calendar day a UTC-midnight date stands for. */
const isoDay = (utcMidnight: Date) => utcMidnight.toISOString().slice(0, 10);
