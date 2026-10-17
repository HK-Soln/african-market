import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CategoryDto,
  EventPayloads,
  ProductSearchSnapshot,
  RebuildSearchResponse,
  ShopSearchSnapshot,
} from '@am/contracts';
import { SearchOwners } from './owners';

/** The text search configuration made by the migration: simple tokens, accents dropped. */
const TS = 'discovery.am_simple';
/** Every language of a LocalizedString column, as one text. */
const allLanguages = (column: string) =>
  `concat_ws(' ', ${column}->>'en', ${column}->>'ar', ${column}->>'fr')`;
/** The size a list shows, else any. */
const pickUrl = (urls: string) => `coalesce(${urls}->>'card', ${urls}->>'thumb', ${urls}->>'full')`;

const REBUILD_PAGE = 200;

/** 0 to 100: what a shopper sees of a listing. Used in ranking (F1-06). */
export function completenessScore(shop: ShopSearchSnapshot, activeProducts: number): number {
  let score = 0;
  if (shop.logoMediaId) score += 15;
  if (shop.description.en?.trim() || shop.description.ar?.trim()) score += 15;
  if (shop.galleryCount > 0) score += 10;
  if (shop.hasContact) score += 15;
  if (shop.branches.some((b) => b.openingHours.length > 0)) score += 15;
  if (shop.branches.some((b) => b.area)) score += 5;
  if (activeProducts > 0) score += 25;
  return score;
}

