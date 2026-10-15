import { cx } from './cx';

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2, e.g. AE. */
  code: string;
  /** Height in px. Flags are 3:2. */
  size?: number;
  className?: string;
}

/**
 * A country's flag as an image (`/flags/<code>.svg`, copied into each app's public folder by
 * tools/copy-flags.mjs). Images, not emoji, because Windows shows emoji flags as two letters.
 * Decorative: always shown next to the country's name or code.
 */
export function CountryFlag({ code, size = 14, className }: CountryFlagProps) {
  return (
    <img
      src={`/flags/${code.toUpperCase()}.svg`}
      alt=""
      aria-hidden
      width={Math.round((size * 3) / 2)}
      height={size}
      loading="lazy"
      className={cx('am-flag-img', className)}
    />
  );
}
