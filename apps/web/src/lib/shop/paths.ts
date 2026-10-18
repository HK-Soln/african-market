import { LOCALES } from '@am/i18n';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A readable tail for a product's address, from its English (else any) title. */
export function productSlug(title: Partial<Record<string, string>>): string {
  const text = title.en ?? Object.values(title).find(Boolean) ?? '';
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'product';
}

/** `/p/<id>-<slug>`: the id finds it, the slug only reads well. */
export const productPath = (id: string, title: Partial<Record<string, string>>) =>
  `/p/${id}-${productSlug(title)}`;

export const shopPath = (slug: string) => `/s/${slug}`;

/** The id and slug of a product address segment, or null when it holds no id. */
export function parseProductSegment(segment: string): { id: string; slug: string } | null {
  const id = segment.slice(0, 36);
  if (!UUID.test(id) || (segment.length > 36 && segment[36] !== '-')) return null;
  return { id: id.toLowerCase(), slug: segment.slice(37) };
}

/**
 * Canonical and language links for a page (`path` without the locale): every language has its own
 * address, and English stands in for others (`x-default`).
 */
export function alternates(locale: string, path: string) {
  return {
    canonical: `/${locale}${path}`,
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])),
      'x-default': `/en${path}`,
    },
  };
}
