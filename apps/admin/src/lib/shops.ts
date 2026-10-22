'use client';

import type { KycDocumentKind } from '@am/contracts';
import { browserApi } from './browser-api';
import { run } from './result';
import type { ListingDecision, QueueQuery } from './review';

export const shopsApi = {
  queue: (query: QueueQuery) => run(browserApi.GET('/api/v1/admin/shops', { params: { query } })),
  verification: (shopId: string) =>
    run(
      browserApi.GET('/api/v1/admin/shops/{shopId}/verification', {
        params: { path: { shopId } },
      }),
    ),
  decideListing: (shopId: string, decision: ListingDecision, reason?: string) =>
    run(
      browserApi.POST('/api/v1/admin/shops/{shopId}/listing', {
        params: { path: { shopId } },
        body: { decision, ...(reason ? { reason } : {}) },
      }),
    ),
  decideLicense: (
    shopId: string,
    requestId: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ) =>
    run(
      browserApi.POST('/api/v1/admin/shops/{shopId}/trade-license/{requestId}', {
        params: { path: { shopId, requestId } },
        body: { decision, ...(reason ? { reason } : {}) },
      }),
    ),
  /**
   * An identity image, as a blob for an object URL: the gateway streams it from the provider and
   * records the view. Fetched with the session (and its refresh), never put in an `<img src>`.
   */
  kycDocument: (shopId: string, requestId: string, kind: KycDocumentKind) =>
    run<Blob>(
      browserApi.GET('/api/v1/admin/shops/{shopId}/verification/{requestId}/documents/{kind}', {
        params: { path: { shopId, requestId, kind } },
        parseAs: 'blob',
      }),
    ),
  /** A private document (the trade licence), the same way. */
  privateDocument: (mediaId: string) =>
    run<Blob>(
      browserApi.GET('/api/v1/admin/media/{id}/content', {
        params: { path: { id: mediaId } },
        parseAs: 'blob',
      }),
    ),
};
