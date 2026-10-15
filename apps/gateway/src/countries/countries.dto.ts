import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CountryNameDto {
  @ApiProperty({ example: 'United Arab Emirates' })
  en!: string;

  @ApiProperty({ example: 'الإمارات العربية المتحدة' })
  ar!: string;

  @ApiProperty({ example: 'Émirats arabes unis' })
  fr!: string;
}

export class CountryDto {
  @ApiProperty({ example: 'AE', description: 'ISO 3166-1 alpha-2' })
  code!: string;

  @ApiProperty({ type: CountryNameDto })
  name!: CountryNameDto;

  @ApiProperty({ example: '+971' })
  dialCode!: string;

  @ApiProperty({ example: '🇦🇪', description: 'Emoji flag, for places that cannot show the image' })
  flag!: string;

  @ApiProperty({ description: 'New accounts may sign up with a phone number from here' })
  phoneEnabled!: boolean;

  @ApiProperty({ description: "Offered as a shop's or product's country of origin" })
  originEnabled!: boolean;

  @ApiProperty({ description: 'Lower comes first' })
  sortOrder!: number;
}

export class CountryListDto {
  @ApiProperty({ type: [CountryDto] })
  countries!: CountryDto[];
}

export class UpdateCountryNameDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  en?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  ar?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fr?: string;
}

export class UpdateCountryDto {
  @ApiPropertyOptional({ type: UpdateCountryNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCountryNameDto)
  name?: UpdateCountryNameDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  phoneEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  originEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}
