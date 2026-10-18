import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EMIRATE_CODES } from '@am/geo';
import {
  BranchListingDto,
  ImageUrlsDto,
  LatLngDto,
  LocalizedTextDto,
  OpeningHoursDto,
  PublicBranchDto,
  SpecialHoursDto,
} from '../public/public.dto';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A text in each language; the services check the lengths again. */
export class LocalizedInput {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) ar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) fr?: string;
}

export class LatLngInput {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) lat!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) lng!: number;
}

// ---- Shops --------------------------------------------------------------------------------

export class CreateShopBody {
  @ApiProperty({ example: 'Lagos Kitchen' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
  @ApiPropertyOptional({ type: LocalizedInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedInput)
  description?: LocalizedInput;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  categoryIds?: string[];
  @ApiPropertyOptional({ type: [String], example: ['NG', 'GH'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Za-z]{2}$/, { each: true })
  originCountries?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, example: '050 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactWhatsapp?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactEmail?: string | null;
  @ApiPropertyOptional({ description: 'Staff may upload product images too' })
  @IsOptional()
  @IsBoolean()
  staffCanUploadProductImages?: boolean;
}

export class UpdateShopBody extends PartialType(CreateShopBody) {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'A confirmed shop_logo upload; null removes the logo',
  })
  @IsOptional()
  @IsUUID()
  logoMediaId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Confirmed shop_gallery uploads, in order' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('all', { each: true })
  galleryMediaIds?: string[];
}

export class SellerBranchDto extends PublicBranchDto {
  @ApiProperty({ format: 'uuid' }) shopId!: string;
}

export class TradeLicenseDto {
  @ApiProperty({ type: String, nullable: true }) legalName!: string | null;
  @ApiProperty({ type: String, nullable: true }) number!: string | null;
  @ApiProperty({ type: String, nullable: true }) issuingAuthority!: string | null;
  @ApiProperty({ type: String, nullable: true }) expiry!: string | null;
}

/** A shop as its members see it. */
@ApiExtraModels(ImageUrlsDto)
export class SellerShopDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: LocalizedTextDto }) description!: LocalizedTextDto;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) logoMediaId!: string | null;
  @ApiProperty({ type: [String] }) galleryMediaIds!: string[];
  @ApiProperty({ type: [String] }) categoryIds!: string[];
  @ApiProperty({ type: [String] }) originCountries!: string[];
  @ApiProperty({ type: String, nullable: true }) contactWhatsapp!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiProperty({ enum: ['draft', 'pending', 'verified', 'rejected', 'suspended'] })
  verificationStatus!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Why it was rejected or suspended' })
  verificationReason!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) submittedAt!: string | null;
  @ApiProperty({ enum: ['none', 'pending', 'passed', 'failed'] }) kycStatus!: string;
  @ApiProperty({ type: TradeLicenseDto }) tradeLicense!: TradeLicenseDto;
  @ApiProperty() checkoutEnabled!: boolean;
  @ApiProperty() codEnabled!: boolean;
  @ApiProperty() staffCanUploadProductImages!: boolean;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [SellerBranchDto] }) branches!: SellerBranchDto[];
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(ImageUrlsDto) },
    description:
      'One shop only: links of the logo and gallery images by media id. An image still being ' +
      'processed has no entry yet.',
  })
  imageUrls?: Record<string, ImageUrlsDto>;
}

export class SellerShopPageDto {
  @ApiProperty({ type: [SellerShopDto] }) items!: SellerShopDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: String, nullable: true }) prevCursor!: string | null;
}

// ---- Branches -----------------------------------------------------------------------------

export class MultiPolygonInput {
  @ApiProperty({ enum: ['MultiPolygon'] }) @IsIn(['MultiPolygon']) type!: 'MultiPolygon';
  @ApiProperty({
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    },
    description: 'GeoJSON coordinates, longitude first',
  })
  @IsArray()
  coordinates!: number[][][][];
}

