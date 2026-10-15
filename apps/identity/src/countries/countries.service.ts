import { DataSource, FindOptionsWhere } from 'typeorm';
import {
  CountryDto,
  IdentityErrors,
  ListCountriesResponse,
  phoneCountry,
  UpdateCountryRequest,
} from '@am/contracts';
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

/** Countries: reference data the apps list and admins edit. */
export class CountriesService implements PhoneCountryPolicy {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Country);
  }

  private async sorted(where?: FindOptionsWhere<Country>[]): Promise<CountryDto[]> {
    const rows = await this.repo.find({ where, order: { sortOrder: 'ASC' } });
    // Ties by English name, so the order never depends on insertion.
    return rows
      .map(toDto)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en, 'en'));
  }

  /** What pickers and badges offer: enabled for phone sign-up or as an origin. */
  async list(): Promise<ListCountriesResponse> {
    return { countries: await this.sorted([{ phoneEnabled: true }, { originEnabled: true }]) };
  }

  /** Every country, for admins. */
  async listAll(): Promise<ListCountriesResponse> {
    return { countries: await this.sorted() };
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
