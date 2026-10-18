import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  BranchDto,
  MY_SHOPS_LIST_SPEC,
  PublicShopSourceDto,
  ShopDto,
  ShopErrors,
  ShopPage,
  ShopsPatterns,
  UpdateShopResponse,
} from '@am/contracts';
import { listQueryFromPayload } from '@am/core';
import { shopError } from '../errors';
import { BranchesService } from './branches.service';
import { ShopsService } from './shops.service';

/** The gateway validates first; the service validates again before it persists anything. */
function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw shopError(ShopErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const actor = z.object({
  userId: uuid,
  roles: z.array(z.string().max(32)).max(10),
  shops: z.array(z.object({ shopId: uuid, role: z.enum(['owner', 'manager', 'staff']) })).max(100),
});
const correlationId = z.string().max(128).optional();
const text = (max: number) => z.string().max(max);
const localized = z
  .object({ en: text(2000).optional(), ar: text(2000).optional(), fr: text(2000).optional() })
  .strict();
const contact = text(320).nullable().optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const date = z.iso.date();

const shopFields = {
  name: text(120).optional(),
  description: localized.optional(),
  logoMediaId: uuid.nullable().optional(),
  galleryMediaIds: z.array(uuid).max(12).optional(),
  categoryIds: z.array(uuid).max(10).optional(),
  originCountries: z
    .array(z.string().regex(/^[A-Za-z]{2}$/))
    .max(20)
    .optional(),
  contactWhatsapp: contact,
  contactPhone: contact,
  contactEmail: contact,
  staffCanUploadProductImages: z.boolean().optional(),
};

const createShopSchema = z.object({ ...shopFields, name: text(120), actor, correlationId });
const updateShopSchema = z.object({ ...shopFields, actor, shopId: uuid, correlationId });
const getShopSchema = z.object({ actor, shopId: uuid });
const bySlugSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const multiPolygon = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z
    .array(z.array(z.array(z.tuple([z.number(), z.number()])).max(2000)).max(20))
    .min(1)
    .max(20),
});
const fils = z.number().int().min(0).max(100_000_000);

const upsertBranchSchema = z.object({
  actor,
  shopId: uuid,
  branchId: uuid.optional(),
  correlationId,
  name: text(120).optional(),
  emirate: z.string().max(8).optional(),
  area: text(120).nullable().optional(),
  addressLine: text(300).nullable().optional(),
  makani: text(20).nullable().optional(),
  location: latLng.optional(),
  serviceArea: multiPolygon.nullable().optional(),
  serviceRadiusM: z.number().int().min(100).max(100_000).nullable().optional(),
  pickup: z.boolean().optional(),
  delivery: z.boolean().optional(),
  deliveryFeeFils: fils.optional(),
  minOrderFils: fils.optional(),
  contactWhatsapp: contact,
  contactPhone: contact,
  contactEmail: contact,
  isPrimary: z.boolean().optional(),
});
const branchRef = { actor, shopId: uuid, branchId: uuid, correlationId };
const deleteBranchSchema = z.object(branchRef);
const openingHoursSchema = z.object({
  ...branchRef,
  hours: z
    .array(
      z
        .object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time })
        .refine((h) => h.opensAt !== h.closesAt, 'Opening and closing are the same time'),
    )
    .max(28),
});
const specialHoursSchema = z.object({
  ...branchRef,
  date,
  closed: z.boolean(),
  opensAt: time.nullable(),
  closesAt: time.nullable(),
  label: localized.nullable(),
});
const deleteSpecialHoursSchema = z.object({ ...branchRef, date });

@Controller()
export class ShopsController {
  constructor(
    private readonly shops: ShopsService,
    private readonly branches: BranchesService,
  ) {}

  @MessagePattern(ShopsPatterns.create)
  create(@Payload() payload: unknown): Promise<ShopDto> {
    return this.shops.create(parse(createShopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.update)
  update(@Payload() payload: unknown): Promise<UpdateShopResponse> {
    return this.shops.update(parse(updateShopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.get)
  get(@Payload() payload: unknown): Promise<ShopDto> {
    return this.shops.get(parse(getShopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.getBySlug)
  getBySlug(@Payload() payload: unknown): Promise<PublicShopSourceDto> {
    return this.shops.getBySlug(parse(bySlugSchema, payload));
  }

  @MessagePattern(ShopsPatterns.listMine)
  listMine(@Payload() payload: unknown): Promise<ShopPage> {
    const { actor: who } = parse(z.object({ actor }).passthrough(), payload);
    return this.shops.listMine({
      actor: who,
      query: listQueryFromPayload(payload, MY_SHOPS_LIST_SPEC),
    });
  }

  @MessagePattern(ShopsPatterns.upsertBranch)
  upsertBranch(@Payload() payload: unknown): Promise<BranchDto> {
    return this.branches.upsert(parse(upsertBranchSchema, payload));
  }

  @MessagePattern(ShopsPatterns.deleteBranch)
  deleteBranch(@Payload() payload: unknown): Promise<{ deleted: true }> {
    return this.branches.delete(parse(deleteBranchSchema, payload));
  }

  @MessagePattern(ShopsPatterns.setOpeningHours)
  setOpeningHours(@Payload() payload: unknown): Promise<BranchDto> {
    return this.branches.setOpeningHours(parse(openingHoursSchema, payload));
  }

  @MessagePattern(ShopsPatterns.setSpecialHours)
  setSpecialHours(@Payload() payload: unknown): Promise<BranchDto> {
    return this.branches.setSpecialHours(parse(specialHoursSchema, payload));
  }

  @MessagePattern(ShopsPatterns.deleteSpecialHours)
  deleteSpecialHours(@Payload() payload: unknown): Promise<BranchDto> {
    return this.branches.deleteSpecialHours(parse(deleteSpecialHoursSchema, payload));
  }
}
