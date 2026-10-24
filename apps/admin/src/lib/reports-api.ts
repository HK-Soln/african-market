'use client';

import type { ReportOutcome } from '@am/contracts';
import { browserApi } from './browser-api';
import type { ReportKind, reportsQuery } from './reports';
import { run } from './result';

type Query = ReturnType<typeof reportsQuery>;

export const reportsApi = {
  shops: (query: Query) =>
    run(browserApi.GET('/api/v1/admin/reports/shops', { params: { query } })),
  products: (query: Query) =>
    run(browserApi.GET('/api/v1/admin/reports/products', { params: { query } })),
  decide: (kind: ReportKind, reportId: string, outcome: ReportOutcome, note?: string) => {
    const init = { params: { path: { reportId } }, body: { outcome, ...(note ? { note } : {}) } };
    return run(
      kind === 'shops'
        ? browserApi.POST('/api/v1/admin/reports/shops/{reportId}/decision', init)
        : browserApi.POST('/api/v1/admin/reports/products/{reportId}/decision', init),
    );
  },
};