export class CreateBranchBody {
  @ApiProperty({ example: 'Al Nahda' }) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ enum: EMIRATE_CODES }) @IsIn(EMIRATE_CODES) emirate!: string;
  @ApiProperty({ type: LatLngInput, description: 'The pin; must be in the UAE' })
  @ValidateNested()
  @Type(() => LatLngInput)
  location!: LatLngInput;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '1234567890' })
  @IsOptional()
  @Matches(/^\d{10}$/)
  makani?: string | null;
  @ApiPropertyOptional({
    type: MultiPolygonInput,
    nullable: true,
    description: 'Drawn delivery area',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MultiPolygonInput)
  serviceArea?: MultiPolygonInput | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Or a delivery radius, metres',
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100_000)
  serviceRadiusM?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pickup?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() delivery?: boolean;
  @ApiPropertyOptional({ description: 'Fils' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  deliveryFeeFils?: number;
  @ApiPropertyOptional({ description: 'Fils' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minOrderFils?: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactWhatsapp?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateBranchBody extends PartialType(CreateBranchBody) {}

export class OpeningHoursInput {
  @ApiProperty({ description: '0 = Sunday' }) @IsInt() @Min(0) @Max(6) weekday!: number;
  @ApiProperty({ example: '09:00' }) @Matches(HHMM) opensAt!: string;
  @ApiProperty({ example: '21:00', description: 'Earlier than opensAt: past midnight' })
  @Matches(HHMM)
  closesAt!: string;
}

export class SetOpeningHoursBody {
  @ApiProperty({ type: [OpeningHoursInput], description: 'The whole week; empty: closed' })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursInput)
  hours!: OpeningHoursInput[];
}

export class SetSpecialHoursBody {
  @ApiProperty() @IsBoolean() closed!: boolean;
  @ApiProperty({ type: String, nullable: true, example: '20:00' })
  @IsOptional()
  @Matches(HHMM)
  opensAt!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '03:00' })
  @IsOptional()
  @Matches(HHMM)
  closesAt!: string | null;
  @ApiProperty({ type: LocalizedInput, nullable: true, example: { en: 'Eid', ar: 'العيد' } })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedInput)
  label!: LocalizedInput | null;
}

export { OpeningHoursDto, SpecialHoursDto, LatLngDto };

// ---- Verification -------------------------------------------------------------------------

export class KycSummaryDto {
  @ApiProperty() providerStatus!: string;
  @ApiProperty({ type: String, nullable: true }) documentType!: string | null;
  @ApiProperty({ type: String, nullable: true }) issuingState!: string | null;
  @ApiProperty({ type: String, nullable: true }) nationality!: string | null;
  @ApiProperty({ type: String, nullable: true }) documentExpiry!: string | null;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty({ type: String, nullable: true }) idStatus!: string | null;
  @ApiProperty({ type: String, nullable: true }) livenessStatus!: string | null;
  @ApiProperty({ type: Number, nullable: true }) livenessScore!: number | null;
  @ApiProperty({ type: String, nullable: true }) faceMatchStatus!: string | null;
  @ApiProperty({ type: Number, nullable: true }) faceMatchScore!: number | null;
  @ApiProperty({ type: [String] }) warnings!: string[];
}

export class VerificationRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty({ enum: ['kyc', 'trade_license'] }) type!: string;
  @ApiProperty({ enum: ['started', 'pending', 'approved', 'rejected', 'expired'] }) status!: string;
  @ApiProperty({ type: KycSummaryDto, nullable: true, description: 'Admins only' })
  kyc!: KycSummaryDto | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid', description: 'Admins only' })
  documentMediaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) decidedAt!: string | null;
}

export class VerificationOverviewDto {
  @ApiProperty({ type: SellerShopDto }) shop!: SellerShopDto;
  @ApiProperty({ type: [VerificationRequestDto] }) requests!: VerificationRequestDto[];
}

export class StartKycBody {
  @ApiPropertyOptional({ enum: ['en', 'ar', 'fr'], description: 'Language of the hosted page' })
  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  locale?: string;
}

export class StartKycResponseDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ description: "The provider's page: send the browser there" }) url!: string;
}

export class SubmitTradeLicenseBody {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) legalName!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) licenseNumber!: string;
  @ApiProperty({ example: 'Dubai Department of Economy and Tourism' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  issuingAuthority!: string;
  @ApiProperty({ example: '2027-06-30' }) @Matches(DATE) expiry!: string;
  @ApiProperty({ format: 'uuid', description: 'A confirmed trade_license upload' })
  @IsUUID()
  documentMediaId!: string;
}

// ---- Catalogue ----------------------------------------------------------------------------

export class VariantInput {
  @ApiPropertyOptional({ format: 'uuid', description: 'An existing variant to keep' })
  @IsOptional()
  @IsUUID()
  id?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { size: '5 kg' },
  })
  @IsOptional()
  @IsObject()
  options?: Record<string, string>;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Fils, VAT included' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceFils?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  compareAtFils?: number | null;
}

