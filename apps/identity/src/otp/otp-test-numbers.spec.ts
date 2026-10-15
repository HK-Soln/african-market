import { OtpTestNumbers } from './otp-test-numbers';

describe('OtpTestNumbers', () => {
  it('reads phone:code pairs and normalises the phones', () => {
    const numbers = OtpTestNumbers.parse('+971500000001:123456, 0500000002:654321');
    expect(numbers.size).toBe(2);
    expect(numbers.codeFor('+971500000001')).toBe('123456');
    expect(numbers.codeFor('+971500000002')).toBe('654321');
    expect(numbers.codeFor('+971500000003')).toBeUndefined();
  });

  it('is empty when the setting is', () => {
    expect(OtpTestNumbers.parse('').size).toBe(0);
    expect(OtpTestNumbers.none().size).toBe(0);
  });

  it.each(['+971500000001', '+971500000001:12345', 'not-a-phone:123456', ':123456'])(
    'refuses a malformed entry (%s) without repeating it',
    (setting) => {
      expect(() => OtpTestNumbers.parse(setting)).toThrow(
        'OTP_TEST_NUMBERS: each entry is <phone>:<six-digit code>',
      );
    },
  );
});