/**
 * Builds the search read model (F1-05) from the owners' snapshots. Every write is guarded by the
 * snapshot's `observedAt`: a row is only replaced or removed by a snapshot at least as new as the
 * one it came from, so events handled late or in parallel cannot bring back an older state.
 */
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);
  private rebuilding = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly owners: SearchOwners,
  ) {}

  /** Re-reads a shop, its branches and its products. A shop that is not verified is dropped. */
  async indexShop(manager: EntityManager, shopId: string): Promise<void> {
    const shop = await this.owners.shop(shopId);
    if (!shop || !shop.verified) {
      await this.dropShop(manager, shopId, shop?.observedAt ?? null);
      return;
    }
    const { products } = await this.owners.shopProducts(shopId);
    const active = products.filter((p) => p.status === 'active');
    await this.ensureCategories(manager, [...shop.categoryIds, ...active.map((p) => p.categoryId)]);

    const at = shop.observedAt;
    const branchIds = shop.branches.map((b) => b.id);
    await manager.query(
      `DELETE FROM discovery.search_branch
        WHERE shop_id = $1 AND NOT (branch_id = ANY($2::uuid[])) AND updated_from_event_at <= $3`,
      [shopId, branchIds, at],
    );
    const score = completenessScore(shop, active.length);
    for (const b of shop.branches) {
      await manager.query(
        `INSERT INTO discovery.search_branch AS t
           (branch_id, shop_id, shop_slug, shop_name, shop_description, branch_name, logo_media_id,
            logo_url, shop_category_ids, origin_countries, emirate, area, location, service_area,
            service_radius_m, pickup, delivery, verified, completeness_score, hours,
            contact_whatsapp, contact_phone, updated_from_event_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
            (SELECT ${pickUrl('m.urls')} FROM discovery.search_media m WHERE m.media_id = $7),
            $8, $9, $10, $11,
            ST_SetSRID(ST_MakePoint($12, $13), 4326)::geography,
            CASE WHEN $14::text IS NULL THEN NULL
                 ELSE ST_SetSRID(ST_GeomFromGeoJSON($14::text), 4326)::geography END,
            $15, $16, $17, true, $18, $19, $20, $21, $22)
         ON CONFLICT (branch_id) DO UPDATE SET
            shop_id = EXCLUDED.shop_id, shop_slug = EXCLUDED.shop_slug,
            shop_name = EXCLUDED.shop_name, shop_description = EXCLUDED.shop_description,
            branch_name = EXCLUDED.branch_name, logo_media_id = EXCLUDED.logo_media_id,
            logo_url = EXCLUDED.logo_url, shop_category_ids = EXCLUDED.shop_category_ids,
            origin_countries = EXCLUDED.origin_countries, emirate = EXCLUDED.emirate,
            area = EXCLUDED.area, location = EXCLUDED.location,
            service_area = EXCLUDED.service_area, service_radius_m = EXCLUDED.service_radius_m,
            pickup = EXCLUDED.pickup, delivery = EXCLUDED.delivery,
            completeness_score = EXCLUDED.completeness_score, hours = EXCLUDED.hours,
            contact_whatsapp = EXCLUDED.contact_whatsapp, contact_phone = EXCLUDED.contact_phone,
            updated_from_event_at = EXCLUDED.updated_from_event_at
         WHERE t.updated_from_event_at <= EXCLUDED.updated_from_event_at`,
        [
          b.id,
          shopId,
          shop.slug,
          shop.name,
          shop.description,
          b.name,
          shop.logoMediaId,
          shop.categoryIds,
          shop.originCountries,
          b.emirate,
          b.area,
          b.location.lng,
          b.location.lat,
          b.serviceArea ? JSON.stringify(b.serviceArea) : null,
          b.serviceRadiusM,
          b.pickup,
          b.delivery,
          score,
          JSON.stringify({ weekly: b.openingHours, special: b.specialHours }),
          b.contactWhatsapp,
          b.contactPhone,
          at,
        ],
      );
    }

    const productIds = products.map((p) => p.productId);
    await manager.query(
      `DELETE FROM discovery.search_product
        WHERE shop_id = $1 AND NOT (product_id = ANY($2::uuid[]))`,
      [shopId, productIds],
    );
    for (const product of products) await this.putProduct(manager, product);
    await this.refreshBranches(manager, shopId);
  }

  /** Re-reads one product. Only an active product of a shop held here (verified) is kept. */
  async indexProduct(manager: EntityManager, productId: string, shopId: string): Promise<void> {
    const product = await this.owners.product(productId);
    if (!product) {
      // Removal is final.
      await manager.query(`DELETE FROM discovery.search_product WHERE product_id = $1`, [
        productId,
      ]);
    } else {
      await this.ensureCategories(manager, [product.categoryId]);
      await this.putProduct(manager, product);
    }
    await this.refreshBranches(manager, product?.shopId ?? shopId);
  }

  /** A processed image's URLs: rows that show it get them now, later rows on insert. */
  async mediaReady(manager: EntityManager, event: EventPayloads['media.ready']): Promise<void> {
    if (!Object.keys(event.urls).length) return; // Private documents have none.
    await manager.query(
      `INSERT INTO discovery.search_media (media_id, urls) VALUES ($1, $2)
       ON CONFLICT (media_id) DO UPDATE SET urls = EXCLUDED.urls`,
      [event.mediaId, JSON.stringify(event.urls)],
    );
    const url = pickUrlOf(event.urls);
    await manager.query(
      `UPDATE discovery.search_branch SET logo_url = $2 WHERE logo_media_id = $1`,
      [event.mediaId, url],
    );
    await manager.query(
      `UPDATE discovery.search_product SET image_url = $2 WHERE image_media_id = $1`,
      [event.mediaId, url],
    );
  }

  /**
   * Admins: reads every verified shop again and drops what is no longer there. Events handled
   * meanwhile keep working: rows they write are newer than the rebuild's start, and are kept.
   */
  async rebuild(): Promise<RebuildSearchResponse | null> {
    if (this.rebuilding) return null;
    this.rebuilding = true;
    try {
      const [{ now: startedAt }] = await this.dataSource.query(`SELECT now() AS now`);
      await this.dataSource.transaction((m) => this.replaceCategories(m));
      const seen: string[] = [];
      let after: string | undefined;
      for (;;) {
        const ids = await this.owners.verifiedShopIds(after, REBUILD_PAGE);
        for (const id of ids) {
          await this.dataSource.transaction((m) => this.indexShop(m, id));
          seen.push(id);
        }
        if (ids.length < REBUILD_PAGE) break;
        after = ids[ids.length - 1];
      }
      const removed = await this.dataSource.transaction(async (m) => {
        const [, branches]: [unknown, number] = await m.query(
          `DELETE FROM discovery.search_branch
            WHERE NOT (shop_id = ANY($1::uuid[])) AND updated_from_event_at < $2`,
          [seen, startedAt],
        );
        const [, products]: [unknown, number] = await m.query(
          `DELETE FROM discovery.search_product
            WHERE NOT (shop_id = ANY($1::uuid[])) AND updated_from_event_at < $2`,
          [seen, startedAt],
        );
        // A DELETE answers [rows, affected].
        return branches + products;
      });
      const [{ branches, products }] = await this.dataSource.query(
        `SELECT (SELECT count(*) FROM discovery.search_branch)::int AS branches,
                (SELECT count(*) FROM discovery.search_product)::int AS products`,
      );
      this.logger.log(
        `Rebuilt search: ${seen.length} shops, ${branches} branches, ${products} products`,
      );
      return { shops: seen.length, branches, products, removed };
    } finally {
      this.rebuilding = false;
    }
  }

  private async dropShop(
    manager: EntityManager,
    shopId: string,
    observedAt: string | null,
  ): Promise<void> {
    // Without a snapshot the shop is gone, which is final.
    const guard = observedAt ? `AND updated_from_event_at <= $2` : '';
    const params = observedAt ? [shopId, observedAt] : [shopId];
    await manager.query(`DELETE FROM discovery.search_branch WHERE shop_id = $1 ${guard}`, params);
    await manager.query(`DELETE FROM discovery.search_product WHERE shop_id = $1 ${guard}`, params);
  }

  /** Writes a product's row, or removes it when it is not public. */
  private async putProduct(manager: EntityManager, p: ProductSearchSnapshot): Promise<void> {
    const shopHeld = await manager.query(
      `SELECT 1 FROM discovery.search_branch WHERE shop_id = $1 LIMIT 1`,
      [p.shopId],
    );
    if (p.status !== 'active' || !shopHeld.length) {
      await manager.query(
        `DELETE FROM discovery.search_product WHERE product_id = $1 AND updated_from_event_at <= $2`,
        [p.productId, p.observedAt],
      );
      return;
    }
    await manager.query(
      `INSERT INTO discovery.search_product AS t
         (product_id, shop_id, branch_ids, title, title_text, category_id, origin_country,
          min_price_fils, image_media_id, image_url, searchable, updated_from_event_at)
       SELECT $1, $2, $3, $4::jsonb, ${allLanguages('$4::jsonb')}, $5, $6, $7, $8,
              (SELECT ${pickUrl('m.urls')} FROM discovery.search_media m WHERE m.media_id = $8),
              setweight(to_tsvector('${TS}', ${allLanguages('$4::jsonb')}), 'A')
                || setweight(to_tsvector('${TS}', coalesce((
                     SELECT string_agg(${allLanguages('c.name')}, ' ')
                       FROM discovery.search_category c
                      WHERE c.id = ANY(coalesce((SELECT path FROM discovery.search_category WHERE id = $5), '{}'::uuid[]))
                   ), '')), 'B')
                || setweight(to_tsvector('${TS}', ${allLanguages('$9::jsonb')}), 'C'),
              $10
       ON CONFLICT (product_id) DO UPDATE SET
          shop_id = EXCLUDED.shop_id, branch_ids = EXCLUDED.branch_ids, title = EXCLUDED.title,
          title_text = EXCLUDED.title_text, category_id = EXCLUDED.category_id,
          origin_country = EXCLUDED.origin_country, min_price_fils = EXCLUDED.min_price_fils,
          image_media_id = EXCLUDED.image_media_id, image_url = EXCLUDED.image_url,
          searchable = EXCLUDED.searchable, updated_from_event_at = EXCLUDED.updated_from_event_at
       WHERE t.updated_from_event_at <= EXCLUDED.updated_from_event_at`,
      [
        p.productId,
        p.shopId,
        p.branchIds,
        JSON.stringify(p.title),
        p.categoryId,
        p.originCountry,
        p.minPriceFils,
        p.imageMediaIds[0] ?? null,
        JSON.stringify(p.description),
        p.observedAt,
      ],
    );
  }

  /**
   * What a shop's branches derive from the rest: their categories (the shop's own and those of
   * products in stock there, with every parent) and their text index.
   */
  private async refreshBranches(manager: EntityManager, shopId: string): Promise<void> {
    await manager.query(
      `WITH cats AS (
         SELECT b.branch_id, coalesce(array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL), '{}') AS ids
           FROM discovery.search_branch b
           LEFT JOIN LATERAL (
             SELECT unnest(c.path) AS id FROM discovery.search_category c
              WHERE c.id = ANY(b.shop_category_ids)
                 OR c.id IN (SELECT sp.category_id FROM discovery.search_product sp
                              WHERE sp.shop_id = b.shop_id AND b.branch_id = ANY(sp.branch_ids))
           ) p ON true
          WHERE b.shop_id = $1
          GROUP BY b.branch_id
       )
       UPDATE discovery.search_branch b
          SET category_ids = cats.ids,
              searchable =
                setweight(to_tsvector('${TS}', b.shop_name), 'A')
                || setweight(to_tsvector('${TS}', concat_ws(' ', b.branch_name, b.area, (
                     SELECT string_agg(${allLanguages('c.name')}, ' ')
                       FROM discovery.search_category c WHERE c.id = ANY(cats.ids)))), 'B')
                || setweight(to_tsvector('${TS}', ${allLanguages('b.shop_description')}), 'C')
         FROM cats
        WHERE b.branch_id = cats.branch_id`,
      [shopId],
    );
  }

  /** Reads the category tree again when a category is not known here yet. */
  private async ensureCategories(manager: EntityManager, ids: string[]): Promise<void> {
    const wanted = [...new Set(ids)];
    if (!wanted.length) return;
    const [{ known }] = await manager.query(
      `SELECT count(*)::int AS known FROM discovery.search_category WHERE id = ANY($1::uuid[])`,
      [wanted],
    );
    if (known < wanted.length) await this.replaceCategories(manager);
  }

  private async replaceCategories(manager: EntityManager): Promise<void> {
    const categories = await this.owners.categories();
    await manager.query(`DELETE FROM discovery.search_category`);
    for (const c of categories) {
      await manager.query(
        `INSERT INTO discovery.search_category (id, parent_id, name, path) VALUES ($1, $2, $3, $4)`,
        [c.id, c.parentId, JSON.stringify(c.name), pathOf(c, categories)],
      );
    }
  }
}

/** The category's parents and itself, root first; a missing parent ends the path. */
export function pathOf(category: CategoryDto, all: CategoryDto[]): string[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const path: string[] = [];
  let at: CategoryDto | undefined = category;
  while (at && !path.includes(at.id)) {
    path.unshift(at.id);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return path;
}

const pickUrlOf = (urls: Record<string, string>): string | null =>
  urls.card ?? urls.thumb ?? urls.full ?? Object.values(urls)[0] ?? null;
