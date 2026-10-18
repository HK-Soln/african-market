import { cache } from 'react';
import type { components } from '@am/api-client';
import { api } from '../api';

export type PublicShop = components['schemas']['PublicShopDto'];
export type PublicBranch = components['schemas']['PublicBranchDto'];
export type Product = components['schemas']['ProductDto'];

/** A shop has at most 1,000 products (catalog's limit): ten pages of 100. */
const PRODUCT_PAGES = 10;

/** A verified shop, or null when there is none by that slug (the page is then a 404). */
export const getShop = cache(async (locale: string, slug: string): Promise<PublicShop | null> => {
  const { data, response } = await api(locale).GET('/api/v1/shops/{slug}', {
    params: { path: { slug } },
  });
  if (data) return data;
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`Shop ${slug} could not be loaded (${response.status})`);
});

export const getShopById = cache(async (locale: string, id: string): Promise<PublicShop | null> => {
  const { data, response } = await api(locale).GET('/api/v1/shops/by-id/{id}', {
    params: { path: { id } },
  });
  if (data) return data;
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`Shop ${id} could not be loaded (${response.status})`);
});

/** Every active product of the shop, newest first. */
export const shopProducts = cache(async (locale: string, slug: string): Promise<Product[]> => {
  const all: Product[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PRODUCT_PAGES; page++) {
    const { data, response } = await api(locale).GET('/api/v1/shops/{slug}/products', {
      params: { path: { slug }, query: { limit: 100, ...(cursor ? { cursor } : {}) } },
    });
    if (!data) throw new Error(`Products of ${slug} could not be loaded (${response.status})`);
    all.push(...data.items);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return all;
});

/** An active product of a verified shop, or null. */
export const getProduct = cache(async (locale: string, id: string): Promise<Product | null> => {
  const { data, response } = await api(locale).GET('/api/v1/products/{id}', {
    params: { path: { id } },
  });
  if (data) return data;
  if (response.status === 404 || response.status === 400) return null;
  throw new Error(`Product ${id} could not be loaded (${response.status})`);
});
