import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * Search engines may read shop and product pages; search results, accounts, sign-in and the
 * component reference are for people only (they also say `noindex` themselves).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/*/search', '/*/account', '/*/sign-in', '/*/dev/', '/*/report'],
    },
    sitemap: `${config.webUrl}/sitemap.xml`,
  };
}
