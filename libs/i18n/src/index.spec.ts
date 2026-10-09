import { pickLocalized, textDirection } from './index';

describe('i18n helpers', () => {
  it('falls back to English when a translation is missing', () => {
    expect(pickLocalized({ en: 'Egusi' }, 'ar')).toBe('Egusi');
  });
  it('marks Arabic as right-to-left', () => {
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('fr')).toBe('ltr');
  });
});
