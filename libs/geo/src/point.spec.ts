import { haversineMeters, isInUae } from './point';

describe('geo helpers', () => {
  it('measures Deira to Al Nahda (Dubai) at roughly 6-8 km', () => {
    const d = haversineMeters({ lat: 25.2711, lng: 55.3075 }, { lat: 25.293, lng: 55.372 });
    expect(d).toBeGreaterThan(6000);
    expect(d).toBeLessThan(8000);
  });
  it('rejects a pin outside the UAE', () => {
    expect(isInUae({ lat: 6.5244, lng: 3.3792 })).toBe(false);
  });
});
