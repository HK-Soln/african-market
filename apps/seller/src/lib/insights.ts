import type { components } from '@am/api-client';

export type ContactStats = components['schemas']['ContactStatsDto'];
type Day = ContactStats['byDay'][number];

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export interface Column {
  label: string;
  axisLabel?: string;
  values: { whatsapp: number; call: number; email: number };
}

const at = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * The contact taps as chart columns. A week or a month is one column a day (a month labels
 * every seventh day, counted back from today); 90 days is one column a week, newest weeks full.
 */
export function contactColumns(byDay: Day[], period: Period, locale: string): Column[] {
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  const full = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
  const weekday = fmt({ weekday: 'short' });
  const dayMonth = fmt({ day: 'numeric', month: 'short' });

  if (period !== 90) {
    return byDay.map((d, i) => ({
      label: full.format(at(d.date)),
      axisLabel:
        period === 7
          ? weekday.format(at(d.date))
          : (byDay.length - 1 - i) % 7 === 0
            ? dayMonth.format(at(d.date))
            : undefined,
      values: { whatsapp: d.whatsapp, call: d.call, email: d.email },
    }));
  }

  const weeks: Day[][] = [];
  for (let end = byDay.length; end > 0; end -= 7)
    weeks.unshift(byDay.slice(Math.max(0, end - 7), end));
  return weeks.map((week, i) => {
    const first = at(week[0].date);
    const last = at(week[week.length - 1].date);
    const sum = (key: 'whatsapp' | 'call' | 'email') => week.reduce((n, d) => n + d[key], 0);
    return {
      label: `${dayMonth.format(first)} – ${dayMonth.format(last)}`,
      axisLabel: (weeks.length - 1 - i) % 3 === 0 ? dayMonth.format(first) : undefined,
      values: { whatsapp: sum('whatsapp'), call: sum('call'), email: sum('email') },
    };
  });
}

/** The share of all taps, as a whole percent. */
export const share = (part: number, total: number) =>
  total ? Math.round((part / total) * 100) : 0;
