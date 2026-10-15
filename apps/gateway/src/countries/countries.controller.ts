import { Body, Controller, Get, Header, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public, Roles } from '@am/auth';
import { CountryDto as Country, IdentityPatterns, ListCountriesResponse } from '@am/contracts';
import { ServiceCaller } from '../common/service-caller';
import { CountryDto, CountryListDto, UpdateCountryDto } from './countries.dto';

/** Countries for the pickers and badges in every app. */
@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly caller: ServiceCaller) {}

  @ApiOperation({
    summary: 'Countries enabled for phone sign-up or as an origin, in display order',
  })
  @ApiOkResponse({ type: CountryListDto })
  @Public()
  // Changes rarely, and an admin's edit may take five minutes to show.
  @Header('Cache-Control', 'public, max-age=300')
  @Get()
  list(): Promise<CountryListDto> {
    return this.caller.call<ListCountriesResponse>('identity', IdentityPatterns.listCountries, {});
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
  @ApiOkResponse({ type: CountryListDto })
  @Header('Cache-Control', 'no-store')
  @Get()
  listAll(): Promise<CountryListDto> {
    return this.caller.call<ListCountriesResponse>(
      'identity',
      IdentityPatterns.listAllCountries,
      {},
    );
  }

  @ApiOperation({
    summary: 'Rename a country, reorder it, or switch phone sign-up or origin on or off',
  })
  @ApiParam({ name: 'code', example: 'NG' })
  @ApiOkResponse({ type: CountryDto })
  @Patch(':code')
  update(@Param('code') code: string, @Body() body: UpdateCountryDto): Promise<CountryDto> {
    return this.caller.call<Country>('identity', IdentityPatterns.updateCountry, { ...body, code });
  }
}
