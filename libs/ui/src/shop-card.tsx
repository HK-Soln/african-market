import type { ElementType, ReactNode } from 'react';
import { CountryFlag } from './country-flag';
import { cx } from './cx';

export interface ShopCardProps {
  name: string;
  /** The shop's page. The whole card opens it; the actions stay their own buttons. */
  href: string;
  /** Renders the link, e.g. the app's locale-aware `Link`. Defaults to a plain anchor. */
  linkAs?: ElementType;
  logoUrl?: string | null;
  /** Short facts in a row, separated by dots: distance, area, category. */
  meta?: ReactNode[];
  /** Status badges (verified, open now, delivers). */
  badges?: ReactNode;
  /** Where the shop is from (ISO codes), shown as flags with `originLabel` as their name. */
  origins?: string[];
  /** The countries in words, e.g. "From Nigeria and Ghana"; flags are decorative. */
  originLabel?: string;
  /** Contact buttons. */
  actions?: ReactNode;
  /** `row`: a compact list row with the logo beside the text. `card`: logo over a cover. */
  layout?: 'row' | 'card';
  className?: string;
}

/** Up to two letters of the name, for a shop without a logo. */
export function shopInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('');
}

/** A shop in a list of results: logo, name, facts, badges, origin flags and contact buttons. */
export function ShopCard({
  name,
  href,
  linkAs: LinkAs = 'a',
  logoUrl,
  meta = [],
  badges,
  origins = [],
  originLabel,
  actions,
  layout = 'row',
  className,
}: ShopCardProps) {
  const logo = logoUrl ? (
    <img src={logoUrl} alt="" loading="lazy" />
  ) : (
    <span className="am-media-initials" aria-hidden>
      {shopInitials(name)}
    </span>
  );
  return (
    <article className={cx('am-card', 'am-shop', layout === 'row' && 'am-shop-row', className)}>
      <div className="am-shop-media">
        <div
          className={cx('am-media', !logoUrl && 'am-media-empty')}
          style={layout === 'card' ? { aspectRatio: '16 / 9' } : undefined}
        >
          {layout === 'row' && logo}
        </div>
      </div>
      <div className="am-shop-body">
        <div className="am-shop-head">
          {layout === 'card' && <span className="am-avatar">{logo}</span>}
          <div className="am-shop-titles">
            <h3 className="am-shop-name">
              <LinkAs href={href}>{name}</LinkAs>
            </h3>
            {meta.length > 0 && (
              <p className="am-shop-meta">
                {meta.map((item, i) => (
                  <span key={i}>{item}</span>
                ))}
              </p>
            )}
          </div>
        </div>
        {(badges || origins.length > 0) && (
          <div className="am-row">
            {badges}
            {origins.length > 0 && (
              <span className="am-shop-origins" title={originLabel}>
                {origins.map((code) => (
                  <CountryFlag key={code} code={code} />
                ))}
                {originLabel && <span className="am-visually-hidden">{originLabel}</span>}
              </span>
            )}
          </div>
        )}
        {actions && <div className="am-shop-actions">{actions}</div>}
      </div>
    </article>
  );
}
