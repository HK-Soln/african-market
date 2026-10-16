import { DataSource, EntityManager } from 'typeorm';
import {
  BranchDto,
  BranchFields,
  DeleteBranchRequest,
  DeleteSpecialHoursRequest,
  MultiPolygonDto,
  SetOpeningHoursRequest,
  SetSpecialHoursRequest,
  ShopErrors,
  UpsertBranchRequest,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { EMIRATE_CODES, EmirateCode, isInUae, toGeoJsonPoint, UAE_BOUNDS } from '@am/geo';
import { Branch, OpeningHours, Shop, SpecialHours } from '../entities';
import { shopError } from '../errors';
import { requireEditor } from './access';
import { toBranchDto } from './mapper';
import { invalid, normalizeContacts } from './shops.service';

/** Branches one shop may have for now. */
export const MAX_BRANCHES_PER_SHOP = 50;
/** A delivery area is a few neighbourhoods or a city, never a country: at most this many km². */
export const MAX_SERVICE_AREA_KM2 = 5_000;
export const MAX_SERVICE_AREA_POINTS = 2_000;

/** Checks the shape of a drawn delivery area before PostGIS checks its geometry. */
function checkAreaShape(area: MultiPolygonDto): void {
  let points = 0;
  for (const polygon of area.coordinates) {
    for (const ring of polygon) {
      if (ring.length < 4)
        throw shopError(ShopErrors.serviceAreaInvalid, { reason: 'ring_too_short' });
      for (const [lng, lat] of ring) {
        points++;
        if (!isInUae({ lat, lng }))
          throw shopError(ShopErrors.serviceAreaInvalid, { reason: 'outside_uae' });
      }
    }
  }
  if (points > MAX_SERVICE_AREA_POINTS)
    throw shopError(ShopErrors.serviceAreaInvalid, { reason: 'too_many_points' });
}

/** Branches, their weekly hours and their special days. Only owners and managers change them. */
export class BranchesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async upsert(input: UpsertBranchRequest): Promise<BranchDto> {
    const patch = this.branchPatch(input);
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.editableShop(manager, input);
      let branch: Branch;
      if (input.branchId) {
        branch = await this.branchOf(manager, shop.id, input.branchId);
        Object.assign(branch, patch);
      } else {
        if (!patch.name || !patch.emirate || !patch.location) {
          throw invalid('branch', 'name, emirate and location are required');
        }
        const count = await manager.countBy(Branch, { shopId: shop.id });
        if (count >= MAX_BRANCHES_PER_SHOP) throw shopError(ShopErrors.tooManyBranches);
        // The first branch is the primary one.
        branch = manager.create(Branch, { isPrimary: count === 0, ...patch, shopId: shop.id });
      }

      if (branch.delivery && !branch.serviceArea && !branch.serviceRadiusM) {
        throw shopError(ShopErrors.deliveryAreaMissing);
      }
      if (patch.serviceArea) await this.checkAreaGeometry(manager, patch.serviceArea);
      if (patch.isPrimary) {
        await manager.update(Branch, { shopId: shop.id, isPrimary: true }, { isPrimary: false });
      }
      branch = await manager.save(branch);
      await this.changed(manager, branch, false, input.correlationId);
      return toBranchDto(await this.reload(manager, branch.id));
    });
  }

  async delete(input: DeleteBranchRequest): Promise<{ deleted: true }> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.editableShop(manager, input);
      const branch = await this.branchOf(manager, shop.id, input.branchId);
      await manager.softDelete(Branch, { id: branch.id });
      if (branch.isPrimary) {
        // Another branch, the oldest, becomes the primary one.
        const next = await manager.findOne(Branch, {
          where: { shopId: shop.id },
          order: { createdAt: 'ASC' },
        });
        if (next) await manager.update(Branch, { id: next.id }, { isPrimary: true });
      }
      await this.changed(manager, branch, true, input.correlationId);
      return { deleted: true as const };
    });
  }

  /** Replaces the weekly schedule as a whole: what the seller sees is what is stored. */
  async setOpeningHours(input: SetOpeningHoursRequest): Promise<BranchDto> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.editableShop(manager, input);
      const branch = await this.branchOf(manager, shop.id, input.branchId);
      await manager.delete(OpeningHours, { branchId: branch.id });
      if (input.hours.length) {
        await manager.insert(
          OpeningHours,
          input.hours.map((h) => ({
            branchId: branch.id,
            weekday: h.weekday,
            opensAt: h.opensAt,
            closesAt: h.closesAt,
          })),
        );
      }
      await this.changed(manager, branch, false, input.correlationId);
      return toBranchDto(await this.reload(manager, branch.id));
    });
  }

  async setSpecialHours(input: SetSpecialHoursRequest): Promise<BranchDto> {
    if (!input.closed && (!input.opensAt || !input.closesAt)) {
      throw invalid('opensAt', 'Opening and closing times are required unless closed');
    }
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.editableShop(manager, input);
      const branch = await this.branchOf(manager, shop.id, input.branchId);
      const values = {
        closed: input.closed,
        opensAt: input.closed ? null : input.opensAt,
        closesAt: input.closed ? null : input.closesAt,
        label: input.label,
      };
      const existing = await manager.findOneBy(SpecialHours, {
        branchId: branch.id,
        date: input.date,
      });
      if (existing) await manager.update(SpecialHours, { id: existing.id }, values);
      else await manager.insert(SpecialHours, { branchId: branch.id, date: input.date, ...values });
      await this.changed(manager, branch, false, input.correlationId);
      return toBranchDto(await this.reload(manager, branch.id));
    });
  }

  async deleteSpecialHours(input: DeleteSpecialHoursRequest): Promise<BranchDto> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await this.editableShop(manager, input);
      const branch = await this.branchOf(manager, shop.id, input.branchId);
      await manager.delete(SpecialHours, { branchId: branch.id, date: input.date });
      await this.changed(manager, branch, false, input.correlationId);
      return toBranchDto(await this.reload(manager, branch.id));
    });
  }

  private branchPatch(fields: BranchFields): Partial<Branch> {
    const patch: Partial<Branch> = { ...normalizeContacts(fields) };
    if (fields.name !== undefined) {
      if (!fields.name.trim()) throw invalid('name', 'Required');
      patch.name = fields.name.trim();
    }
    if (fields.emirate !== undefined) {
      if (!EMIRATE_CODES.includes(fields.emirate as EmirateCode))
        throw invalid('emirate', 'Not an emirate');
      patch.emirate = fields.emirate as EmirateCode;
    }
    for (const key of ['area', 'addressLine'] as const) {
      if (fields[key] !== undefined) patch[key] = fields[key]?.trim() || null;
    }
    if (fields.makani !== undefined) {
      const makani = fields.makani?.replace(/\s/g, '') || null;
      if (makani && !/^\d{10}$/.test(makani))
        throw invalid('makani', 'A Makani number has 10 digits');
      patch.makani = makani;
    }
    if (fields.location !== undefined) {
      if (!isInUae(fields.location))
        throw shopError(ShopErrors.outsideUae, { field: 'location', bounds: UAE_BOUNDS });
      patch.location = toGeoJsonPoint(fields.location);
    }
    if (fields.serviceArea !== undefined) {
      if (fields.serviceArea) checkAreaShape(fields.serviceArea);
      patch.serviceArea = fields.serviceArea;
    }
    if (fields.serviceRadiusM !== undefined) patch.serviceRadiusM = fields.serviceRadiusM;
    for (const key of ['pickup', 'delivery', 'isPrimary'] as const) {
      if (fields[key] !== undefined) patch[key] = fields[key];
    }
    for (const key of ['deliveryFeeFils', 'minOrderFils'] as const) {
      if (fields[key] !== undefined) patch[key] = fields[key];
    }
    return patch;
  }

  /** PostGIS: a valid shape, and not larger than a city. */
  private async checkAreaGeometry(manager: EntityManager, area: MultiPolygonDto): Promise<void> {
    const [row] = await manager.query(
      `SELECT ST_IsValid(g::geometry) AS valid, ST_Area(g) / 1e6 AS km2
       FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography AS g) area`,
      [JSON.stringify(area)],
    );
    if (!row.valid) throw shopError(ShopErrors.serviceAreaInvalid, { reason: 'not_valid' });
    if (Number(row.km2) > MAX_SERVICE_AREA_KM2)
      throw shopError(ShopErrors.serviceAreaInvalid, { reason: 'too_large' });
  }

  private async editableShop(
    manager: EntityManager,
    input: { actor: UpsertBranchRequest['actor']; shopId: string },
  ): Promise<Shop> {
    // Locks the shop: branch changes to one shop take turns (the primary branch, the count).
    const shop = await manager.findOne(Shop, {
      where: { id: input.shopId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!shop) throw shopError(ShopErrors.notFound);
    requireEditor(input.actor, shop);
    return shop;
  }

  private async branchOf(
    manager: EntityManager,
    shopId: string,
    branchId: string,
  ): Promise<Branch> {
    const branch = await manager.findOneBy(Branch, { id: branchId, shopId });
    if (!branch) throw shopError(ShopErrors.branchNotFound);
    return branch;
  }

  private reload(manager: EntityManager, branchId: string): Promise<Branch> {
    return manager.findOneOrFail(Branch, {
      where: { id: branchId },
      relations: { openingHours: true, specialHours: true },
    });
  }

  private changed(
    manager: EntityManager,
    branch: Branch,
    deleted: boolean,
    correlationId?: string,
  ) {
    return this.outbox.enqueue(
      manager,
      'branch.updated',
      { branchId: branch.id, shopId: branch.shopId, deleted },
      correlationId,
    );
  }
}
