import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { IdentityPatterns, MeResponse } from '@am/contracts';
import { fields, parsePayload } from '../validation';
import { UsersService } from './users.service';

const getMeSchema = z.object({ userId: fields.userId });

const updateMeSchema = z.object({
  userId: fields.userId,
  name: z.string().max(200).nullable().optional(),
  preferredLanguage: z.string().max(8).optional(),
  homeEmirate: z.string().max(8).nullable().optional(),
  marketingConsent: z.boolean().optional(),
});

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @MessagePattern(IdentityPatterns.getMe)
  getMe(@Payload() payload: unknown): Promise<MeResponse> {
    return this.users.getMe(parsePayload(getMeSchema, payload));
  }

  @MessagePattern(IdentityPatterns.updateMe)
  updateMe(@Payload() payload: unknown): Promise<MeResponse> {
    return this.users.updateMe(parsePayload(updateMeSchema, payload));
  }
}
