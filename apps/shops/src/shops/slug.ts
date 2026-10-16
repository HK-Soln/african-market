import { randomBytes } from 'node:crypto';

const MAX_LENGTH = 60;

/**
 * A URL name from a shop name: lowercase Latin letters, digits and dashes. Accents are dropped
 * ("Café Ébène" → "cafe-ebene"). A name with no Latin letters (all Arabic, say) gives "shop".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'shop';
}

/** The slug with a short random ending, for when the plain one is taken. */
export const withSuffix = (slug: string): string =>
  `${slug.slice(0, MAX_LENGTH - 5)}-${randomBytes(3).toString('hex').slice(0, 4)}`;
