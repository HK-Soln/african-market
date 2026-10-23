import { Body, Controller, Delete, Get, Header, Inject, Patch, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '@am/auth';
import { DeleteMeResponse, IdentityPatterns, MeResponse, PersonalDataExport } from '@am/contracts';
import { APP_ENV } from '@am/core';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import type { GatewayEnv } from '../env';
import { clearAuthCookies } from './auth-cookies';
import { DeleteMeResponseDto, MeDto, UpdateMeDto } from './dto/me.dto';

const HOUR = 60 * 60 * 1000;

/** The signed-in person's own profile, and their rights over it (UAE PDPL). */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly caller: ServiceCaller,
    @Inject(APP_ENV) private readonly env: GatewayEnv,
  ) {}

  @ApiOperation({ summary: 'Who is signed in, and their shops' })
  @ApiOkResponse({ type: MeDto })
  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    return this.caller.call<MeResponse>('identity', IdentityPatterns.getMe, { userId: user.id });
  }

  @ApiOperation({ summary: 'Change name, language, home emirate or marketing consent' })
  @ApiOkResponse({ type: MeDto })
  @Patch()
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateMeDto): Promise<MeDto> {
    return this.caller.call<MeResponse>('identity', IdentityPatterns.updateMe, {
      ...body,
      userId: user.id,
    });
  }

  @ApiOperation({
    summary: 'Download everything identity holds about you, as JSON',
    description:
      'Profile, consents, sign-in methods, sign-ins with their devices, addresses and shop roles. ' +
      'Never secrets. Sent as a file (Content-Disposition: attachment).',
  })
  @ApiOkResponse({
    description: 'The export (format african-market.identity/1).',
    schema: { type: 'object' },
  })
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @Header('Cache-Control', 'no-store')
  @Get('export')
  async exportMe(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PersonalDataExport> {
    const data = await this.caller.call<PersonalDataExport>('identity', IdentityPatterns.exportMe, {
      userId: user.id,
    });
    const day = data.exportedAt.slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="african-market-data-${day}.json"`);
    return data;
  }

  @ApiOperation({
    summary: 'Delete your account',
    description:
      'Closes the account at once and signs it out everywhere; its personal data is erased 30 ' +
      'days later. Needs a sign-in in the last 10 minutes, otherwise 403 AUTH_REAUTH_REQUIRED.',
  })
  @ApiOkResponse({ type: DeleteMeResponseDto })
  @ApiForbiddenResponse({ description: 'AUTH_REAUTH_REQUIRED: sign in again, then retry.' })
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @Delete()
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DeleteMeResponseDto> {
    const result = await this.caller.call<DeleteMeResponse>('identity', IdentityPatterns.deleteMe, {
      userId: user.id,
      authTime: user.auth_time,
      correlationId: correlationId(req),
    });
    clearAuthCookies(res, req.clientApp, this.env);
    return result;
  }
}
