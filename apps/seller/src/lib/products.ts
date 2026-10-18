'use client';

import { useCallback, useEffect, useState } from 'react';
import { browserApi } from './browser-api';
import type { ListingBody, ProductBody, SellerProduct } from './product-form';
import { run } from './shops';

export const productsApi = {
  /** One page, newest first; `status` narrows it to one status. */
  list: (shopId: string, options: { status?: string; search?: string; cursor?: string } = {}) =>
    run(
      browserApi.GET('/api/v1/seller/shops/{shopId}/products', {
        params: {
          path: { shopId },
          query: {
            limit: 30,
            ...(options.status ? { 'filter[status]': options.status } : {}),
            ...(options.search ? { 'filter[search][like]': options.search } : {}),
            ...(options.cursor ? { cursor: options.cursor } : {}),
          },
        },
      }),
    ),
  get: (shopId: string, productId: string) =>
    run(
      browserApi.GET('/api/v1/seller/shops/{shopId}/products/{productId}', {
        params: { path: { shopId, productId } },
      }),
    ),
  create: (shopId: string, body: ProductBody) =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/products', {
        params: { path: { shopId } },
        body,
      }),
    ),
  update: (shopId: string, productId: string, body: Partial<ProductBody>) =>
    run(
      browserApi.PATCH('/api/v1/seller/shops/{shopId}/products/{productId}', {
        params: { path: { shopId, productId } },
        body,
      }),
    ),
  setStatus: (shopId: string, productId: string, status: 'active' | 'hidden' | 'draft') =>
    run(
      browserApi.PUT('/api/v1/seller/shops/{shopId}/products/{productId}/status', {
        params: { path: { shopId, productId } },
        body: { status },
      }),
    ),
  setListings: (shopId: string, productId: string, listings: ListingBody[]) =>
    run(
      browserApi.PUT('/api/v1/seller/shops/{shopId}/products/{productId}/listings', {
        params: { path: { shopId, productId } },
        body: { listings },
      }),
    ),
  remove: (shopId: string, productId: string) =>
    run(
      browserApi.DELETE('/api/v1/seller/shops/{shopId}/products/{productId}', {
        params: { path: { shopId, productId } },
      }),
    ),
};

/** One product of the shop, loaded in the browser; none to load for a new one. */
export function useSellerProduct(shopId: string, productId?: string) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; product?: SellerProduct }
    | { status: 'error'; code: string }
  >(productId ? { status: 'loading' } : { status: 'ready' });

  useEffect(() => {
    if (!productId) return;
    let live = true;
    void productsApi.get(shopId, productId).then((result) => {
      if (live)
        setState(
          result.ok
            ? { status: 'ready', product: result.data }
            : { status: 'error', code: result.code },
        );
    });
    return () => {
      live = false;
    };
  }, [shopId, productId]);

  const setProduct = useCallback(
    (product: SellerProduct) => setState({ status: 'ready', product }),
    [],
  );
  return { state, setProduct };
}
