import { cx } from './cx';
import { DIRECTIONAL_ICONS, ICON_PATHS, type IconName } from './icon-paths';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Pixels. 20 in buttons and rows, 16 in badges, 24 to 28 in empty states. */
  size?: number;
  /** Accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  strokeWidth?: number;
  /** Pass `false` to stop a directional icon mirroring in RTL. */
  flip?: boolean;
  spin?: boolean;
  className?: string;
}

/** An outline icon at a 1.75 stroke that inherits the text colour. */
export function Icon({
  name,
  size = 20,
  label,
  strokeWidth = 1.75,
  flip,
  spin,
  className,
}: IconProps) {
  const directional = flip !== false && DIRECTIONAL_ICONS.has(name);
  return (
    <svg
      className={cx('am-icon', directional && 'am-icon-dir', spin && 'am-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      // The markup is the static path data in icon-paths.ts, never user input.
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
