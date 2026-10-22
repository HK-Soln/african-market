import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  DiscoveryErrors,
  DiscoveryPatterns,
  EmirateList,
  RebuildSearchResponse,
  SearchMapResponse,
  SearchNearbyResponse,
  SITEMAP_PAGE_MAX,
  SitemapPage,
} from '@am/contracts';
import { AppRpcException } from '@am/core';
import { EMIRATE_CODES, isInUae, UAE_BOUNDS } from '@am/geo';
import { EmiratesService } from './emirates.service';
import { SearchIndexer } from './indexer';
import { MAX_LIMIT, SearchService } from './search.service';
import { SitemapService } from './sitemap.service';

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw AppRpcException.badRequest(DiscoveryErrors.validationFailed, 'Invalid request', {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const actorSchema = z.object({
  userId: z.uuid(),
  roles: z.array(z.string().max(32)).max(10),
  shops: z
    .array(
      z.object({ shopId: z.uuid(), role: z.enum(['owner', 'manager', 'staff']) }).passthrough(),
    )
    .max(100),
});

const rebuildSchema = z.object({
  actor: actorSchema,
  correlationId: z.string().max(128).optional(),
});

const filters = {
  q: z.string().max(100).optional(),
  categoryId: z.uuid().optional(),
  originCountry: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  openNow: z.boolean().optional(),
  emirate: z.enum(EMIRATE_CODES as [string, ...string[]]).optional(),
};

const nearbySchema = z
  .object({
    ...filters,
    lat: z.number(),
    lng: z.number(),
    mode: z.enum(['delivery', 'pickup']),
    deliversToMe: z.boolean().optional(),
    radiusM: z.number().int().min(500).max(50_000).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    cursor: z.string().max(512).optional(),
  })
  .refine((v) => isInUae(v), { message: 'The point is outside the UAE', path: ['lat'] });

const lat = z
  .number()
  .min(UAE_BOUNDS.minLat - 1)
  .max(UAE_BOUNDS.maxLat + 1);
const lng = z
  .number()
  .min(UAE_BOUNDS.minLng - 1)
  .max(UAE_BOUNDS.maxLng + 1);
const mapSchema = z
  .object({
    ...filters,
    minLat: lat,
    minLng: lng,
    maxLat: lat,
    maxLng: lng,
    zoom: z.number().min(0).max(22),
  })
  .refine((v) => v.minLat < v.maxLat && v.minLng < v.maxLng, {
    message: 'The box is empty',
    path: ['minLat'],
  });

@Controller()
export class SearchController {
  constructor(
    private readonly indexer: SearchIndexer,
    private readonly search: SearchService,
    private readonly emirates: EmiratesService,
    private readonly sitemap: SitemapService,
  ) {}

  /** Public: verified shops or live products a page at a time, for the web sitemap. */
  @MessagePattern(DiscoveryPatterns.sitemap)
  sitemapPage(@Payload() payload: unknown): Promise<SitemapPage> {
    return this.sitemap.page(
      parse(
        z.object({
          kind: z.enum(['shops', 'products']),
          cursor: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(SITEMAP_PAGE_MAX).optional(),
        }),
        payload,
      ),
    );
  }

  /** Public: the emirates and whether search is open there; admins get counts too. */
  @MessagePattern(DiscoveryPatterns.listEmirates)
  listEmirates(@Payload() payload: unknown): Promise<EmirateList> {
    return this.emirates.list(parse(z.object({ actor: actorSchema.optional() }), payload ?? {}));
  }

  /** Admins: open or close customer search in an emirate. */
  @MessagePattern(DiscoveryPatterns.setEmirateSearch)
  setEmirateSearch(@Payload() payload: unknown): Promise<EmirateList> {
    return this.emirates.setSearch(
      parse(
        z.object({
          actor: actorSchema,
          code: z.enum(EMIRATE_CODES as [string, ...string[]]),
          open: z.boolean(),
          correlationId: z.string().max(128).optional(),
        }),
        payload,
      ),
    );
  }

  /** Public: branches near a point, ranked, a page at a time. */
  @MessagePattern(DiscoveryPatterns.searchNearby)
  nearby(@Payload() payload: unknown): Promise<SearchNearbyResponse> {
    return this.search.nearby(parse(nearbySchema, payload));
  }

  /** Public: what the map shows in a box: pins when zoomed in, clusters further out. */
  @MessagePattern(DiscoveryPatterns.searchMap)
  map(@Payload() payload: unknown): Promise<SearchMapResponse> {
    return this.search.map(parse(mapSchema, payload));
  }

  /** Admins: rebuilds the read model from the owning services. */
  @MessagePattern(DiscoveryPatterns.rebuild)
  async rebuild(@Payload() payload: unknown): Promise<RebuildSearchResponse> {
    const parsed = rebuildSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.actor.roles.includes('admin'))
      throw AppRpcException.forbidden(DiscoveryErrors.adminOnly, 'Only an admin can do this');
    const result = await this.indexer.rebuild();
    if (!result)
      throw AppRpcException.conflict(DiscoveryErrors.rebuildRunning, 'A rebuild is running');
    await this.emirates.recordRebuild(parsed.data.actor, result, parsed.data.correlationId);
    return result;
  }
}
