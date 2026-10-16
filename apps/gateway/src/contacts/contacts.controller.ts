import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsUUID, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthenticatedUser, CurrentUser, Public } from '@am/auth';
import {
  CONTACT_CHANNELS,
  CONTACT_DEDUP_MINUTES,
  type ContactTapChannel,
  RecordContactResponse,
  ShopsPatterns,
} from '@am/contracts';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';

export class RecordContactDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shopId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'When the tap was on a product' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ enum: CONTACT_CHANNELS })
  @IsIn(CONTACT_CHANNELS)
  channel!: ContactTapChannel;

  @ApiProperty({
    example: 'k3J9xQ2mZpL8',
    description: "The app's random visitor id (8-64 letters, digits, - or _), kept on the device",
  })
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  sessionId!: string;

  @ApiPropertyOptional({
    example: '/en/shops/lagos-kitchen',
    description: 'The app path, no query',
  })
  @IsOptional()
  @MaxLength(200)
  @Matches(/^\/[^?#\s]*$/)
  sourcePage?: string;
}

export class RecordContactResponseDto {
  @ApiProperty({ description: 'False when it repeated a tap within the de-duplication window' })
  recorded!: boolean;
}

@ApiTags('contact')
@Controller('contact-events')
export class ContactsController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Record a WhatsApp, call or email tap',
    description:
      `Public. Send it when the customer taps, before opening WhatsApp, the dialer or mail. ` +
      `Repeats by the same visitor on the same shop and channel within ${CONTACT_DEDUP_MINUTES} ` +
      `minutes are not counted again. A signed-in customer's tap carries their account.`,
  })
  @ApiAcceptedResponse({ type: RecordContactResponseDto })
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(202)
  record(
    @Body() body: RecordContactDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<RecordContactResponse> {
    return this.caller.call<RecordContactResponse>('shops', ShopsPatterns.recordContact, {
      ...body,
      userId: user?.id,
      correlationId: correlationId(req),
    });
  }
}
