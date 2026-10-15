import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { CountryDto, IdentityPatterns, ListCountriesResponse } from '@am/contracts';
import { parsePayload } from '../validation';
import { CountriesService } from './countries.service';

const name = z.string().trim().min(1).max(100);

const updateSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z]{2}$/),
    name: z.object({ en: name, ar: name, fr: name }).partial().strict().optional(),
    phoneEnabled: z.boolean().optional(),
    originEnabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

@Controller()
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @MessagePattern(IdentityPatterns.listCountries)
  list(): Promise<ListCountriesResponse> {
    return this.countries.list();
  }

  @MessagePattern(IdentityPatterns.listAllCountries)
  listAll(): Promise<ListCountriesResponse> {
    return this.countries.listAll();
  }

  /** The gateway only lets admins reach this. */
  @MessagePattern(IdentityPatterns.updateCountry)
  update(@Payload() payload: unknown): Promise<CountryDto> {
    return this.countries.update(parsePayload(updateSchema, payload));
  }
}
