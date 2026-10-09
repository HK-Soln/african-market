import { canAccessBranch } from './guards';

describe('canAccessBranch', () => {
  const base = { id: 'u1', sub: 'u1', roles: ['seller' as const] };
  it('lets staff reach only assigned branches', () => {
    const user = { ...base, shops: [{ shopId: 's1', role: 'staff' as const, branchIds: ['b1'] }] };
    expect(canAccessBranch(user, 's1', 'b1')).toBe(true);
    expect(canAccessBranch(user, 's1', 'b2')).toBe(false);
  });
  it('lets owners reach every branch of their shop only', () => {
    const user = { ...base, shops: [{ shopId: 's1', role: 'owner' as const, branchIds: [] }] };
    expect(canAccessBranch(user, 's1', 'b9')).toBe(true);
    expect(canAccessBranch(user, 's2', 'b9')).toBe(false);
  });
});
