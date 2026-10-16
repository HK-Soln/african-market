import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser, Roles } from '@am/auth';
import {
  CreateUploadResponse,
  MediaActor,
  MediaDto as Media,
  MediaPatterns,
  ShopDto,
  ShopsPatterns,
  PrivateMediaAccessResponse,
} from '@am/contracts';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import { CreateUploadDto, CreateUploadResponseDto, MediaDto } from './media.dto';

const MINUTE = 60_000;

/** The caller, as media needs it to decide: from the verified access token, never the body. */
const actorOf = (user: AuthenticatedUser): MediaActor => ({
  userId: user.id,
  roles: user.roles,
  shops: user.shops.map(({ shopId, role }) => ({ shopId, role })),
});

/**
 * Uploads (decision T-27): the app asks for a form, posts the file straight to the quarantine
 * bucket with it, then confirms; media checks and stores the file. The gateway never handles the
 * file itself.
 */
@ApiTags('media')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Start an upload',
    description:
      'Returns a form for one file, valid 5 minutes: POST `fields` and then the file (as `file`) ' +
      'to `url`, then call confirm. Shop purposes need `shopId` and a role in that shop.',
  })
  @ApiOkResponse({ type: CreateUploadResponseDto })
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @Post('uploads')
  @HttpCode(200)
  async createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateUploadDto,
  ): Promise<CreateUploadResponseDto> {
    return this.caller.call<CreateUploadResponse>('media', MediaPatterns.createUpload, {
      ...body,
      actor: actorOf(user),
      staffMayUpload: await this.staffMayUpload(user, body),
    });
  }

  /** Staff upload product images only where the shop allows it (decision T-29). */
  private async staffMayUpload(user: AuthenticatedUser, body: CreateUploadDto): Promise<boolean> {
    if (body.purpose !== 'product_image' || !body.shopId) return false;
    const role = user.shops.find((s) => s.shopId === body.shopId)?.role;
    if (role !== 'staff') return false;
    const shop = await this.caller.call<ShopDto>('shops', ShopsPatterns.get, {
      actor: actorOf(user),
      shopId: body.shopId,
    });
    return shop.staffCanUploadProductImages;
  }

  @ApiOperation({
    summary: 'Confirm an upload',
    description:
      'Checks the file (its real type, size and pixels) and stores it: images as WebP sizes ' +
      'without their metadata, a trade licence privately. 422 MEDIA_FILE_REJECTED with ' +
      'details.reason when it fails.',
  })
  @ApiOkResponse({ type: MediaDto })
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  @Post('uploads/:id/confirm')
  @HttpCode(200)
  confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<MediaDto> {
    return this.caller.call<Media>(
      'media',
      MediaPatterns.confirmUpload,
      { actor: actorOf(user), mediaId: id, correlationId: correlationId(req) },
      // Encoding three sizes of a large photo takes longer than an ordinary call.
      30_000,
    );
  }
}

/** Private documents, for admins. The bytes pass through here; no link ever reaches the browser. */
@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('admin')
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Download a private document (a trade licence)',
    description: 'Every download is logged with the admin and the request id.',
  })
  @ApiProduces('application/pdf', 'image/webp')
  @Get(':id/content')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const access = await this.caller.call<PrivateMediaAccessResponse>(
      'media',
      MediaPatterns.privateAccess,
      { actor: actorOf(user), mediaId: id, correlationId: correlationId(req) },
    );
    const upstream = await fetch(access.url).catch(() => undefined);
    if (!upstream?.ok || !upstream.body) {
      throw new HttpException({ code: 'UPSTREAM_UNAVAILABLE', service: 'media' }, 503);
    }
    res.status(200).set({
      'Content-Type': access.contentType,
      'Content-Disposition': `attachment; filename="${access.filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Opened directly, it may run nothing and load nothing.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    Readable.fromWeb(upstream.body as ReadableStream).pipe(res);
  }
}
