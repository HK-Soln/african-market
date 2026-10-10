import { randomUUID } from 'node:crypto';
import { generateOtpCode, hashOtpCode, isOtpCodeFormat, otpCodeMatches } from './otp-code';

const secret = `${randomUUID()}${randomUUID()}`;

describe('one-time codes', () => {
  it('generates six digits, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('recognises the code format', () => {
    expect(isOtpCodeFormat('004821')).toBe(true);
    expect(isOtpCodeFormat('4821')).toBe(false);
    expect(isOtpCodeFormat('12345a')).toBe(false);
    expect(isOtpCodeFormat('1234567')).toBe(false);
  });

  it('matches only the right code for the right challenge and key', () => {
    const hash = hashOtpCode(secret, 'challenge-1', '123456');
    expect(otpCodeMatches(secret, 'challenge-1', '123456', hash)).toBe(true);
    expect(otpCodeMatches(secret, 'challenge-1', '123457', hash)).toBe(false);
    expect(otpCodeMatches(secret, 'challenge-2', '123456', hash)).toBe(false);
    expect(otpCodeMatches(`${secret}x`, 'challenge-1', '123456', hash)).toBe(false);
  });

  it('never stores the code itself', () => {
    expect(hashOtpCode(secret, 'challenge-1', '123456')).not.toContain('123456');
  });
});
