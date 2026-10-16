import { DataSource, EntityManager, In } from 'typeorm';
import {
  CreateShopRequest,
  GetShopBySlugRequest,
  GetShopRequest,
  ListMyShopsRequest,
  normalizePhone,
  ShopDto,
  ShopErrors,
  ShopFields,
  ShopPage,
  UpdateShopRequest,
  UpdateShopResponse,
} from '@am/contracts';
import { findPage, OutboxService } from '@am/database';
import { Branch, Shop } from '../entities';
import { shopError } from '../errors';
import { requireEditor, requireReader } from './access';
import { toShopDto } from './mapper';
import { slugify, withSuffix } from './slug';

/** Shops one person may create; more is likely abuse, and support can lift it. */
export const MAX_SHOPS_PER_OWNER = 5;

const LIST_COLUMNS = {
  verificationStatus: 's.verification_status',
  createdAt: 's.created_at',
  name: 's.name',
};

/** Contacts as stored: phones in E.164, emails trimmed; null clears one. */
export function normalizeContacts(fields: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}): Partial<Record<'contactWhatsapp' | 'contactPhone' | 'contactEmail', string | null>> {
  const out: Partial<Record<'contactWhatsapp' | 'contactPhone' | 'contactEmail', string | null>> =
    {};
  for (const key of ['contactWhatsapp', 'contactPhone'] as const) {
    const value = fields[key];
    if (value === undefined) continue;
    if (value === null || value.trim() === '') {
      out[key] = null;
      continue;
    }
    const e164 = normalizePhone(value);
    if (!e164) throw invalid(key, 'Not a valid phone number');
    out[key] = e164;
  }
  if (fields.contactEmail !== undefined) {
    const email = fields.contactEmail?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw invalid('contactEmail', 'Not a valid email');
    out.contactEmail = email;
  }
  return out;
}

export const invalid = (path: string, message: string) =>
  shopError(ShopErrors.validationFailed, { issues: [{ path, message }] });

/** The shop's own fields, cleaned, ready to save. */
function shopPatch(fields: ShopFields): Partial<Shop> {
  const patch: Partial<Shop> = { ...normalizeContacts(fields) };
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw invalid('name', 'Required');
    patch.name = name;
  }
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.logoMediaId !== undefined) patch.logoMediaId = fields.logoMediaId;
  if (fields.galleryMediaIds !== undefined)
    patch.galleryMediaIds = [...new Set(fields.galleryMediaIds)];
  if (fields.categoryIds !== undefined) patch.categoryIds = [...new Set(fields.categoryIds)];
  if (fields.originCountries !== undefined) {
    patch.originCountries = [...new Set(fields.originCountries.map((c) => c.toUpperCase()))];
  }
  if (fields.staffCanUploadProductImages !== undefined) {
    patch.staffCanUploadProductImages = fields.staffCanUploadProductImages;
  }
  return patch;
}

/** Shops, as their owners and managers keep them. Branches are in BranchesService. */
export class ShopsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Creates a draft shop owned by the actor. Identity, on `shop.created`, makes them its owner
   * and a seller; their next token carries it, and until then the shop knows its owner anyway.
   */
  async create(input: CreateShopRequest): Promise<ShopDto> {
    const patch = shopPatch(input);
    return this.dataSource.transaction(async (manager) => {
      const owned = await manager.countBy(Shop, { ownerId: input.actor.userId });
      if (owned >= MAX_SHOPS_PER_OWNER) throw shopError(ShopErrors.tooManyShops);
      const shop = await manager.save(
        manager.create(Shop, {
          ...patch,
          slug: await this.freeSlug(manager, slugify(patch.name!)),
          ownerId: input.actor.userId,
        }),
      );
      await this.outbox.enqueue(
        manager,
        'shop.created',
        { shopId: shop.id, ownerId: shop.ownerId, name: shop.name, slug: shop.slug },
        input.correlationId,
      );
      return toShopDto(shop, []);
    });
  }

  async update(input: UpdateShopRequest): Promise<UpdateShopResponse> {
    const patch = shopPatch(input);
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.lockShop(manager, input.shopId);
      requireEditor(input.actor, shop);

      const before = new Set(
        [shop.logoMediaId, ...shop.galleryMediaIds].filter(Boolean) as string[],
      );
      Object.assign(shop, patch);
      await manager.save(shop);
      const after = new Set(
        [shop.logoMediaId, ...shop.galleryMediaIds].filter(Boolean) as string[],
      );

      await this.outbox.enqueue(manager, 'shop.updated', { shopId: shop.id }, input.correlationId);
      return {
        shop: toShopDto(shop, await this.branchesOf(manager, [shop.id])),
        releasedMediaIds: [...before].filter((id) => !after.has(id)),
      };
    });
  }

  async get(input: GetShopRequest): Promise<ShopDto> {
    const manager = this.dataSource.manager;
    const shop = await manager.findOneBy(Shop, { id: input.shopId });
    if (!shop) throw shopError(ShopErrors.notFound);
    requireReader(input.actor, shop);
    return toShopDto(shop, await this.branchesOf(manager, [shop.id]));
  }

  /** Public: only verified shops exist here. */
  async getBySlug(input: GetShopBySlugRequest): Promise<ShopDto> {
    const manager = this.dataSource.manager;
    const shop = await manager.findOneBy(Shop, {
      slug: input.slug,
      verificationStatus: 'verified',
    });
    if (!shop) throw shopError(ShopErrors.notFound);
    return toShopDto(shop, await this.branchesOf(manager, [shop.id]));
  }

  /** The shops the actor owns, or has a role in according to their token. */
  async listMine(input: ListMyShopsRequest): Promise<ShopPage> {
    const memberOf = input.actor.shops.map((s) => s.shopId);
    const qb = this.dataSource
      .getRepository(Shop)
      .createQueryBuilder('s')
      .where(
        memberOf.length ? '(s.owner_id = :me OR s.id IN (:...memberOf))' : 's.owner_id = :me',
        {
          me: input.actor.userId,
          memberOf,
        },
      );
    const page = await findPage(qb, input.query, { columns: LIST_COLUMNS, id: 's.id' });
    const branches = await this.branchesOf(
      this.dataSource.manager,
      page.items.map((s) => s.id),
    );
    return {
      ...page,
      items: page.items.map((shop) =>
        toShopDto(
          shop,
          branches.filter((b) => b.shopId === shop.id),
        ),
      ),
    };
  }

  /** The slug, or the slug with a short random ending when it is taken. */
  private async freeSlug(manager: EntityManager, slug: string): Promise<string> {
    let candidate = slug;
    for (let i = 0; i < 5; i++) {
      if (!(await manager.existsBy(Shop, { slug: candidate }))) return candidate;
      candidate = withSuffix(slug);
    }
    throw new Error('Could not find a free slug');
  }

  private async lockShop(manager: EntityManager, shopId: string): Promise<Shop> {
    const shop = await manager.findOne(Shop, {
      where: { id: shopId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!shop) throw shopError(ShopErrors.notFound);
    return shop;
  }

  private branchesOf(manager: EntityManager, shopIds: string[]): Promise<Branch[]> {
    if (shopIds.length === 0) return Promise.resolve([]);
    return manager.find(Branch, {
      where: { shopId: In(shopIds) },
      relations: { openingHours: true, specialHours: true },
    });
  }
}
