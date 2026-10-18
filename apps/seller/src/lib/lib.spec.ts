import { copyToAll, dayProblem, weekFromApi, weekProblem, weekToApi } from './hours';
import { aedText, filsFromAed } from './money';
import { checkPhone, checkWhatsapp, splitPhone } from './phone';
import { nextStep, setupProgress } from './setup';

describe('opening hours editor', () => {
  it('reads and writes the stored hours, sorted per day', () => {
    const stored = [
      { weekday: 1, opensAt: '16:00', closesAt: '22:00' },
      { weekday: 1, opensAt: '09:00', closesAt: '13:00' },
      { weekday: 5, opensAt: '20:00', closesAt: '02:00' },
    ];
    const week = weekFromApi(stored);
    expect(week[1]).toEqual([
      { opensAt: '09:00', closesAt: '13:00' },
      { opensAt: '16:00', closesAt: '22:00' },
    ]);
    expect(week[0]).toEqual([]);
    expect(weekToApi(week)).toHaveLength(3);
  });

  it('copies one day to every day, as separate copies', () => {
    const week = copyToAll(weekFromApi([{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }]), 1);
    expect(week.every((d) => d.length === 1 && d[0].opensAt === '09:00')).toBe(true);
    week[0][0].opensAt = '10:00';
    expect(week[1][0].opensAt).toBe('09:00');
  });

  it('accepts split shifts and nights past midnight, refuses overlaps and empty periods', () => {
    expect(
      dayProblem([
        { opensAt: '09:00', closesAt: '13:00' },
        { opensAt: '16:00', closesAt: '02:00' },
      ]),
    ).toBeNull();
    expect(
      dayProblem([
        { opensAt: '09:00', closesAt: '14:00' },
        { opensAt: '13:00', closesAt: '18:00' },
      ]),
    ).toBe('overlap');
    expect(dayProblem([{ opensAt: '09:00', closesAt: '09:00' }])).toBe('same-time');
    const week = weekFromApi([
      { weekday: 3, opensAt: '09:00', closesAt: '09:00' },
      { weekday: 0, opensAt: '09:00', closesAt: '09:00' },
    ]);
    // Monday first: Wednesday is found before Sunday.
    expect(weekProblem(week)).toEqual({ weekday: 3, problem: 'same-time' });
  });
});

describe('phone numbers', () => {
  it('writes valid numbers as E.164 and says why others fail', () => {
    expect(checkPhone('050 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(checkPhone('04 123 4567', 'AE')).toEqual({ ok: true, e164: '+97141234567' });
    expect(checkPhone('123', 'AE')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkPhone('  ', 'AE')).toEqual({ ok: false, reason: 'empty' });
  });

  it('only takes mobile numbers for WhatsApp', () => {
    expect(checkWhatsapp('050 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(checkWhatsapp('04 123 4567', 'AE')).toEqual({ ok: false, reason: 'not-mobile' });
    expect(checkWhatsapp('0803 123 4567', 'NG')).toEqual({ ok: true, e164: '+2348031234567' });
  });

  it('splits a stored number back for editing', () => {
    expect(splitPhone('+971501234567')).toEqual({ national: '50 123 4567', country: 'AE' });
    expect(checkPhone('50 123 4567', 'AE')).toEqual({ ok: true, e164: '+971501234567' });
    expect(splitPhone(null)).toBeNull();
  });
});

describe('dirham amounts', () => {
  it('reads what sellers type and refuses anything else', () => {
    expect(filsFromAed('')).toBe(0);
    expect(filsFromAed('10')).toBe(1000);
    expect(filsFromAed('12.5')).toBe(1250);
    expect(filsFromAed('12,50')).toBe(1250);
    expect(filsFromAed('1.005')).toBeNull();
    expect(filsFromAed('-3')).toBeNull();
    expect(filsFromAed('ten')).toBeNull();
    expect(aedText(1000)).toBe('10');
    expect(aedText(1250)).toBe('12.50');
    expect(aedText(0)).toBe('');
  });
});

describe('where onboarding resumes', () => {
  const base = {
    name: 'Mama Nkechi',
    branches: [],
    contactWhatsapp: null,
    contactPhone: null,
    contactEmail: null,
    logoMediaId: null,
    verificationStatus: 'draft',
  };
  const branch = {
    isPrimary: true,
    openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }],
  };
  type Shop = Parameters<typeof nextStep>[0];

  it('goes to the first needed step, past the optional photos', () => {
    expect(nextStep(base as unknown as Shop)).toBe('branch');
    const ready = { ...base, branches: [branch], contactWhatsapp: '+971501234567' };
    expect(nextStep(ready as unknown as Shop)).toBe('verify');
    expect(setupProgress(ready as unknown as Shop).photos).toBe(false);
    expect(nextStep({ ...ready, verificationStatus: 'pending' } as unknown as Shop)).toBeNull();
  });
});
