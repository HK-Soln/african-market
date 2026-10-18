'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import { Button, IconButton, Input, Toggle } from '@am/ui';
import { shopsApi, type SellerBranch } from '@/lib/shops';
import { useErrorText } from '../error-text';

/** Today in Dubai, YYYY-MM-DD (UTC+4 all year). */
const dubaiToday = () => new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);

/**
 * Days that differ from the usual week: closed for Eid, open late in Ramadan, a national holiday.
 * Each replaces the weekly hours on its date; past days drop off the list.
 */
export function SpecialDays({
  shopId,
  branch,
  onChange,
}: {
  shopId: string;
  branch: SellerBranch;
  onChange: () => Promise<unknown>;
}) {
  const t = useTranslations('branches');
  const h = useTranslations('hours');
  const s = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const today = dubaiToday();
  const [date, setDate] = useState('');
  const [closed, setClosed] = useState(true);
  const [opensAt, setOpensAt] = useState('10:00');
  const [closesAt, setClosesAt] = useState('22:00');
  const [labelEn, setLabelEn] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  const upcoming = [...branch.specialHours]
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!date || date < today) return setError(t('dateRequired'));
    if (!closed && opensAt === closesAt) return setError(h('problemsame-time'));
    setSaving(true);
    setError(null);
    const label = Object.fromEntries(
      [
        ['en', labelEn.trim()],
        ['ar', labelAr.trim()],
      ].filter(([, v]) => v),
    );
    const result = await shopsApi.setSpecialDay(shopId, branch.id, date, {
      closed,
      opensAt: closed ? null : opensAt,
      closesAt: closed ? null : closesAt,
      label: Object.keys(label).length ? label : null,
    });
    if (result.ok) {
      await onChange();
      setDate('');
      setLabelEn('');
      setLabelAr('');
    } else setError(errorText(result.code));
    setSaving(false);
  };

  const remove = async (day: string) => {
    const result = await shopsApi.deleteSpecialDay(shopId, branch.id, day);
    if (result.ok) await onChange();
    else setError(errorText(result.code));
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="special-days">
      <div className="flex flex-col gap-1">
        <h2 id="special-days" className="text-lg font-semibold">
          {t('specialDays')}
        </h2>
        <p className="text-sm text-ink-muted">{t('specialDaysHint')}</p>
      </div>

      {upcoming.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {upcoming.map((day) => (
            <li key={day.date} className="flex items-center justify-between gap-3 p-3">
              <span className="flex flex-col">
                <span className="font-semibold">
                  {dayFormat.format(new Date(`${day.date}T00:00:00Z`))}
                </span>
                <span className="text-sm text-ink-muted">
                  {day.closed || !day.opensAt || !day.closesAt ? (
                    h('closed')
                  ) : (
                    <bdi dir="ltr">
                      {day.opensAt}–{day.closesAt}
                    </bdi>
                  )}
                  {day.label && pickLocalized(day.label, locale)
                    ? ` · ${pickLocalized(day.label, locale)}`
                    : ''}
                </span>
              </span>
              <IconButton icon="x" label={t('removeDay')} onClick={() => void remove(day.date)} />
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={add}
        noValidate
        className="flex flex-col gap-4 rounded-lg border border-line p-3"
      >
        <h3 className="font-semibold">{t('addDay')}</h3>
        <Input
          label={t('date')}
          type="date"
          dir="ltr"
          min={today}
          value={date}
          onChange={(ev) => setDate(ev.target.value)}
        />
        <Toggle
          label={closed ? h('closed') : h('open')}
          checked={!closed}
          onChange={(ev) => setClosed(!ev.target.checked)}
        />
        {!closed && (
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {h('opens')}
              <span className="am-input">
                <input type="time" value={opensAt} onChange={(ev) => setOpensAt(ev.target.value)} />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {h('closes')}
              <span className="am-input">
                <input
                  type="time"
                  value={closesAt}
                  onChange={(ev) => setClosesAt(ev.target.value)}
                />
              </span>
            </label>
          </div>
        )}
        <Input
          label={t('labelEn')}
          optional={s('optional')}
          placeholder={t('labelEnPlaceholder')}
          dir="ltr"
          maxLength={60}
          value={labelEn}
          onChange={(ev) => setLabelEn(ev.target.value)}
        />
        <Input
          label={t('labelAr')}
          optional={s('optional')}
          placeholder={t('labelArPlaceholder')}
          dir="rtl"
          maxLength={60}
          value={labelAr}
          onChange={(ev) => setLabelAr(ev.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="self-start" loading={saving} loadingLabel={s('saving')}>
          {t('addDay')}
        </Button>
      </form>
    </section>
  );
}
