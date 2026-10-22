'use client';

import type { EmirateCode } from '@am/geo';
import { browserApi } from './browser-api';
import type { CategoryBody } from './catalogue';
import { run } from './result';

export const catalogueApi = {
  reviewQueue: (query: {
    'filter[categoryId]'?: string;
    sort: string;
    limit: number;
    cursor?: string;
  }) => run(browserApi.GET('/api/v1/admin/products/review', { params: { query } })),
  decideProduct: (productId: string, decision: 'approve' | 'reject', reason?: string) =>
    run(
      browserApi.POST('/api/v1/admin/products/{productId}/decision', {
        params: { path: { productId } },
        body: { decision, ...(reason ? { reason } : {}) },
      }),
    ),
  /** Every category, switched off ones too. */
  categories: () =>
    run(
      browserApi.GET('/api/v1/admin/categories', { params: { query: { includeInactive: true } } }),
    ),
  createCategory: (body: CategoryBody) =>
    run(browserApi.POST('/api/v1/admin/categories', { body })),
  updateCategory: (categoryId: string, body: Partial<CategoryBody>) =>
    run(
      browserApi.PATCH('/api/v1/admin/categories/{categoryId}', {
        params: { path: { categoryId } },
        body,
      }),
    ),
};

export const searchApi = {
  emirates: () => run(browserApi.GET('/api/v1/admin/emirates')),
  setSearch: (code: EmirateCode, open: boolean) =>
    run(
      browserApi.PUT('/api/v1/admin/emirates/{code}/search', {
        params: { path: { code } },
        body: { open },
      }),
    ),
  rebuild: () => run(browserApi.POST('/api/v1/admin/search/rebuild')),
};
