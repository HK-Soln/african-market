import { DataSource } from 'typeorm';
import {
  DiscoveryErrors,
  EmirateDto,
  EmirateList,
  ListEmiratesRequest,
  SetEmirateSearchRequest,
} from '@am/contracts';
import { AppRpcException } from '@am/core';
import { EMIRATES } from '@am/geo';
import { EmirateSearch } from '../entities';

const isAdmin = (actor?: { roles: string[] }) => Boolean(actor?.roles.includes('admin'));

/** The emirates and the switch that opens customer search in each. */
export class EmiratesService {
  constructor(private readonly dataSource: DataSource) {}

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
    await this.dataSource.manager.update(
      EmirateSearch,
      { code: input.code },
      { searchOpen: input.open, changedBy: input.actor.userId, changedAt: new Date() },
    );
    return this.list({ actor: input.actor });
  }
}
