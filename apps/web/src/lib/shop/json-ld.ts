import { pickLocalized, type Locale } from '@am/i18n';
import type { Product, PublicShop } from './server';

/**
 * Structured data for search engines (schema.org), built from what the page shows. Each branch is
 * a store of its own (`LocalBusiness`) with its pin, address and weekly hours; a product is a
 * `Product` with its price range in dirhams, sold by the shop.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const image = (urls?: { full?: string; card?: string; thumb?: string } | null) =>
  urls?.full ?? urls?.card ?? urls?.thumb;

export function shopJsonLd(shop: PublicShop, url: string, locale: Locale) {
  const description = pickLocalized(shop.description, locale) || undefined;
  const logo = image(shop.logo);
  return {
    '@context': 'https://schema.org',
    '@graph': shop.branches.map((branch) => ({
      '@type': 'LocalBusiness',
      '@id': `${url}#${branch.id}`,
      name: shop.branches.length > 1 ? `${shop.name} – ${branch.name}` : shop.name,
      url,
      ...(description ? { description } : {}),
      ...(logo ? { logo, image: [logo, ...shop.gallery.map(image).filter(Boolean)] } : {}),
      ...((branch.contactPhone ?? shop.contactPhone)
        ? { telephone: branch.contactPhone ?? shop.contactPhone }
        : {}),
      address: {
        '@type': 'PostalAddress',
        ...(branch.addressLine ? { streetAddress: branch.addressLine } : {}),
        ...(branch.area ? { addressLocality: branch.area } : {}),
        addressRegion: branch.emirate,
        addressCountry: 'AE',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: branch.location.lat,
        longitude: branch.location.lng,
      },
      openingHoursSpecification: branch.openingHours.map((p) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAYS[p.weekday]}`,
        opens: p.opensAt,
        closes: p.closesAt,
      })),
    })),
  };
}

export function productJsonLd(product: Product, shop: PublicShop, url: string, locale: Locale) {
  const prices = product.variants
    .map((v) => v.priceFils)
    .filter((p): p is number => typeof p === 'number');
  const inStock = product.listings.some((l) => l.inStock);
  const description = pickLocalized(product.description, locale) || undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pickLocalized(product.title, locale),
    url,
    ...(description ? { description } : {}),
    image: product.images.map(image).filter(Boolean),
    ...(product.originCountry ? { countryOfOrigin: product.originCountry } : {}),
    ...(prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'AED',
            lowPrice: (Math.min(...prices) / 100).toFixed(2),
            highPrice: (Math.max(...prices) / 100).toFixed(2),
            offerCount: prices.length,
            availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`,
            seller: { '@type': 'Organization', name: shop.seller?.legalName ?? shop.name },
          },
        }
      : {}),
  };
}

/** For a `<script type="application/ld+json">`: `<` escaped so text can never close the tag. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
