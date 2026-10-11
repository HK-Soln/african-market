import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '@am/auth';
import { IdentityPatterns, MeResponse } from '@am/contracts';
import { ServiceCaller } from '../common/service-caller';
import { MeDto, UpdateMeDto } from './dto/me.dto';

/** The signed-in person's own profile. */
@ApiTags('me')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('me')
export class MeController {
  constructor(private readonly caller: ServiceCaller) {}

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
}
