import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

export interface ProductCardProps {
  title: string;
  /** The product's page. The whole card opens it. */
  href: string;
  /** Renders the link, e.g. the app's locale-aware `Link`. Defaults to a plain anchor. */
  linkAs?: ElementType;
  imageUrl?: string | null;
  /** Usually a `Price`; "Price on request" otherwise. */
  price?: ReactNode;
  /** A line under the title, e.g. the shop's name. */
  subtitle?: string;
  /** Over the image's corner, e.g. an `OriginBadge`. */
  origin?: ReactNode;
  /** Greys the image; say why in `price` or `subtitle` (never colour alone). */
  outOfStock?: boolean;
  className?: string;
}

/** A product in a grid: square image, title, price. */
export function ProductCard({
  title,
  href,
  linkAs: LinkAs = 'a',
  imageUrl,
  price,
  subtitle,
  origin,
  outOfStock,
  className,
}: ProductCardProps) {
  return (
    <article className={cx('am-card', outOfStock && 'am-product-out', className)}>
      <div className="relative">
        <div
          className={cx('am-media', !imageUrl && 'am-media-empty')}
          style={{ aspectRatio: '1 / 1' }}
        >
          {imageUrl && <img src={imageUrl} alt="" loading="lazy" />}
        </div>
        {origin && <div className="am-product-origin">{origin}</div>}
      </div>
      <div className="am-product-body">
        <h3 className="am-product-title">
          <LinkAs href={href}>{title}</LinkAs>
        </h3>
        {subtitle && <p className="am-product-shop">{subtitle}</p>}
        {price && <div className="am-product-foot">{price}</div>}
      </div>
    </article>
  );
}
