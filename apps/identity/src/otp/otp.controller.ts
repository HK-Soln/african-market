import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { IdentityPatterns, RequestOtpResponse, VerifyOtpResponse } from '@am/contracts';
import { fields, parsePayload } from '../validation';
import { OtpService } from './otp.service';

const requestOtpSchema = z.object({
  phone: z.string().min(1).max(32),
  channel: z.enum(['sms', 'whatsapp']).optional(),
  locale: z.string().max(8).optional(),
  ip: z.string().max(64).optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().min(1).max(12),
  preferredLanguage: z.string().max(8).optional(),
  termsAccepted: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  correlationId: z.string().max(128).optional(),
  ip: fields.ip,
  userAgent: fields.userAgent,
});

@Controller()
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @MessagePattern(IdentityPatterns.requestOtp)
  requestOtp(@Payload() payload: unknown): Promise<RequestOtpResponse> {
    return this.otp.requestOtp(parsePayload(requestOtpSchema, payload));
  }

  @MessagePattern(IdentityPatterns.verifyOtp)
  verifyOtp(@Payload() payload: unknown): Promise<VerifyOtpResponse> {
    return this.otp.verifyOtp(parsePayload(verifyOtpSchema, payload));
  }
}
