import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { MEDIA_PURPOSES, type MediaPurpose } from '@am/contracts';

export class CreateUploadDto {
  @ApiProperty({ enum: MEDIA_PURPOSES })
  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'image/jpeg, image/png or image/webp; also application/pdf for trade_license',
  })
  @IsString()
  @MaxLength(100)
  contentType!: string;

  @ApiProperty({
    example: 482113,
    description: 'The file size in bytes; the upload link takes exactly this many',
  })
  @IsInt()
  @IsPositive()
  sizeBytes!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for shop_logo, shop_gallery, product_image and trade_license',
  })
  @IsOptional()
  @IsUUID()
  shopId?: string;
}

export class UploadTargetDto {
  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({
    description: 'A signed link to the quarantine bucket, for exactly this type and size',
  })
  url!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Headers to send exactly as given (Content-Type)',
  })
  headers!: Record<string, string>;
}

export class CreateUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  mediaId!: string;

  @ApiProperty({ type: UploadTargetDto })
  upload!: UploadTargetDto;

  @ApiProperty({ format: 'date-time', description: 'The link stops working then (5 minutes)' })
  expiresAt!: string;
}

export class MediaUrlsDto {
  @ApiPropertyOptional({ description: '200 px wide' })
  thumb?: string;

  @ApiPropertyOptional({ description: '600 px wide' })
  card?: string;

  @ApiPropertyOptional({ description: '1600 px wide' })
  full?: string;
}

export class MediaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MEDIA_PURPOSES })
  purpose!: MediaPurpose;

  @ApiProperty({ enum: ['pending', 'ready', 'rejected', 'deleted'] })
  status!: 'pending' | 'ready' | 'rejected' | 'deleted';

  @ApiProperty({ type: String, nullable: true, example: 'image/webp' })
  contentType!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({
    type: MediaUrlsDto,
    description: 'Empty for private documents, which never have a URL',
  })
  urls!: MediaUrlsDto;
}
