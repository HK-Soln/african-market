import { DataSource, MoreThan } from 'typeorm';
import {
  ListVerifiedShopIdsRequest,
  ListVerifiedShopIdsResponse,
  ShopSearchSnapshotRequest,
  ShopSearchSnapshotResponse,
} from '@am/contracts';
import { Branch, Shop } from '../entities';
import { toBranchDto } from './mapper';

/**
 * What discovery reads to build its search read model (F1-05): public fields only. Each read runs
 * in one REPEATABLE READ transaction, so the shop, its branches and `observedAt` belong together.
 */
export class SearchSnapshotService {
  constructor(private readonly dataSource: DataSource) {}

  async snapshot(input: ShopSearchSnapshotRequest): Promise<ShopSearchSnapshotResponse> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const [{ now }] = await manager.query(`SELECT transaction_timestamp() AS now`);
      const shop = await manager.findOneBy(Shop, { id: input.shopId });
      if (!shop) return null;
      const branches = await manager.find(Branch, {
        where: { shopId: shop.id },
        relations: { openingHours: true, specialHours: true },
        order: { isPrimary: 'DESC', createdAt: 'ASC' },
      });
      const dtos = branches.map(toBranchDto);
      return {
        shopId: shop.id,
        verified: shop.verificationStatus === 'verified',
        slug: shop.slug,
        name: shop.name,
        description: shop.description,
        logoMediaId: shop.logoMediaId,
        galleryCount: shop.galleryMediaIds.length,
        categoryIds: shop.categoryIds,
        originCountries: shop.originCountries,
        hasContact:
          Boolean(shop.contactWhatsapp || shop.contactPhone || shop.contactEmail) ||
          dtos.some((b) => b.contactWhatsapp || b.contactPhone || b.contactEmail),
        branches: dtos.map((b) => ({
          id: b.id,
          name: b.name,
          emirate: b.emirate,
          area: b.area,
          location: b.location,
          serviceArea: b.serviceArea,
          serviceRadiusM: b.serviceRadiusM,
          pickup: b.pickup,
          delivery: b.delivery,
          openingHours: b.openingHours,
          specialHours: b.specialHours,
          contactWhatsapp: b.contactWhatsapp ?? shop.contactWhatsapp,
          contactPhone: b.contactPhone ?? shop.contactPhone,
        })),
        observedAt: new Date(now).toISOString(),
      };
    });
  }

  async verifiedIds(input: ListVerifiedShopIdsRequest): Promise<ListVerifiedShopIdsResponse> {
    const shops = await this.dataSource.manager.find(Shop, {
      select: { id: true },
      where: {
        verificationStatus: 'verified',
        ...(input.after ? { id: MoreThan(input.after) } : {}),
      },
      order: { id: 'ASC' },
      take: input.limit,
    });
    return { shopIds: shops.map((s) => s.id) };
  }
}
