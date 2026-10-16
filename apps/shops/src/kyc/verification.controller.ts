import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  KYC_DOCUMENT_KINDS,
  KycDocumentAccessResponse,
  ShopErrors,
  ShopsPatterns,
  StartKycResponse,
  VERIFICATION_QUEUE_LIST_SPEC,
  VerificationOverviewDto,
  VerificationQueuePage,
} from '@am/contracts';
import { listQueryFromPayload } from '@am/core';
import { shopError } from '../errors';
import { VerificationService } from './verification.service';

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw shopError(ShopErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const actor = z.object({
  userId: uuid,
  roles: z.array(z.string().max(32)).max(10),
  shops: z.array(z.object({ shopId: uuid, role: z.enum(['owner', 'manager', 'staff']) })).max(100),
});
const correlationId = z.string().max(128).optional();
const shopRef = { actor, shopId: uuid, correlationId };

const startSchema = z.object({ ...shopRef, locale: z.string().max(8).optional() });
const shopSchema = z.object(shopRef);
const webhookSchema = z.object({
  rawBody: z.string().max(1_000_000),
  headers: z.record(z.string(), z.string()),
  correlationId,
});
const licenseSchema = z.object({
  ...shopRef,
  legalName: z.string().min(2).max(200),
  licenseNumber: z.string().min(2).max(60),
  issuingAuthority: z.string().min(2).max(120),
  expiry: z.iso.date(),
  documentMediaId: uuid,
});
const decideListingSchema = z.object({
  ...shopRef,
  decision: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: z.string().max(1000).optional(),
});
const decideLicenseSchema = z.object({
  ...shopRef,
  requestId: uuid,
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
});
const documentSchema = z.object({ ...shopRef, requestId: uuid, kind: z.enum(KYC_DOCUMENT_KINDS) });

@Controller()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @MessagePattern(ShopsPatterns.getVerification)
  get(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.get(parse(shopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.startKyc)
  startKyc(@Payload() payload: unknown): Promise<StartKycResponse> {
    return this.verification.startKyc(parse(startSchema, payload));
  }

  @MessagePattern(ShopsPatterns.refreshKyc)
  refreshKyc(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.refreshKyc(parse(shopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.kycWebhook)
  webhook(@Payload() payload: unknown): Promise<{ accepted: boolean }> {
    return this.verification.webhook(parse(webhookSchema, payload));
  }

  @MessagePattern(ShopsPatterns.submitForVerification)
  submit(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.submit(parse(shopSchema, payload));
  }

  @MessagePattern(ShopsPatterns.submitTradeLicense)
  submitTradeLicense(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.submitTradeLicense(parse(licenseSchema, payload));
  }

  @MessagePattern(ShopsPatterns.verificationQueue)
  queue(@Payload() payload: unknown): Promise<VerificationQueuePage> {
    const { actor: who } = parse(z.object({ actor }).passthrough(), payload);
    return this.verification.queue({
      actor: who,
      query: listQueryFromPayload(payload, VERIFICATION_QUEUE_LIST_SPEC),
    });
  }

  @MessagePattern(ShopsPatterns.decideListing)
  decideListing(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.decideListing(parse(decideListingSchema, payload));
  }

  @MessagePattern(ShopsPatterns.decideTradeLicense)
  decideTradeLicense(@Payload() payload: unknown): Promise<VerificationOverviewDto> {
    return this.verification.decideTradeLicense(parse(decideLicenseSchema, payload));
  }

  @MessagePattern(ShopsPatterns.kycDocument)
  kycDocument(@Payload() payload: unknown): Promise<KycDocumentAccessResponse> {
    return this.verification.kycDocument(parse(documentSchema, payload));
  }
}
