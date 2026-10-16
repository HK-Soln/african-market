/**
 * Request/response message patterns (gateway -> service over TCP).
 * Naming: `<service>.<resource>.<verb>`. Add patterns here before implementing
 * a handler, so the gateway and the service share one constant.
 */
export const HEALTH_PATTERN = 'health.check';

export const IdentityPatterns = {
  requestOtp: 'identity.otp.request',
  verifyOtp: 'identity.otp.verify',
  registerWithEmail: 'identity.email.register',
  resendEmailCode: 'identity.email.resend',
  verifyEmail: 'identity.email.verify',
  loginWithPassword: 'identity.session.password',
  requestPasswordReset: 'identity.password.reset_request',
  resetPassword: 'identity.password.reset',
  refreshSession: 'identity.session.refresh',
  logout: 'identity.session.logout',
  getMe: 'identity.user.me',
  updateMe: 'identity.user.update',
  /** Everything identity holds about the signed-in person, as JSON (UAE PDPL access right). */
  exportMe: 'identity.user.export',
  /** Closes the account now; its personal data is erased ACCOUNT_ERASURE_DAYS later. */
  deleteMe: 'identity.user.delete',
  /** Countries for pickers and badges: only those enabled. Payload: ListRequest. */
  listCountries: 'identity.country.list',
  /** Every country, for admins. Payload: ListRequest. */
  listAllCountries: 'identity.country.list_all',
  updateCountry: 'identity.country.update',
} as const;

/**
 * Handlers that exist only when a service runs with NODE_ENV=test, for end-to-end tests. They
 * are not registered in development, staging or production.
 */
export const IdentityTestPatterns = {
  /** The one-time code most recently "sent" to a phone by the in-memory SMS provider. */
  lastOtp: 'identity.test.last_otp',
} as const;

export const ShopsPatterns = {
  create: 'shops.shop.create',
  update: 'shops.shop.update',
  /** A shop with its branches, for its members and admins. */
  get: 'shops.shop.get',
  /** Public: a verified shop by slug. */
  getBySlug: 'shops.shop.get_by_slug',
  listMine: 'shops.shop.list_mine',
  submitForVerification: 'shops.shop.submit_verification',
  getVerification: 'shops.verification.get',
  startKyc: 'shops.kyc.start',
  refreshKyc: 'shops.kyc.refresh',
  /** A provider webhook, passed on by the gateway with its raw body for the signature check. */
  kycWebhook: 'shops.kyc.webhook',
  submitTradeLicense: 'shops.trade_license.submit',
  /** Admins: the review queue, decisions, and KYC images (each view audit-logged). */
  verificationQueue: 'shops.verification.queue',
  decideListing: 'shops.verification.decide_listing',
  decideTradeLicense: 'shops.trade_license.decide',
  kycDocument: 'shops.kyc.document',
  upsertBranch: 'shops.branch.upsert',
  deleteBranch: 'shops.branch.delete',
  setOpeningHours: 'shops.branch.set_hours',
  setSpecialHours: 'shops.branch.set_special_hours',
  deleteSpecialHours: 'shops.branch.delete_special_hours',
  recordContact: 'shops.contact.record',
} as const;

export const CatalogPatterns = {
  /** Public: the category tree (admins may ask for inactive categories too). */
  listCategories: 'catalog.category.list',
  /** Admins: create or change a category. */
  upsertCategory: 'catalog.category.upsert',
  upsertProduct: 'catalog.product.upsert',
  /** Publish (to review when needed), hide, or back to draft. */
  setProductStatus: 'catalog.product.set_status',
  /** Owners and managers: which branches have the product, at what price. */
  setProductListings: 'catalog.product.set_listings',
  /** Branch staff too: stock of what is listed at a branch. */
  updateBranchStock: 'catalog.branch.update_stock',
  removeProduct: 'catalog.product.remove',
  getProduct: 'catalog.product.get',
  listShopProducts: 'catalog.product.list_by_shop',
  /** Admins: products waiting for review, and decisions on them. */
  reviewQueue: 'catalog.product.review_queue',
  decideProduct: 'catalog.product.decide',
} as const;

export const DiscoveryPatterns = {
  searchNearby: 'discovery.search.nearby',
  searchMap: 'discovery.search.map',
} as const;

export const MediaPatterns = {
  createUpload: 'media.upload.create',
  confirmUpload: 'media.upload.confirm',
  attach: 'media.object.attach',
  detach: 'media.object.detach',
  /** Admins only: a 60-second link to a private document, for the gateway to stream. */
  privateAccess: 'media.object.private_access',
} as const;

export interface HealthResponse {
  service: string;
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
  time: string;
}
