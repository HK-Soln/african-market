import type { components } from '@am/api-client';

type SellerShop = components['schemas']['SellerShopDto'];
type SellerBranch = components['schemas']['SellerBranchDto'];

/**
 * Where a shop stands in onboarding, worked out from the shop itself (decision T-41). Plain
 * functions, kept apart from the API calls so they can be tested without the app's config.
 */

/** The primary branch, else the oldest: the one onboarding sets up. */
export const firstBranch = (shop: SellerShop): SellerBranch | undefined =>
  shop.branches.find((b) => b.isPrimary) ?? shop.branches[0];

export type SetupStep = 'details' | 'branch' | 'hours' | 'contacts' | 'photos' | 'verify';
export const SETUP_STEPS: SetupStep[] = [
  'details',
  'branch',
  'hours',
  'contacts',
  'photos',
  'verify',
];

/** Photos make a better page but are not needed to send the shop for review. */
const OPTIONAL_STEPS: SetupStep[] = ['photos'];

/** What onboarding still needs, worked out from the shop itself (so it resumes anywhere). */
export function setupProgress(shop: SellerShop): Record<SetupStep, boolean> {
  const branch = firstBranch(shop);
  return {
    details: Boolean(shop.name),
    branch: Boolean(branch),
    hours: Boolean(branch && branch.openingHours.length > 0),
    contacts: Boolean(shop.contactWhatsapp || shop.contactPhone || shop.contactEmail),
    photos: Boolean(shop.logoMediaId),
    // Sent for review at least once (it may have come back with changes to make).
    verify: shop.verificationStatus !== 'draft',
  };
}

/** The first needed step not done yet, or null when onboarding is complete. */
export const nextStep = (shop: SellerShop): SetupStep | null =>
  SETUP_STEPS.find((step) => !OPTIONAL_STEPS.includes(step) && !setupProgress(shop)[step]) ?? null;
