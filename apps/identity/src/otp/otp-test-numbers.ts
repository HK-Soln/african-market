import { normalizePhone } from '@am/contracts';
import { isOtpCodeFormat } from './otp-code';

/**
 * Phone numbers whose code is fixed and never sent: for the end-to-end tests on staging, which
 * cannot read a real WhatsApp message. Configured by OTP_TEST_NUMBERS as
 * `+971500000001:123456,+971500000002:654321`, kept in Secrets Manager.
 *
 * Everything else about the code stays the same (five minutes, five tries, used once, the rate
 * limits), so a test exercises the real flow. Identity refuses to start with any test number in
 * production (assertSafeIdentityEnv).
 */
export class OtpTestNumbers {
  private constructor(private readonly codes: ReadonlyMap<string, string>) {}

  static none(): OtpTestNumbers {
    return new OtpTestNumbers(new Map());
  }

  /** The OTP_TEST_NUMBERS setting as loaded: undefined when it is `none`. */
  static fromSetting(setting: string | undefined): OtpTestNumbers {
    return setting === undefined ? OtpTestNumbers.none() : OtpTestNumbers.parse(setting);
  }

  /** Parses the setting; throws on anything malformed, so a typo is found at start. */
  static parse(setting: string): OtpTestNumbers {
    const codes = new Map<string, string>();
    for (const entry of setting
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const separator = entry.lastIndexOf(':');
      const phone = normalizePhone(entry.slice(0, separator));
      const code = entry.slice(separator + 1);
      // The entry is not echoed back: it holds a code.
      if (separator < 1 || !phone || !isOtpCodeFormat(code))
        throw new Error('OTP_TEST_NUMBERS: each entry is <phone>:<six-digit code>');
      codes.set(phone, code);
    }
    return new OtpTestNumbers(codes);
  }

  get size(): number {
    return this.codes.size;
  }

  /** The fixed code for a normalised phone, or undefined for everyone else. */
  codeFor(phone: string): string | undefined {
    return this.codes.get(phone);
  }
}
