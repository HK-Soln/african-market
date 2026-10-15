import { isHealthProbe } from './service-core.module';

describe('isHealthProbe', () => {
  it.each(['/health', '/health/', '/api/v1/health', '/health?probe=1'])('skips GET %s', (url) => {
    expect(isHealthProbe({ method: 'GET', url })).toBe(true);
  });

  it.each(['/api/v1/health/services', '/healthy', '/api/v1/auth/login', '/en/health'])(
    'still logs GET %s',
    (url) => {
      expect(isHealthProbe({ method: 'GET', url })).toBe(false);
    },
  );

  it('still logs anything but GET', () => {
    expect(isHealthProbe({ method: 'POST', url: '/health' })).toBe(false);
  });
});
