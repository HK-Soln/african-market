import { DataSource } from 'typeorm';
import {
  ActorClaims,
  DiscoveryErrors,
  EmirateDto,
  EmirateList,
  ListEmiratesRequest,
  RebuildSearchResponse,
  SetEmirateSearchRequest,
} from '@am/contracts';
import { AppRpcException } from '@am/core';
import { OutboxService } from '@am/database';
import { EMIRATES } from '@am/geo';
import { EmirateSearch } from '../entities';

const isAdmin = (actor?: { roles: string[] }) => Boolean(actor?.roles.includes('admin'));

/**
 * The emirates and the switch that opens customer search in each, and the admin audit log
 * entries (decision T-42) for discovery's admin actions.
 */
export class EmiratesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async list(input: ListEmiratesRequest): Promise<EmirateList> {
    const settings = new Map(
      (await this.dataSource.manager.find(EmirateSearch)).map((s) => [s.code, s.searchOpen]),
    );
    const counts = new Map<string, { shops: number; branches: number }>();
    if (isAdmin(input.actor)) {
      const rows: Array<{ emirate: string; shops: number; branches: number }> =
        await this.dataSource.query(
          `SELECT emirate, count(DISTINCT shop_id)::int AS shops, count(*)::int AS branches
             FROM discovery.search_branch GROUP BY emirate`,
        );
      for (const r of rows) counts.set(r.emirate, { shops: r.shops, branches: r.branches });
    }
    return {
      items: EMIRATES.map((e): EmirateDto => ({
        code: e.code,
        slug: e.slug,
        name: { ...e.name },
        center: { ...e.center },
        searchOpen: settings.get(e.code) ?? false,
        verifiedShops: isAdmin(input.actor) ? (counts.get(e.code)?.shops ?? 0) : null,
        branches: isAdmin(input.actor) ? (counts.get(e.code)?.branches ?? 0) : null,
      })),
    };
  }

  async setSearch(input: SetEmirateSearchRequest): Promise<EmirateList> {
    if (!isAdmin(input.actor))
      throw AppRpcException.forbidden(DiscoveryErrors.adminOnly, 'Only an admin can do this');
    if (!EMIRATES.some((e) => e.code === input.code))
      throw AppRpcException.badRequest(DiscoveryErrors.validationFailed, 'No such emirate');
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        EmirateSearch,
        { code: input.code },
        { searchOpen: input.open, changedBy: input.actor.userId, changedAt: new Date() },
      );
      await this.outbox.enqueue(
        manager,
        'audit.recorded',
        {
          actorId: input.actor.userId,
          action: input.open ? 'emirate.search_opened' : 'emirate.search_closed',
          subjectType: 'emirate',
          subjectId: input.code,
          shopId: null,
          details: {},
        },
        input.correlationId,
      );
    });
    return this.list({ actor: input.actor });
  }

  /** A finished rebuild of the search index, on the audit log. */
  async recordRebuild(
    actor: ActorClaims,
    result: RebuildSearchResponse,
    correlationId?: string,
  ): Promise<void> {
    await this.outbox.enqueue(
      this.dataSource.manager,
      'audit.recorded',
      {
        actorId: actor.userId,
        action: 'search.rebuilt',
        subjectType: 'search',
        subjectId: 'index',
        shopId: null,
        details: { ...result },
      },
      correlationId,
    );
  }
}
