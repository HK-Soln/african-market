import { Controller, Inject, Module, type Type } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { IdentityErrors, IdentityTestPatterns, normalizePhone } from '@am/contracts';
import { identityError } from '../errors';
import { MemorySmsProvider, SMS_PROVIDER, SmsProvider } from '../sms/sms-provider';
import { parsePayload } from '../validation';

const lastOtpSchema = z.object({ phone: z.string().min(1).max(32) });

/**
 * Lets an end-to-end test read the code it was "sent". This hands out sign-in codes, so it must
 * never exist outside a test run: it is only registered by `testSupportModules('test')`, and it
 * only answers when the SMS provider is the in-memory one.
 */
@Controller()
export class TestSupportController {
  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  @MessagePattern(IdentityTestPatterns.lastOtp)
  lastOtp(@Payload() payload: unknown): { code: string | null } {
    const { phone } = parsePayload(lastOtpSchema, payload);
    const normalized = normalizePhone(phone);
    if (!normalized) throw identityError(IdentityErrors.phoneInvalid);
    if (!(this.sms instanceof MemorySmsProvider)) return { code: null };
    return { code: this.sms.lastTo(normalized)?.body.match(/\d{6}/)?.[0] ?? null };
  }
}

@Module({ controllers: [TestSupportController] })
export class TestSupportModule {}

/** The test-only modules to load: all of them under NODE_ENV=test, none otherwise. */
export const testSupportModules = (nodeEnv: string | undefined): Type<unknown>[] =>
  nodeEnv === 'test' ? [TestSupportModule] : [];
