import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  AuthenticatedUserResponse,
  EmailCodeResponse,
  IdentityPatterns,
  VerifyOtpResponse,
} from '@am/contracts';
import { fields, parsePayload } from '../validation';
import { EmailAuthService } from './email-auth.service';

const registerSchema = z.object({
  email: fields.email,
  password: fields.password,
  name: z.string().max(120).optional(),
  preferredLanguage: fields.locale,
  termsAccepted: z.boolean(),
  marketingConsent: z.boolean().optional(),
  locale: fields.locale,
  ip: fields.ip,
});

const emailOnlySchema = z.object({ email: fields.email, locale: fields.locale, ip: fields.ip });

const verifySchema = z.object({
  email: fields.email,
  code: fields.code,
  password: fields.password,
  correlationId: fields.correlationId,
});

const loginSchema = z.object({ email: fields.email, password: fields.password, ip: fields.ip });

const resetSchema = z.object({
  email: fields.email,
  code: fields.code,
  newPassword: fields.password,
});

@Controller()
export class EmailAuthController {
  constructor(private readonly auth: EmailAuthService) {}

  @MessagePattern(IdentityPatterns.registerWithEmail)
  register(@Payload() payload: unknown): Promise<EmailCodeResponse> {
    return this.auth.register(parsePayload(registerSchema, payload));
  }

  @MessagePattern(IdentityPatterns.resendEmailCode)
  resendCode(@Payload() payload: unknown): Promise<EmailCodeResponse> {
    return this.auth.resendCode(parsePayload(emailOnlySchema, payload));
  }

  @MessagePattern(IdentityPatterns.verifyEmail)
  verifyEmail(@Payload() payload: unknown): Promise<VerifyOtpResponse> {
    return this.auth.verifyEmail(parsePayload(verifySchema, payload));
  }

  @MessagePattern(IdentityPatterns.loginWithPassword)
  login(@Payload() payload: unknown): Promise<AuthenticatedUserResponse> {
    return this.auth.login(parsePayload(loginSchema, payload));
  }

  @MessagePattern(IdentityPatterns.requestPasswordReset)
  requestPasswordReset(@Payload() payload: unknown): Promise<EmailCodeResponse> {
    return this.auth.requestPasswordReset(parsePayload(emailOnlySchema, payload));
  }

  @MessagePattern(IdentityPatterns.resetPassword)
  resetPassword(@Payload() payload: unknown): Promise<AuthenticatedUserResponse> {
    return this.auth.resetPassword(parsePayload(resetSchema, payload));
  }
}
