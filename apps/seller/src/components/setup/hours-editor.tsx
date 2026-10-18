'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, IconButton, Toggle } from '@am/ui';
import {
  copyToAll,
  dayProblem,
  DEFAULT_PERIOD,
  EDITOR_DAYS,
  type Period,
  type Week,
} from '@/lib/hours';

/** A Sunday, so `weekday` days later names that weekday. */
const SUNDAY = Date.UTC(2026, 0, 4);

/**
 * The week, Monday first: each day open or closed, with up to three periods (a split shift is
 * two), a period may run past midnight, and one day can be copied to every day.
 */
export function HoursEditor({ week, onChange }: { week: Week; onChange: (week: Week) => void }) {
  const t = useTranslations('hours');
  const locale = useLocale();
  const [copiedFrom, setCopiedFrom] = useState<number | null>(null);
  const dayName = (weekday: number) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(SUNDAY + weekday * 86_400_000),
    );

  const setDay = (weekday: number, periods: Period[]) => {
    setCopiedFrom(null);
    onChange(week.map((day, i) => (i === weekday ? periods : day)));
  };

  return (
    <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
      {EDITOR_DAYS.map((weekday) => {
        const periods = week[weekday];
        const open = periods.length > 0;
        const problem = dayProblem(periods);
        const dayId = `day-${weekday}`;
        return (
          <section key={weekday} aria-labelledby={dayId} className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={dayId} className="font-semibold">
                {dayName(weekday)}
              </h3>
              <Toggle
                label={open ? t('open') : t('closed')}
                checked={open}
                onChange={(ev) => setDay(weekday, ev.target.checked ? [{ ...DEFAULT_PERIOD }] : [])}
              />
            </div>
            {periods.map((period, index) => {
              const overnight = period.closesAt < period.opensAt;
              return (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    {t('opens')}
                    <span className="am-input">
                      <input
                        type="time"
                        value={period.opensAt}
                        required
                        onChange={(ev) =>
                          setDay(
                            weekday,
                            periods.map((p, i) =>
                              i === index ? { ...p, opensAt: ev.target.value } : p,
                            ),
                          )
                        }
                      />
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    {t('closes')}
                    <span className="am-input">
                      <input
                        type="time"
                        value={period.closesAt}
                        required
                        onChange={(ev) =>
                          setDay(
                            weekday,
                            periods.map((p, i) =>
                              i === index ? { ...p, closesAt: ev.target.value } : p,
                            ),
                          )
                        }
                      />
                    </span>
                  </label>
                  {periods.length > 1 && (
                    <IconButton
                      icon="x"
                      label={t('removePeriod')}
                      onClick={() =>
                        setDay(
                          weekday,
                          periods.filter((_, i) => i !== index),
                        )
                      }
                    />
                  )}
                  {overnight && (
                    <p className="w-full text-sm text-ink-muted">{t('pastMidnight')}</p>
                  )}
                </div>
              );
            })}
            {problem && (
              <p role="alert" className="text-sm text-danger">
                {t(`problem${problem}`)}
              </p>
            )}
            {open && (
              <div className="flex flex-wrap gap-2">
                {periods.length < 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    iconStart="plus"
                    onClick={() =>
                      setDay(weekday, [...periods, { opensAt: '16:00', closesAt: '22:00' }])
                    }
                  >
                    {t('addPeriod')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onChange(copyToAll(week, weekday));
                    setCopiedFrom(weekday);
                  }}
                >
                  {t('copyToAll')}
                </Button>
                {copiedFrom === weekday && (
                  <span role="status" className="self-center text-sm text-success">
                    {t('copied')}
                  </span>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
