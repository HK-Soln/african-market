'use client';

import { LOCALES, textDirection, type Locale } from '@am/i18n';
import { cx } from './cx';
import { Icon } from './icon';

/** Each language is written in its own script, so these are not translated. */
const LANGUAGE: Record<Locale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  ar: { short: 'العربية', name: 'العربية' },
  fr: { short: 'FR', name: 'Français' },
};

export interface LanguageSwitcherProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** `segmented` for headers; `list` for first open and Settings. */
  variant?: 'segmented' | 'list';
  /** Accessible name of the group, e.g. "Language". */
  label: string;
  /** Languages to offer. Defaults to all three. */
  locales?: readonly Locale[];
}

/**
 * The language picker. It only reports the choice: the app changes the URL locale, which sets
 * `lang`, `dir` and the font stack on `<html>`.
 */
export function LanguageSwitcher({
  value,
  onChange,
  variant = 'segmented',
  label,
  locales = LOCALES,
}: LanguageSwitcherProps) {
  if (variant === 'list') {
    return (
      <div className="am-lang-list" role="radiogroup" aria-label={label}>
        {locales.map((locale) => {
          const on = locale === value;
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={on}
              lang={locale}
              dir={textDirection(locale)}
              className={cx('am-lang-item', on && 'am-on')}
              onClick={() => onChange(locale)}
            >
              <span className="am-lang-name">{LANGUAGE[locale].name}</span>
              {on && <Icon name="check" />}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="am-lang" role="radiogroup" aria-label={label}>
      {locales.map((locale) => {
        const on = locale === value;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={on}
            lang={locale}
            className={cx('am-lang-seg', on && 'am-on')}
            onClick={() => onChange(locale)}
            title={LANGUAGE[locale].name}
          >
            {LANGUAGE[locale].short}
          </button>
        );
      })}
    </div>
  );
}
