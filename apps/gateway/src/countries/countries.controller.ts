import { Body, Controller, Get, Header, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Public, Roles } from '@am/auth';
import {
  COUNTRY_LIST_SPEC,
  CountryDto as Country,
  CountryPage,
  IdentityPatterns,
  type ListQuery,
} from '@am/contracts';
import { actorOf } from '../common/actor';
import { ApiListQuery, ListQueryParams } from '../common/list-query';
import { correlationId } from '../common/request-context';
import { ServiceCaller } from '../common/service-caller';
import { CountryDto, CountryPageDto, UpdateCountryDto } from './countries.dto';

/** Countries for the pickers and badges in every app. */
@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({ summary: 'Countries enabled for phone sign-up or as an origin' })
  @ApiOkResponse({ type: CountryPageDto })
  @ApiListQuery(COUNTRY_LIST_SPEC)
  @Public()
  // Changes rarely, and an admin's edit may take five minutes to show.
  @Header('Cache-Control', 'public, max-age=300')
  @Get()
  list(@ListQueryParams(COUNTRY_LIST_SPEC) query: ListQuery): Promise<CountryPageDto> {
    return this.caller.call<CountryPage>('identity', IdentityPatterns.listCountries, { query });
  }
}

/** Countries as admins edit them. */
@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('admin')
@Controller('admin/countries')
export class AdminCountriesController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({ summary: 'Every country, enabled or not' })
  @ApiOkResponse({ type: CountryPageDto })
  @ApiListQuery(COUNTRY_LIST_SPEC)
  @Header('Cache-Control', 'no-store')
  @Get()
  listAll(@ListQueryParams(COUNTRY_LIST_SPEC) query: ListQuery): Promise<CountryPageDto> {
    return this.caller.call<CountryPage>('identity', IdentityPatterns.listAllCountries, { query });
  }

  @ApiOperation({
    summary: 'Rename a country, reorder it, or switch phone sign-up or origin on or off',
  })
  @ApiParam({ name: 'code', example: 'NG' })
  @ApiOkResponse({ type: CountryDto })
  @Patch(':code')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: UpdateCountryDto,
    @Req() req: Request,
  ): Promise<CountryDto> {
    return this.caller.call<Country>('identity', IdentityPatterns.updateCountry, {
      ...body,
      code,
      actor: actorOf(user),
      correlationId: correlationId(req),
    });
  }
}
