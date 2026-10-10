import { MONOGRAM_PATH } from './logo-path';

export interface LogoProps {
  /** `full` is the mark with the wordmark; `mark` is the tile alone. */
  variant?: 'full' | 'mark';
  /** Mark size in pixels. Never below 20. */
  size?: number;
}

/**
 * The "am" monogram on a clay tile with a sand dot, optionally with the wordmark. The brand name
 * is not translated, so the accessible name is the same in every language.
 */
export function Logo({ variant = 'full', size = 40 }: LogoProps) {
  return (
    <span className="am-logo" role="img" aria-label="African Market UAE">
      <svg className="am-logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <rect width={40} height={40} rx={10} className="am-logo-tile" />
        <path d={MONOGRAM_PATH} className="am-logo-letters" />
        <circle cx={34.05} cy={22.7} r={2.6} className="am-logo-dot" />
      </svg>
      {variant === 'full' && (
        <span className="am-logo-word" aria-hidden>
          <span className="am-logo-name">African Market</span>
          <span className="am-logo-tag">UAE</span>
        </span>
      )}
    </span>
  );
}
