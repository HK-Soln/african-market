/**
 * Request/response message patterns (gateway -> service over TCP).
 * Naming: `<service>.<resource>.<verb>`. Add patterns here before implementing
 * a handler, so the gateway and the service share one constant.
 */
export const HEALTH_PATTERN = 'health.check';

export const IdentityPatterns = {
  requestOtp: 'identity.otp.request',
  verifyOtp: 'identity.otp.verify',
  loginWithPassword: 'identity.session.password',
  refreshSession: 'identity.session.refresh',
  logout: 'identity.session.logout',
  getMe: 'identity.user.me',
  updateMe: 'identity.user.update',
} as const;

export const ShopsPatterns = {
  create: 'shops.shop.create',
  update: 'shops.shop.update',
  getBySlug: 'shops.shop.get_by_slug',
  listMine: 'shops.shop.list_mine',
  submitForVerification: 'shops.shop.submit_verification',
  upsertBranch: 'shops.branch.upsert',
  recordContact: 'shops.contact.record',
} as const;

export const CatalogPatterns = {
  listCategories: 'catalog.category.list',
  upsertProduct: 'catalog.product.upsert',
  removeProduct: 'catalog.product.remove',
  getProduct: 'catalog.product.get',
  listShopProducts: 'catalog.product.list_by_shop',
} as const;

export const DiscoveryPatterns = {
  searchNearby: 'discovery.search.nearby',
  searchMap: 'discovery.search.map',
} as const;

export const MediaPatterns = {
  createUpload: 'media.upload.create',
  confirmUpload: 'media.upload.confirm',
} as const;

export interface HealthResponse {
  service: string;
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
  time: string;
}
