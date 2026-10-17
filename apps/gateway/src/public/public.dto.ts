import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EMIRATE_CODES } from '@am/geo';

/** Query strings carry text: "true"/"1" are true, anything else false. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true' || value === '1';

// ---- Search ------------------------------------------------------------------------------

class SearchFiltersQuery {
  @ApiPropertyOptional({ description: 'Shop names, categories, areas, descriptions, products' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'A category and everything under it' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'NG', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  originCountry?: string;

  @ApiPropertyOptional({ description: 'Open now, Asia/Dubai' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ enum: EMIRATE_CODES })
  @IsOptional()
  @IsIn(EMIRATE_CODES)
  emirate?: string;
}

export class SearchNearbyQuery extends SearchFiltersQuery {
  @ApiProperty({ example: 25.2897 })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ example: 55.3712 })
  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @ApiProperty({
    enum: ['delivery', 'pickup'],
    description: 'delivery: they deliver here; pickup: near here',
  })
  @IsIn(['delivery', 'pickup'])
  mode!: 'delivery' | 'pickup';

  @ApiPropertyOptional({ description: 'Pickup: only branches that would also deliver here' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deliversToMe?: boolean;

  @ApiPropertyOptional({ description: 'Pickup: travel radius in metres (default 10,000)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(50_000)
  radiusM?: number;

  @ApiPropertyOptional({ description: 'At most 50 (default 20)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: '`nextCursor` of the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class SearchMapQuery extends SearchFiltersQuery {
  @ApiProperty() @Type(() => Number) @IsNumber() minLat!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() minLng!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() maxLat!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() maxLng!: number;

  @ApiProperty({ description: 'Map zoom 0-22; pins from 14, clusters below' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(22)
  zoom!: number;
}

export class LocalizedTextDto {
  @ApiPropertyOptional() en?: string;
  @ApiPropertyOptional() ar?: string;
  @ApiPropertyOptional() fr?: string;
}

export class LatLngDto {
  @ApiProperty() lat!: number;
  @ApiProperty() lng!: number;
}

export class MatchedProductDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ type: LocalizedTextDto }) title!: LocalizedTextDto;
  @ApiProperty({ type: Number, nullable: true, description: 'Fils, VAT included' })
  minPriceFils!: number | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
}

export class NearbyBranchDto {
  @ApiProperty({ format: 'uuid' }) branchId!: string;
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty() shopSlug!: string;
  @ApiProperty() shopName!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiProperty() emirate!: string;
  @ApiProperty({ type: String, nullable: true }) area!: string | null;
  @ApiProperty({ type: LatLngDto }) location!: LatLngDto;
  @ApiProperty() distanceM!: number;
  @ApiProperty() openNow!: boolean;
  @ApiProperty() pickup!: boolean;
  @ApiProperty() delivery!: boolean;
  @ApiProperty() verified!: boolean;
  @ApiProperty() ratingAvg!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty({ type: [String] }) categoryIds!: string[];
  @ApiProperty({ type: [String] }) originCountries!: string[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'E.164; the branch’s, else the shop’s',
  })
  contactWhatsapp!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'E.164; the branch’s, else the shop’s',
  })
  contactPhone!: string | null;
  @ApiProperty({ type: [MatchedProductDto] }) matchedProducts!: MatchedProductDto[];
}

export class SearchNearbyResponseDto {
  @ApiProperty({ type: [NearbyBranchDto] }) items!: NearbyBranchDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class MapMarkerDto {
  @ApiProperty({ enum: ['pin', 'cluster'] }) kind!: 'pin' | 'cluster';
  @ApiProperty({ type: LatLngDto }) location!: LatLngDto;
  @ApiPropertyOptional({ description: 'Clusters' }) count?: number;
  @ApiPropertyOptional({ format: 'uuid', description: 'Pins' }) branchId?: string;
  @ApiPropertyOptional({ description: 'Pins' }) shopSlug?: string;
  @ApiPropertyOptional({ description: 'Pins' }) shopName?: string;
  @ApiPropertyOptional({ description: 'Pins' }) openNow?: boolean;
}

export class SearchMapResponseDto {
  @ApiProperty({ type: [MapMarkerDto] }) markers!: MapMarkerDto[];
  @ApiProperty({ description: 'More pins than returned: zoom in' }) truncated!: boolean;
}

export class EmirateDto {
  @ApiProperty({ enum: EMIRATE_CODES }) code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: LocalizedTextDto }) name!: LocalizedTextDto;
  @ApiProperty({ type: LatLngDto }) center!: LatLngDto;
  @ApiProperty({ description: 'Customers can search here' }) searchOpen!: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'Admins only' })
  verifiedShops!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Admins only' })
  branches!: number | null;
}

export class EmirateListDto {
  @ApiProperty({ type: [EmirateDto] }) items!: EmirateDto[];
}

// ---- Catalogue ---------------------------------------------------------------------------

export class CategoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: LocalizedTextDto }) name!: LocalizedTextDto;
  @ApiProperty({ enum: ['product', 'service'] }) kind!: 'product' | 'service';
  @ApiProperty({ description: 'Products in it are reviewed before they show' })
  isRestricted!: boolean;
  @ApiProperty({ description: 'Food: needs the seller declaration' })
  requiresDeclaration!: boolean;
  @ApiProperty() checkoutAllowed!: boolean;
  @ApiProperty() sort!: number;
  @ApiProperty() active!: boolean;
}

export class CategoryListDto {
  @ApiProperty({ type: [CategoryDto], description: 'Parents before children' })
  items!: CategoryDto[];
}

export class ImageUrlsDto {
  @ApiPropertyOptional() thumb?: string;
  @ApiPropertyOptional() card?: string;
  @ApiPropertyOptional() full?: string;
}

export class VariantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) sku!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options!: Record<string, string>;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Fils, VAT included; null: on request',
  })
  priceFils!: number | null;
  @ApiProperty({ type: Number, nullable: true }) compareAtFils!: number | null;
  @ApiProperty() sort!: number;
}

export class BranchListingDto {
  @ApiProperty({ format: 'uuid' }) branchId!: string;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ type: Number, nullable: true }) quantity!: number | null;
  @ApiProperty({ type: Number, nullable: true }) priceOverrideFils!: number | null;
}

export class FoodDeclarationDto {
  @ApiProperty({ enum: [true] }) packagedAndLabelled!: true;
  @ApiProperty({ enum: [true] }) noRestrictedItems!: true;
  @ApiProperty({ enum: ['ambient', 'chilled', 'frozen'] }) storage!:
    'ambient' | 'chilled' | 'frozen';
  @ApiPropertyOptional({ type: String, nullable: true }) manufacturer?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) registrationNumber?: string | null;
  @ApiPropertyOptional({ format: 'uuid' }) declaredBy?: string;
  @ApiPropertyOptional({ format: 'date-time' }) declaredAt?: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ enum: ['product', 'service'] }) type!: 'product' | 'service';
  @ApiProperty({ type: LocalizedTextDto }) title!: LocalizedTextDto;
  @ApiProperty({ type: LocalizedTextDto }) description!: LocalizedTextDto;
  @ApiProperty({ type: String, nullable: true }) originCountry!: string | null;
  @ApiProperty({ type: [String] }) imageMediaIds!: string[];
  @ApiProperty({ type: [ImageUrlsDto], description: 'Links of the images, in order' })
  images!: ImageUrlsDto[];
  @ApiProperty({ enum: ['draft', 'pending_review', 'active', 'hidden', 'rejected'] })
  status!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Members only' })
  reviewReason!: string | null;
  @ApiProperty({ type: FoodDeclarationDto, nullable: true, description: 'Members only' })
  foodDeclaration!: FoodDeclarationDto | null;
  @ApiProperty({ type: [VariantDto] }) variants!: VariantDto[];
  @ApiProperty({ type: [BranchListingDto] }) listings!: BranchListingDto[];
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) submittedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductDto] }) items!: ProductDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: String, nullable: true }) prevCursor!: string | null;
}

// ---- Shops -------------------------------------------------------------------------------

export class OpeningHoursDto {
  @ApiProperty({ description: '0 = Sunday' }) weekday!: number;
  @ApiProperty({ example: '09:00' }) opensAt!: string;
  @ApiProperty({ example: '21:00', description: 'Earlier than opensAt: past midnight' })
  closesAt!: string;
}

export class SpecialHoursDto {
  @ApiProperty({ example: '2026-03-20' }) date!: string;
  @ApiProperty() closed!: boolean;
  @ApiProperty({ type: String, nullable: true }) opensAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) closesAt!: string | null;
  @ApiProperty({ type: LocalizedTextDto, nullable: true }) label!: LocalizedTextDto | null;
}

export class MultiPolygonDto {
  @ApiProperty({ enum: ['MultiPolygon'] }) type!: 'MultiPolygon';
  @ApiProperty({
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    },
    description: 'GeoJSON, longitude first',
  })
  coordinates!: number[][][][];
}

export class PublicBranchDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: EMIRATE_CODES }) emirate!: string;
  @ApiProperty({ type: String, nullable: true }) area!: string | null;
  @ApiProperty({ type: String, nullable: true }) addressLine!: string | null;
  @ApiProperty({ type: String, nullable: true }) makani!: string | null;
  @ApiProperty({ type: LatLngDto }) location!: LatLngDto;
  @ApiProperty({ type: MultiPolygonDto, nullable: true }) serviceArea!: MultiPolygonDto | null;
  @ApiProperty({ type: Number, nullable: true }) serviceRadiusM!: number | null;
  @ApiProperty() pickup!: boolean;
  @ApiProperty() delivery!: boolean;
  @ApiProperty() deliveryFeeFils!: number;
  @ApiProperty() minOrderFils!: number;
  @ApiProperty({ type: String, nullable: true }) contactWhatsapp!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty({ type: [OpeningHoursDto] }) openingHours!: OpeningHoursDto[];
  @ApiProperty({ type: [SpecialHoursDto] }) specialHours!: SpecialHoursDto[];
}

/** What anyone may see of a verified shop: no verification details, owner or licence. */
export class PublicShopDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: LocalizedTextDto }) description!: LocalizedTextDto;
  @ApiProperty({ type: ImageUrlsDto, nullable: true }) logo!: ImageUrlsDto | null;
  @ApiProperty({ type: [ImageUrlsDto] }) gallery!: ImageUrlsDto[];
  @ApiProperty({ type: [String] }) categoryIds!: string[];
  @ApiProperty({ type: [String] }) originCountries!: string[];
  @ApiProperty({ type: String, nullable: true }) contactWhatsapp!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty() checkoutEnabled!: boolean;
  @ApiProperty() codEnabled!: boolean;
  @ApiProperty({ type: [PublicBranchDto] }) branches!: PublicBranchDto[];
}
