/**
 * The week of opening hours as the seller edits it. Weekdays are 0 = Sunday (as stored); the
 * editor lists Monday first. A day with no periods is closed; two periods are a split shift; a
 * closing time earlier than the opening time runs past midnight.
 */

export interface Period {
  opensAt: string;
  closesAt: string;
}

/** Seven days, index = weekday (0 = Sunday). */
export type Week = Period[][];

export interface WeeklyPeriod extends Period {
  weekday: number;
}

/** Monday to Sunday, the order the editor shows. */
export const EDITOR_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export const emptyWeek = (): Week => Array.from({ length: 7 }, () => []);

/** A usual shop day to start from. */
export const DEFAULT_PERIOD: Period = { opensAt: '09:00', closesAt: '21:00' };

export function weekFromApi(hours: WeeklyPeriod[]): Week {
  const week = emptyWeek();
  for (const { weekday, opensAt, closesAt } of hours) week[weekday].push({ opensAt, closesAt });
  for (const day of week) day.sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  return week;
}

export const weekToApi = (week: Week): WeeklyPeriod[] =>
  week.flatMap((periods, weekday) => periods.map((p) => ({ weekday, ...p })));

/** Every day like this one (the "copy to all days" button). */
export const copyToAll = (week: Week, from: number): Week =>
  week.map(() => week[from].map((p) => ({ ...p })));

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export type DayProblem = 'same-time' | 'overlap' | 'too-many';

/** At most three periods a day, none of zero length, none overlapping (past midnight counts). */
export function dayProblem(periods: Period[]): DayProblem | null {
  if (periods.length > 3) return 'too-many';
  if (periods.some((p) => p.opensAt === p.closesAt)) return 'same-time';
  const spans = periods
    .map((p) => {
      const start = minutes(p.opensAt);
      const end = minutes(p.closesAt);
      return [start, end > start ? end : end + 24 * 60] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) return 'overlap';
  }
  return null;
}

/** The first day with a problem, or null when the week can be saved. */
export function weekProblem(week: Week): { weekday: number; problem: DayProblem } | null {
  for (const weekday of EDITOR_DAYS) {
    const problem = dayProblem(week[weekday]);
    if (problem) return { weekday, problem };
  }
  return null;
}
