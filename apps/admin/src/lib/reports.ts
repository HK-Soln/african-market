import type { components } from '@am/api-client';
import type { ReportStatus } from '@am/contracts';

export type ShopReport = components['schemas']['ShopReportDto'];
export type ProductReport = components['schemas']['ProductReportDto'];
export type ReportKind = 'shops' | 'products';

/** The reports list query: open ones oldest first (the longest waiting on top), closed ones newest first. */
export function reportsQuery(status: ReportStatus, cursor?: string) {
  return {
    'filter[status]': status,
    sort: status === 'open' ? 'createdAt' : '-createdAt',
    limit: 20,
    ...(cursor ? { cursor } : {}),
  };
}
