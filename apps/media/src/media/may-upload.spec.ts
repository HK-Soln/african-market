import { randomUUID } from 'node:crypto';
import { MediaActor, MediaPurpose } from '@am/contracts';
import { mayUpload } from './media.service';

const shop = randomUUID();
const other = randomUUID();
const as = (role?: 'owner' | 'manager' | 'staff'): MediaActor => ({
  userId: randomUUID(),
  roles: ['customer', 'seller'],
  shops: role ? [{ shopId: shop, role }] : [],
});

describe('who may upload what (decisions T-27, T-29)', () => {
  it.each<[MediaPurpose, 'owner' | 'manager' | 'staff' | undefined, boolean]>([
    ['shop_logo', 'owner', true],
    ['shop_logo', 'manager', true],
    ['shop_logo', 'staff', false],
    ['shop_logo', undefined, false],
    ['shop_gallery', 'manager', true],
    ['shop_gallery', 'staff', false],
    ['product_image', 'owner', true],
    ['product_image', 'manager', true],
    ['product_image', 'staff', false],
    ['trade_license', 'owner', true],
    ['trade_license', 'manager', false],
    ['trade_license', 'staff', false],
  ])('%s as %s of the shop: %s', (purpose, role, allowed) => {
    expect(mayUpload(as(role), purpose, shop)).toBe(allowed);
  });

  it('lets staff upload product images only when the shop allows it', () => {
    expect(mayUpload(as('staff'), 'product_image', shop, true)).toBe(true);
    expect(mayUpload(as('staff'), 'shop_logo', shop, true)).toBe(false);
  });

  it('never for a shop the person does not belong to', () => {
    expect(mayUpload(as('owner'), 'shop_logo', other)).toBe(false);
    expect(mayUpload(as('owner'), 'shop_logo', undefined)).toBe(false);
  });

  it('an avatar is for yourself, not for a shop', () => {
    expect(mayUpload(as(), 'avatar', undefined)).toBe(true);
    expect(mayUpload(as('owner'), 'avatar', shop)).toBe(false);
  });
});
