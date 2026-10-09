import { buildWhatsAppLink } from './contact';
import { vatFromInclusive } from './money';

describe('buildWhatsAppLink', () => {
  it('strips the plus and encodes the message', () => {
    expect(buildWhatsAppLink('+971 50 123 4567', 'Hi, is egusi in stock?')).toBe(
      'https://wa.me/971501234567?text=Hi%2C%20is%20egusi%20in%20stock%3F',
    );
  });
});

describe('vatFromInclusive', () => {
  it('extracts 5% VAT from an inclusive price', () => {
    expect(vatFromInclusive(10500)).toBe(500);
  });
});
