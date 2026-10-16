import { DataSource } from 'typeorm';
import {
  CountryDto,
  CountryPage,
  IdentityErrors,
  ListQuery,
  phoneCountry,
  UpdateCountryRequest,
} from '@am/contracts';
import { findPage } from '@am/database';
import { Country } from '../entities';
import { identityError } from '../errors';

/** Says whether a new account may sign up with this phone number. */
export interface PhoneCountryPolicy {
  allowsNewPhone(e164: string): Promise<boolean>;
}

/** Every phone allowed: for tests that are not about countries. */
export const ALLOW_EVERY_PHONE: PhoneCountryPolicy = { allowsNewPhone: async () => true };

const toDto = (country: Country): CountryDto => ({
  code: country.code,
  name: { en: country.name.en ?? '', ar: country.name.ar ?? '', fr: country.name.fr ?? '' },
  dialCode: country.dialCode,
  flag: country.flag,
  phoneEnabled: country.phoneEnabled,
  originEnabled: country.originEnabled,
  sortOrder: country.sortOrder,
});

/** COUNTRY_LIST_SPEC's fields as SQL. Names sort by their English form. */
const COLUMNS = {
  sortOrder: 'c.sort_order',
  name: "(c.name->>'en')",
  code: 'c.code',
  phoneEnabled: 'c.phone_enabled',
  originEnabled: 'c.origin_enabled',
  enabled: '(c.phone_enabled OR c.origin_enabled)',
  search: "concat_ws(' ', c.code, c.name->>'en', c.name->>'ar', c.name->>'fr')",
};

/** Countries: reference data the apps list and admins edit. */
export class CountriesService implements PhoneCountryPolicy {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Country);
  }

  private async page(query: ListQuery, enabledOnly: boolean): Promise<CountryPage> {
    const qb = this.repo.createQueryBuilder('c');
    if (enabledOnly) qb.where('(c.phone_enabled OR c.origin_enabled)');
    const page = await findPage(qb, query, { columns: COLUMNS, id: 'c.id' });
    return { ...page, items: page.items.map(toDto) };
  }

  /** What pickers and badges offer: enabled for phone sign-up or as an origin. */
  list(query: ListQuery): Promise<CountryPage> {
    return this.page(query, true);
  }

  /** Every country, for admins. */
  listAll(query: ListQuery): Promise<CountryPage> {
    return this.page(query, false);
  }

  async update(input: UpdateCountryRequest): Promise<CountryDto> {
    const country = await this.repo.findOneBy({ code: input.code.toUpperCase() });
    if (!country) throw identityError(IdentityErrors.countryNotFound);
    if (input.name) country.name = { ...country.name, ...input.name };
    if (input.phoneEnabled !== undefined) country.phoneEnabled = input.phoneEnabled;
    if (input.originEnabled !== undefined) country.originEnabled = input.originEnabled;
    if (input.sortOrder !== undefined) country.sortOrder = input.sortOrder;
    return toDto(await this.repo.save(country));
  }

  async allowsNewPhone(e164: string): Promise<boolean> {
    const code = phoneCountry(e164);
    if (!code) return false;
    return this.repo.existsBy({ code, phoneEnabled: true });
  }
}
