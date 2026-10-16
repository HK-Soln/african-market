import { Controller, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '@am/auth';
import { ShopsPatterns } from '@am/contracts';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';

/** The only headers a provider's signature check needs; nothing else is passed on. */
const DIDIT_HEADERS = ['x-signature', 'x-signature-v2', 'x-timestamp'];

/**
 * Calls from outside providers. Not for the apps, so not in the API docs. The gateway checks
 * nothing itself: the service that owns the provider checks the signature on the exact bytes
 * received (the raw body), and fetches anything it acts on from the provider directly.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly caller: ServiceCaller) {}

  /** Didit: a verification session changed (decision T-28). 401 makes Didit retry later. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('didit')
  @HttpCode(200)
  didit(@Req() req: RawBodyRequest<Request>): Promise<{ accepted: boolean }> {
    const headers = Object.fromEntries(
      DIDIT_HEADERS.flatMap((name) => {
        const value = req.headers[name];
        return typeof value === 'string' ? [[name, value]] : [];
      }),
    );
    return this.caller.call('shops', ShopsPatterns.kycWebhook, {
      rawBody: req.rawBody?.toString('utf8') ?? '',
      headers,
      correlationId: correlationId(req),
    });
  }
}
