import { isOpenAt, laterSpecialDays, nextSevenDays, type BranchHours } from './hours';

/** Monday 2026-10-12 in Dubai, at the given local time. */
const monday = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00+04:00`);

const hours = (overrides: Partial<BranchHours> = {}): BranchHours => ({
  openingHours: [
    { weekday: 1, opensAt: '09:00', closesAt: '13:00' },
    { weekday: 1, opensAt: '16:00', closesAt: '22:00' },
    // Friday into Saturday.
    { weekday: 5, opensAt: '20:00', closesAt: '02:00' },
  ],
  specialHours: [],
  ...overrides,
});

describe('opening hours in Dubai', () => {
  it('follows split shifts', () => {
    expect(isOpenAt(hours(), monday('08:59'))).toBe(false);
    expect(isOpenAt(hours(), monday('09:00'))).toBe(true);
    expect(isOpenAt(hours(), monday('14:00'))).toBe(false);
    expect(isOpenAt(hours(), monday('21:59'))).toBe(true);
    expect(isOpenAt(hours(), monday('22:00'))).toBe(false);
  });

  it('counts a period past midnight on the next morning', () => {
    expect(isOpenAt(hours(), new Date('2026-10-16T23:00:00+04:00'))).toBe(true); // Friday
    expect(isOpenAt(hours(), new Date('2026-10-17T01:30:00+04:00'))).toBe(true); // Saturday
    expect(isOpenAt(hours(), new Date('2026-10-17T02:00:00+04:00'))).toBe(false);
  });

  it('lets a special day replace the usual hours', () => {
    const closedToday = hours({
      specialHours: [{ date: '2026-10-12', closed: true, opensAt: null, closesAt: null }],
    });
    expect(isOpenAt(closedToday, monday('10:00'))).toBe(false);
    const late = hours({
      specialHours: [{ date: '2026-10-12', closed: false, opensAt: '12:00', closesAt: '23:30' }],
    });
    expect(isOpenAt(late, monday('10:00'))).toBe(false);
    expect(isOpenAt(late, monday('23:00'))).toBe(true);
  });

  it('lists the next seven days from today, marking today and special days', () => {
    const week = nextSevenDays(
      hours({
        specialHours: [{ date: '2026-10-14', closed: true, opensAt: null, closesAt: null }],
      }),
      monday('10:00'),
    );
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(week[0]).toMatchObject({ isToday: true, periods: [{ opensAt: '09:00' }, { opensAt: '16:00' }] });
    expect(week[2]).toMatchObject({ date: '2026-10-14', periods: [], special: { closed: true } });
    expect(week[1].periods).toEqual([]);
  });

  it('keeps later special days for a note', () => {
    const later = laterSpecialDays(
      hours({
        specialHours: [
          { date: '2026-10-13', closed: true, opensAt: null, closesAt: null },
          { date: '2026-11-02', closed: true, opensAt: null, closesAt: null },
          { date: '2026-10-25', closed: true, opensAt: null, closesAt: null },
          { date: '2027-01-01', closed: true, opensAt: null, closesAt: null },
        ],
      }),
      monday('10:00'),
    );
    expect(later.map((d) => d.date)).toEqual(['2026-10-25', '2026-11-02']);
  });
});
