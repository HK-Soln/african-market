import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { UserResponseDto } from './auth.dto';

export class UpdateMeDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'ar', 'fr'] })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  preferredLanguage?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'],
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(8)
  homeEmirate?: string | null;

  @ApiPropertyOptional({ description: 'True records consent now; false withdraws it.' })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class ShopMembershipDto {
  @ApiProperty({ format: 'uuid' })
  shopId!: string;

  @ApiProperty({ enum: ['owner', 'manager', 'staff'] })
  role!: 'owner' | 'manager' | 'staff';

  @ApiProperty({ type: [String], description: 'Empty means every branch.' })
  branchIds!: string[];
}

export class MeDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ type: [ShopMembershipDto] })
  shops!: ShopMembershipDto[];
}
