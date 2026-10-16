import { scrubBreadcrumb, scrubErrorReport } from './telemetry';

describe('scrubErrorReport', () => {
  it('keeps only what cannot identify a person', () => {
    const report = {
      message: 'boom',
      request: {
        url: 'https://api.africanmarket.ae/api/v1/countries?filter[search][like]=Amina#top',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'accept-language': 'ar',
          cookie: 'am_access=secret',
          authorization: 'Bearer secret',
          'x-forwarded-for': '203.0.113.7',
        },
        cookies: { am_access: 'secret' },
        data: { phone: '+971501234567', code: '123456' },
        query_string: 'phone=%2B971501234567',
      },
      user: { id: 'u-1', email: 'a@example.com', ip_address: '203.0.113.7', username: 'amina' },
      breadcrumbs: [{ category: 'http', data: { url: '/api/v1/me?phone=+9715', method: 'GET' } }],
    };

    expect(scrubErrorReport(report)).toEqual({
      message: 'boom',
      request: {
        url: 'https://api.africanmarket.ae/api/v1/countries',
        headers: { 'User-Agent': 'Mozilla/5.0', 'accept-language': 'ar' },
      },
      user: { id: 'u-1' },
      breadcrumbs: [{ category: 'http', data: { url: '/api/v1/me', method: 'GET' } }],
    });
  });

  it('does not change the report it was given', () => {
    const report = { user: { id: 'u-1', email: 'a@example.com' } };
    scrubErrorReport(report);
    expect(report.user.email).toBe('a@example.com');
  });

  it('leaves a report without request or user as it is', () => {
    expect(scrubErrorReport({ message: 'x', breadcrumbs: [] })).toEqual({
      message: 'x',
      breadcrumbs: [],
    });
    expect(scrubErrorReport({ user: { email: 'a@example.com' } })).toEqual({ user: {} });
  });
});

describe('scrubBreadcrumb', () => {
  it('takes the query off navigation and request URLs', () => {
    expect(
      scrubBreadcrumb({
        data: { from: '/en/search?q=x', to: '/ar?phone=1', 'http.query': '?q=x', status_code: 200 },
      }),
    ).toEqual({ data: { from: '/en/search', to: '/ar', status_code: 200 } });
    expect(scrubBreadcrumb({ message: 'clicked' } as { data?: Record<string, unknown> })).toEqual({
      message: 'clicked',
    });
  });
});
