import type { MetadataRoute } from 'next';
import { LOCALES } from '@am/i18n';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { productPath, shopPath } from '@/lib/shop/paths';

/** Rebuilt at most every hour; new shops appear in search straight away anyway. */
export const revalidate = 3600;

/** One sitemap holds at most 50,000 addresses; well below that, it stays one file. */
const MAX_ENTRIES = 45_000;

type Entry = MetadataRoute.Sitemap[number];

/** An address in every language, each naming the others (hreflang). */
function entry(path: string, lastModified?: string): Entry[] {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${config.webUrl}/${l}${path}`]));
  return LOCALES.map((locale) => ({
    url: `${config.webUrl}/${locale}${path}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

async function* pages(kind: 'shops' | 'products') {
  let cursor: string | undefined;
  for (;;) {
    const { data } = await api().GET('/api/v1/sitemap', {
      params: { query: { kind, ...(cursor ? { cursor } : {}) } },
    });
    if (!data) return;
    yield data.items;
    if (!data.nextCursor) return;
    cursor = data.nextCursor;
  }
}

/** Home, every verified shop and every live product (from discovery's read model), F1-12. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [...entry('')];
  try {
    for await (const items of pages('shops')) {
      for (const s of items) out.push(...entry(shopPath(s.shopSlug), s.updatedAt));
      if (out.length >= MAX_ENTRIES) return out.slice(0, MAX_ENTRIES);
    }
    for await (const items of pages('products')) {
      for (const p of items) {
        if (p.productId) out.push(...entry(productPath(p.productId, p.title ?? {}), p.updatedAt));
      }
      if (out.length >= MAX_ENTRIES) return out.slice(0, MAX_ENTRIES);
    }
  } catch (err) {
    // Without the gateway the sitemap still lists the home page; the next build fills it.
    console.warn('Sitemap entries could not be loaded', err);
  }
  return out;
}
