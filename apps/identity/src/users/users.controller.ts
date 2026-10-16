import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { DeleteMeResponse, IdentityPatterns, MeResponse, PersonalDataExport } from '@am/contracts';
import { fields, parsePayload } from '../validation';
import { PrivacyService } from './privacy.service';
import { UsersService } from './users.service';

const getMeSchema = z.object({ userId: fields.userId });

const updateMeSchema = z.object({
  userId: fields.userId,
  name: z.string().max(200).nullable().optional(),
  preferredLanguage: z.string().max(8).optional(),
  homeEmirate: z.string().max(8).nullable().optional(),
  marketingConsent: z.boolean().optional(),
});

const deleteMeSchema = z.object({
  userId: fields.userId,
  authTime: z.number().int().positive().optional(),
  correlationId: z.string().max(128).optional(),
});

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly privacy: PrivacyService,
  ) {}

  @MessagePattern(IdentityPatterns.getMe)
  getMe(@Payload() payload: unknown): Promise<MeResponse> {
    return this.users.getMe(parsePayload(getMeSchema, payload));
  }

  @MessagePattern(IdentityPatterns.updateMe)
  updateMe(@Payload() payload: unknown): Promise<MeResponse> {
    return this.users.updateMe(parsePayload(updateMeSchema, payload));
  }

  @MessagePattern(IdentityPatterns.exportMe)
  exportMe(@Payload() payload: unknown): Promise<PersonalDataExport> {
    return this.privacy.exportMe(parsePayload(getMeSchema, payload));
  }

  @MessagePattern(IdentityPatterns.deleteMe)
  deleteMe(@Payload() payload: unknown): Promise<DeleteMeResponse> {
    return this.privacy.deleteMe(parsePayload(deleteMeSchema, payload));
  }
}
