import { AppRpcException } from '@am/core';
import { OtpDeliveryChannel } from '@am/contracts';

export interface SmsMessage {
  /** E.164. */
  to: string;
  body: string;
  channel: OtpDeliveryChannel;
}

/**
 * Sends a text message to a phone. Nothing in identity talks to an SMS vendor directly; it goes
 * through this interface so local runs and tests use a fake.
 */
export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/**
 * Development and test only: prints the message to stdout so a developer can read the code.
 * Written with `process.stdout` rather than the logger so it never reaches a log pipeline, and
 * refused in staging and production by `assertSafeIdentityEnv`.
 */
export class ConsoleSmsProvider implements SmsProvider {
  async send(message: SmsMessage): Promise<void> {
    process.stdout.write(`[sms:${message.channel}] to ${message.to}: ${message.body}\n`);
  }
}

/**
 * Placeholder for the production sender (Twilio or a UAE-licensed aggregator with a registered
 * sender ID). Sending is not implemented until the sender ID is registered and credentials
 * exist; it fails loudly rather than pretending a message went out.
 */
export class TwilioSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    throw new AppRpcException({
      status: 503,
      code: 'SMS_PROVIDER_NOT_CONFIGURED',
      message: 'The SMS provider is not configured yet',
    });
  }
}
