'use client';

import { useId, type InputHTMLAttributes } from 'react';
import { COUNTRIES, type CountryCode } from './countries';
import { Field } from './field';
import { Icon } from './icon';

export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode'
> {
  label: string;
  /** Defaults to the UAE (+971). */
  country?: CountryCode;
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
 */
export function PhoneInput({
  label,
  country = 'AE',
  onCountryClick,
  countryLabel,
  hint,
  error,
  className,
  id,
  placeholder = '50 123 4567',
  ...rest
}: PhoneInputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const selected = COUNTRIES[country];
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={className}>
      <div className="am-phone" dir="ltr">
        <button
          type="button"
          className="am-phone-country"
          onClick={onCountryClick}
          aria-label={`${countryLabel}: ${selected.en} ${selected.dial}`}
        >
          <span className="am-flag" aria-hidden>
            {selected.flag}
          </span>
          <span className="am-phone-dial">{selected.dial}</span>
          <Icon name="chevron-down" size={16} />
        </button>
        <input
          id={fieldId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
}
