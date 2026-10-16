import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DecideListingBody {
  @ApiProperty({
    enum: ['approve', 'reject', 'suspend', 'reinstate'],
    description: 'approve needs the identity check passed; reject and suspend need a reason',
  })
  @IsIn(['approve', 'reject', 'suspend', 'reinstate'])
  decision!: 'approve' | 'reject' | 'suspend' | 'reinstate';

  @ApiPropertyOptional({ description: 'Shown to the seller' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DecideBody {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Required to reject; shown to the seller' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CategoryNameInput {
  @ApiProperty() @IsString() @MaxLength(80) en!: string;
  @ApiProperty() @IsString() @MaxLength(80) ar!: string;
  @ApiPropertyOptional({ description: 'English is shown until it is set' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fr?: string;
}

export class CreateCategoryBody {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiProperty({ example: 'hair-extensions' })
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  @MaxLength(60)
  slug!: string;

  @ApiProperty({ type: CategoryNameInput })
  @ValidateNested()
  @Type(() => CategoryNameInput)
  name!: CategoryNameInput;

  @ApiPropertyOptional({ enum: ['product', 'service'], description: 'A child takes its parent’s' })
  @IsOptional()
  @IsIn(['product', 'service'])
  kind?: 'product' | 'service';

  @ApiPropertyOptional({ description: 'Products in it are reviewed before they show' })
  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @ApiPropertyOptional({ description: 'Food: needs the seller declaration' })
  @IsOptional()
  @IsBoolean()
  requiresDeclaration?: boolean;

  @ApiPropertyOptional({ description: 'False: never sold through checkout' })
  @IsOptional()
  @IsBoolean()
  checkoutAllowed?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sort?: number;

  @ApiPropertyOptional({ description: 'Inactive: hidden with everything under it' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCategoryBody extends PartialType(CreateCategoryBody) {}

export class AdminCategoriesQuery {
  @ApiPropertyOptional({ description: 'Inactive categories too' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeInactive?: boolean;
}

export class EmirateSearchBody {
  @ApiProperty({ description: 'Open customer search in the emirate, or close it' })
  @IsBoolean()
  open!: boolean;
}

export class RebuildResponseDto {
  @ApiProperty() shops!: number;
  @ApiProperty() branches!: number;
  @ApiProperty() products!: number;
  @ApiProperty({ description: 'Rows of shops no longer verified, or gone' }) removed!: number;
}
