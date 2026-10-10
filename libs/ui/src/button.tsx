import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'whatsapp';

interface ButtonStyleProps {
  /** `primary` (clay) appears at most once per screen. Default `secondary`. */
  variant?: ButtonVariant;
  /** Default is 48px tall. `sm` (36px) is for the admin console on pointer devices only. */
  size?: 'sm' | 'lg';
  iconStart?: IconName;
  iconEnd?: IconName;
  fullWidth?: boolean;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  /** Keeps the width, shows a spinner and sets `aria-busy`. */
  loading?: boolean;
  /** Replaces the label while loading, e.g. "Saving", so the change is announced. */
  loadingLabel?: string;
}

const buttonClass = (
  { variant = 'secondary', size, fullWidth }: ButtonStyleProps,
  loading: boolean | undefined,
  className: string | undefined,
) =>
  cx(
    'am-btn',
    `am-btn-${variant}`,
    size && `am-btn-${size}`,
    fullWidth && 'am-btn-full',
    loading && 'am-btn-loading',
    className,
  );

function content(children: ReactNode, iconStart?: IconName, iconEnd?: IconName) {
  return (
    <>
      {iconStart && <Icon name={iconStart} />}
      <span className="am-btn-label">{children}</span>
      {iconEnd && <Icon name={iconEnd} />}
    </>
  );
}

/** Triggers an action. Labels are verb-first and sentence case: "Order online", "Save hours". */
export function Button({
  variant,
  size,
  iconStart,
  iconEnd,
  fullWidth,
  loading,
  loadingLabel,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={buttonClass({ variant, size, fullWidth }, loading, className)}
      aria-busy={loading ? true : undefined}
    >
      {loading ? (
        <>
          <Icon name="loader-2" spin />
          <span className="am-btn-label">{loadingLabel ?? children}</span>
        </>
      ) : (
        content(children, iconStart, iconEnd)
      )}
    </button>
  );
}

export interface LinkButtonProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>, ButtonStyleProps {}

/** A link that looks like a button, for navigation and for `wa.me`, `tel:` and `mailto:` targets. */
export function LinkButton({
  variant,
  size,
  iconStart,
  iconEnd,
  fullWidth,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <a {...rest} className={buttonClass({ variant, size, fullWidth }, false, className)}>
      {content(children, iconStart, iconEnd)}
    </a>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: an icon-only button has no visible text, so this becomes its accessible name. */
  label: string;
  variant?: 'ghost' | 'secondary';
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx('am-iconbtn', `am-iconbtn-${variant}`, className)}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}
