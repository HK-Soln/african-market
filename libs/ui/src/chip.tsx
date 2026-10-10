import type { ButtonHTMLAttributes } from 'react';
import { COUNTRIES, type CountryCode } from './countries';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: IconName;
  /** Shows the country's flag before the label. */
  flag?: CountryCode;
  count?: number;
  /** The chip opens a sheet or menu instead of toggling. */
  dropdown?: boolean;
  /** Adds a remove button after the chip. Requires `removeLabel`. */
  onRemove?: () => void;
  /** Accessible name of the remove button, e.g. "Remove Nigeria". */
  removeLabel?: string;
}

/** A filter or a quick choice in a horizontally scrolling row. */
export function Chip({
  selected,
  icon,
  flag,
  count,
  dropdown,
  onRemove,
  removeLabel,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  const chip = (
    <button
      type={type}
      aria-pressed={dropdown ? undefined : Boolean(selected)}
      aria-haspopup={dropdown ? 'dialog' : undefined}
      {...rest}
      className={cx('am-chip', selected && 'am-chip-on', className)}
    >
      {flag && (
        <span className="am-flag" aria-hidden>
          {COUNTRIES[flag].flag}
        </span>
      )}
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
      {count ? <span className="am-chip-count">{count}</span> : null}
      {dropdown && <Icon name="chevron-down" size={16} />}
    </button>
  );
  if (!onRemove) return chip;
  return (
    <span className={cx('am-chip-wrap', selected && 'am-chip-on')}>
      {chip}
      <button type="button" className="am-chip-x" onClick={onRemove} aria-label={removeLabel}>
        <Icon name="x" size={16} />
      </button>
    </span>
  );
}
