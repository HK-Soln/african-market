import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('reads a local UAE mobile number as +971', () => {
    expect(normalizePhone('050 123 4567')).toBe('+971501234567');
    expect(normalizePhone('501234567')).toBe('+971501234567');
  });

  it('keeps an E.164 UAE number, ignoring spaces and dashes', () => {
    expect(normalizePhone(' +971 50-123 4567 ')).toBe('+971501234567');
  });

  it('accepts home-country numbers written with their country code', () => {
    expect(normalizePhone('+234 803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('+254 712 345678')).toBe('+254712345678');
    expect(normalizePhone('00233 24 123 4567')).toBe('+233241234567');
  });

  it('rejects text, short numbers and impossible numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+971 50 123')).toBeNull();
  });
});