/** The seller's food declaration; both confirmations must be true. */
export class FoodDeclarationInput {
  @ApiProperty({
    enum: [true],
    description: 'Packaged, labelled with maker, origin, ingredients, expiry',
  })
  @IsIn([true])
  packagedAndLabelled!: true;

  @ApiProperty({ enum: [true], description: 'Not fresh meat, unlabelled goods or herbal medicine' })
  @IsIn([true])
  noRestrictedItems!: true;

  @ApiProperty({ enum: ['ambient', 'chilled', 'frozen'] })
  @IsIn(['ambient', 'chilled', 'frozen'])
  storage!: 'ambient' | 'chilled' | 'frozen';

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'e.g. Dubai Municipality Montaji',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string | null;
}

export class CreateProductBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId!: string;
  @ApiProperty({ type: LocalizedInput })
  @ValidateNested()
  @Type(() => LocalizedInput)
  title!: LocalizedInput;
  @ApiPropertyOptional({ type: LocalizedInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedInput)
  description?: LocalizedInput;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'NG' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  originCountry?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Confirmed product_image uploads, in order' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  imageMediaIds?: string[];
  @ApiPropertyOptional({
    type: FoodDeclarationInput,
    nullable: true,
    description: 'Food categories',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FoodDeclarationInput)
  foodDeclaration?: FoodDeclarationInput | null;
  @ApiProperty({ type: [VariantInput], description: 'The whole list; at least one' })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VariantInput)
  variants!: VariantInput[];
}

export class UpdateProductBody extends PartialType(CreateProductBody) {}

export class SetProductStatusBody {
  @ApiProperty({
    enum: ['active', 'hidden', 'draft'],
    description: 'active publishes, or sends to review when the category needs it',
  })
  @IsIn(['active', 'hidden', 'draft'])
  status!: 'active' | 'hidden' | 'draft';
}

export class ListingInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() variantId!: string;
  @ApiProperty() @IsBoolean() inStock!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Fils' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceOverrideFils?: number | null;
}

export class SetListingsBody {
  @ApiProperty({ type: [ListingInput], description: 'Replaces every listing of the product' })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ListingInput)
  listings!: ListingInput[];
}

export class StockItemInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() variantId!: string;
  @ApiProperty() @IsBoolean() inStock!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity?: number | null;
}

export class UpdateStockBody {
  @ApiProperty({ type: [StockItemInput] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockItemInput)
  items!: StockItemInput[];
}

export class UpdatedCountDto {
  @ApiProperty() updated!: number;
}

export { BranchListingDto };

// ---- Contacts -----------------------------------------------------------------------------

export class ContactStatsQuery {
  @ApiProperty({ enum: [7, 30, 90] }) @Type(() => Number) @IsIn([7, 30, 90]) days!: 7 | 30 | 90;
}

export class ContactDayDto {
  @ApiProperty({ example: '2026-10-12' }) date!: string;
  @ApiProperty() whatsapp!: number;
  @ApiProperty() call!: number;
  @ApiProperty() email!: number;
}

export class ChannelCountsDto {
  @ApiProperty() whatsapp!: number;
  @ApiProperty() call!: number;
  @ApiProperty() email!: number;
}

export class ProductContactsDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() count!: number;
}

export class ContactStatsDto {
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty({ enum: [7, 30, 90] }) days!: number;
  @ApiProperty({ example: '2026-10-07' }) from!: string;
  @ApiProperty({ example: '2026-10-13' }) to!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ type: ChannelCountsDto }) byChannel!: ChannelCountsDto;
  @ApiProperty({ type: [ContactDayDto], description: 'Every day, Asia/Dubai, oldest first' })
  byDay!: ContactDayDto[];
  @ApiProperty({ type: [ProductContactsDto], description: 'Top 20' })
  byProduct!: ProductContactsDto[];
}
