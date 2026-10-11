import { createTransport, type Transporter } from 'nodemailer';
import { AppRpcException } from '@am/core';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends an email. Nothing in identity talks to a mail vendor directly; it goes through this
 * interface so tests use a fake.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Plain SMTP: Mailpit locally. It also reaches Amazon SES through SES's SMTP endpoint, which is
 * the simplest production route until the API adapter below is written.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    // Nodemailer waits minutes by default; a sign-up must fail fast when the mail server is down.
    this.transport = createTransport({
      url: smtpUrl,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  close(): void {
    this.transport.close();
  }
}

/**
 * Placeholder for sending through the SES API with the task's IAM role (no SMTP credentials).
 * Written with the AWS infrastructure (F0-13); until then it fails loudly.
 */
export class SesEmailProvider implements EmailProvider {
  async send(): Promise<void> {
    throw new AppRpcException({
      status: 503,
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      message: 'The SES email provider is not configured yet; use EMAIL_PROVIDER=smtp',
    });
  }
}
