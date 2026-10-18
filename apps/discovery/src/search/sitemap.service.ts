import { DataSource } from 'typeorm';
import {
  DiscoveryErrors,
  LocalizedString,
  SITEMAP_PAGE_MAX,
  SitemapPage,
  SitemapRequest,
} from '@am/contracts';
import { AppRpcException } from '@am/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The web sitemap's entries from the read model: only verified shops and their live products are
 * held here, so nothing else can leak into it. Pages by id (the cursor is the last id).
 */
export class SitemapService {
  constructor(private readonly dataSource: DataSource) {}

  async page(input: SitemapRequest): Promise<SitemapPage> {
    const limit = Math.min(input.limit ?? SITEMAP_PAGE_MAX, SITEMAP_PAGE_MAX);
    if (input.cursor !== undefined && !UUID.test(input.cursor)) {
      throw AppRpcException.badRequest(DiscoveryErrors.cursorInvalid, 'Invalid cursor');
    }
    const after = input.cursor ?? '00000000-0000-0000-0000-000000000000';

    if (input.kind === 'shops') {
      const rows: Array<{ id: string; slug: string; at: Date }> = await this.dataSource.query(
        `SELECT shop_id AS id, min(shop_slug) AS slug, max(updated_from_event_at) AS at
           FROM discovery.search_branch
          WHERE shop_id > $1
          GROUP BY shop_id
          ORDER BY shop_id
          LIMIT ${limit + 1}`,
        [after],
      );
      const page = rows.slice(0, limit);
      return {
        items: page.map((r) => ({ shopSlug: r.slug, updatedAt: new Date(r.at).toISOString() })),
        nextCursor: rows.length > limit ? page[page.length - 1].id : null,
      };
    }

    const rows: Array<{ id: string; slug: string; title: LocalizedString; at: Date }> =
      await this.dataSource.query(
        `SELECT p.product_id AS id, p.title, p.updated_from_event_at AS at,
                (SELECT b.shop_slug FROM discovery.search_branch b
                  WHERE b.shop_id = p.shop_id LIMIT 1) AS slug
           FROM discovery.search_product p
          WHERE p.product_id > $1
            AND EXISTS (SELECT 1 FROM discovery.search_branch b WHERE b.shop_id = p.shop_id)
          ORDER BY p.product_id
          LIMIT ${limit + 1}`,
        [after],
      );
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => ({
        shopSlug: r.slug,
        productId: r.id,
        title: r.title,
        updatedAt: new Date(r.at).toISOString(),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }
}
