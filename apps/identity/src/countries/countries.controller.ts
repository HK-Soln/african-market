import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { COUNTRY_LIST_SPEC, CountryDto, CountryPage, IdentityPatterns } from '@am/contracts';
import { listQueryFromPayload } from '@am/core';
import { actorSchema, parsePayload } from '../validation';
import { CountriesService } from './countries.service';

const name = z.string().trim().min(1).max(100);

const updateSchema = z
  .object({
    actor: actorSchema.optional(),
    correlationId: z.string().max(128).optional(),
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
  list(@Payload() payload: unknown): Promise<CountryPage> {
    return this.countries.list(listQueryFromPayload(payload, COUNTRY_LIST_SPEC));
  }

  @MessagePattern(IdentityPatterns.listAllCountries)
  listAll(@Payload() payload: unknown): Promise<CountryPage> {
    return this.countries.listAll(listQueryFromPayload(payload, COUNTRY_LIST_SPEC));
  }

  /** The gateway only lets admins reach this. */
  @MessagePattern(IdentityPatterns.updateCountry)
  update(@Payload() payload: unknown): Promise<CountryDto> {
    return this.countries.update(parsePayload(updateSchema, payload));
  }
}
