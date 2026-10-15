'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { CountryFlag } from './country-flag';
import type { Locale } from '@am/i18n';
import { countryName, phonePlaceholder, UAE, type CountryOption } from './countries';
import { Field } from './field';
import { Icon } from './icon';

export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode'
> {
  label: string;
  /** Defaults to the UAE (+971). */
  country?: CountryOption;
  /** Language of the country's name in the button's accessible name. */
  locale?: Locale;
  /** Opens the country picker. Customers may use a home-country WhatsApp number. */
  onCountryClick?: () => void;
  /** Accessible name of the country button, e.g. "Country code". */
  countryLabel: string;
  hint?: string;
  error?: string;
}

/**
 * A phone field with a country-code button. The whole control is left-to-right in every
 * language: phone numbers are never mirrored. The value is the national number as typed;
 * normalise to E.164 with `normalizePhone` from `@am/contracts` before sending it anywhere.
 * The placeholder is a typical number for the country; format the value as it is typed with
 * `formatPhoneAsTyped`.
 */
export function PhoneInput({
  label,
  country = UAE,
  locale = 'en',
  onCountryClick,
  countryLabel,
  hint,
  error,
  className,
  id,
  placeholder,
  ...rest
}: PhoneInputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={className}>
      <div className="am-phone min-w-0" dir="ltr">
        <button
          type="button"
          className="am-phone-country"
          onClick={onCountryClick}
          aria-label={`${countryLabel}: ${countryName(country, locale)} ${country.dialCode}`}
        >
          <CountryFlag code={country.code} className="am-flag" />
          <span className="am-phone-dial">{country.dialCode}</span>
          <Icon name="chevron-down" size={16} />
        </button>
        <input
          id={fieldId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={placeholder ?? phonePlaceholder(country)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
}
