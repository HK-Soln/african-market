/**
 * Opening hours as the shop page shows them, in Asia/Dubai (UTC+4 all year, no daylight saving).
 * Weekdays are 0 = Sunday, as the shops service stores them. A period whose closing time is
 * earlier than its opening time runs past midnight into the next day.
 */

export interface Period {
  opensAt: string;
  closesAt: string;
}

export interface WeeklyPeriod extends Period {
  weekday: number;
}

export interface SpecialDay {
  /** YYYY-MM-DD in Dubai. */
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  label?: Partial<Record<string, string>> | null;
}

export interface BranchHours {
  openingHours: WeeklyPeriod[];
  specialHours: SpecialDay[];
}

export interface DubaiMoment {
  /** YYYY-MM-DD */
  date: string;
  weekday: number;
  /** Minutes since midnight. */
  minutes: number;
}

const DUBAI_OFFSET_MS = 4 * 3_600_000;

export function dubaiMoment(at: Date): DubaiMoment {
  const local = new Date(at.getTime() + DUBAI_OFFSET_MS);
  return {
    date: local.toISOString().slice(0, 10),
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** The Dubai date `days` after `date`, with its weekday. */
export function addDays(date: string, days: number): { date: string; weekday: number } {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export interface DaySchedule {
  periods: Period[];
  /** The special hours that replace the usual ones that day, if any. */
  special?: SpecialDay;
}

/** What a day looks like: its special hours if it has them, else the weekly ones. */
export function daySchedule(hours: BranchHours, date: string, weekday: number): DaySchedule {
  const special = hours.specialHours.find((s) => s.date === date);
  if (special) {
    return {
      special,
      periods:
        special.closed || !special.opensAt || !special.closesAt
          ? []
          : [{ opensAt: special.opensAt, closesAt: special.closesAt }],
    };
  }
  return {
    periods: hours.openingHours
      .filter((p) => p.weekday === weekday)
      .map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))
      .sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt)),
  };
}

/** Open at this moment, counting yesterday's periods that run past midnight. */
export function isOpenAt(hours: BranchHours, at: Date): boolean {
  const now = dubaiMoment(at);
  const today = daySchedule(hours, now.date, now.weekday);
  const inToday = today.periods.some((p) => {
    const opens = toMinutes(p.opensAt);
    const closes = toMinutes(p.closesAt);
    return closes > opens ? now.minutes >= opens && now.minutes < closes : now.minutes >= opens; // runs past midnight
  });
  if (inToday) return true;
  const yesterday = addDays(now.date, -1);
  return daySchedule(hours, yesterday.date, yesterday.weekday).periods.some((p) => {
    const opens = toMinutes(p.opensAt);
    const closes = toMinutes(p.closesAt);
    return closes <= opens && now.minutes < closes;
  });
}

export interface WeekRow extends DaySchedule {
  date: string;
  weekday: number;
  isToday: boolean;
}

/** The next seven days from today, so special days this week show where they fall. */
export function nextSevenDays(hours: BranchHours, at: Date): WeekRow[] {
  const today = dubaiMoment(at).date;
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i);
    return { ...day, ...daySchedule(hours, day.date, day.weekday), isToday: i === 0 };
  });
}

/** Special days after this week and within `days`, for "coming up" notes. */
export function laterSpecialDays(hours: BranchHours, at: Date, days = 30): SpecialDay[] {
  const today = dubaiMoment(at).date;
  const from = addDays(today, 7).date;
  const to = addDays(today, days).date;
  return hours.specialHours
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** True when the branch has no hours at all (the page says "hours not given"). */
export const hasNoHours = (hours: BranchHours) =>
  hours.openingHours.length === 0 && hours.specialHours.length === 0;
