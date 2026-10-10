import { otpMessage } from './otp-message';

describe('otpMessage', () => {
  it('carries the code in every language', () => {
    for (const locale of ['en', 'ar', 'fr'])
      expect(otpMessage('004821', locale)).toContain('004821');
  });

  it('falls back to English for an unknown or missing locale', () => {
    expect(otpMessage('004821', 'de')).toBe(otpMessage('004821', 'en'));
    expect(otpMessage('004821')).toBe(otpMessage('004821', 'en'));
  });

  it('isolates the code left-to-right inside Arabic', () => {
    expect(otpMessage('004821', 'ar')).toContain('⁦004821⁩');
  });
});
