import type { ReactNode } from 'react';
import type { Locale } from '@am/i18n';
import { CountryFlag } from './country-flag';
import { countryName, type CountryOption } from './countries';
import { cx } from './cx';
import { formatAED } from './format';
import { Icon, type IconName } from './icon';

export type BadgeTone =
  | 'verified'
  | 'sponsored'
  | 'open'
  | 'closed'
  | 'soon'
  | 'delivers'
  | 'checkout'
  | 'pending'
  | 'rejected'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand';

const TONE_ICON: Partial<Record<BadgeTone, IconName>> = {
  verified: 'rosette-discount-check',
  open: 'clock',
  closed: 'clock',
  soon: 'clock',
  delivers: 'truck',
  checkout: 'shopping-bag',
  pending: 'clock',
  rejected: 'circle-x',
  success: 'circle-check',
  danger: 'alert-triangle',
  warning: 'alert-triangle',
  info: 'info-circle',
};

export interface BadgeProps {
  /**
   * `verified` is only for shops that passed KYC; never style anything else to look like it.
   * `sponsored` is always the literal word, outlined, with no icon.
   */
  tone?: BadgeTone;
  /** Overrides the tone's icon; `false` removes it. */
  icon?: IconName | false;
  className?: string;
  children?: ReactNode;
}

/** A short, non-interactive status label. Status always carries a word, never colour alone. */
export function Badge({ tone = 'neutral', icon, className, children }: BadgeProps) {
  const name = icon === false ? undefined : (icon ?? TONE_ICON[tone]);
  return (
    <span className={cx('am-badge', `am-badge-${tone}`, className)}>
      {name && <Icon name={name} size={14} strokeWidth={2} />}
      <span>{children}</span>
    </span>
  );
}

export interface OriginBadgeProps {
  country: Pick<CountryOption, 'code' | 'name'>;
  /** Language of the country name. */
  locale?: Locale;
  className?: string;
  /** Overrides the country name. */
  children?: ReactNode;
}

/** Where a product or shop is from: the flag and the country name, always together. */
export function OriginBadge({ country, locale = 'en', className, children }: OriginBadgeProps) {
  return (
    <span className={cx('am-badge', 'am-badge-origin', className)}>
      <CountryFlag code={country.code} className="am-flag" />
      <span>{children ?? countryName(country, locale)}</span>
    </span>
  );
}

export interface PriceProps {
  /** Dirhams, VAT-inclusive. Convert from fils before passing: `fils / 100`. */
  amount: number;
  /** Word shown before the amount when a product has variants, e.g. "From". */
  from?: string;
  /** Unit shown after the amount, e.g. "kg". */
  unit?: string;
  size?: 'lg';
  className?: string;
}

/** A price as `AED 24.50`, isolated left-to-right so it reads correctly inside Arabic. */
export function Price({ amount, from, unit, size, className }: PriceProps) {
  return (
    <span className={cx('am-price', size && `am-price-${size}`, className)}>
      {from && <span className="am-price-from">{from} </span>}
      <bdi dir="ltr" className="am-price-amount">
        {formatAED(amount)}
      </bdi>
      {unit && <span className="am-price-unit"> / {unit}</span>}
    </span>
  );
}
