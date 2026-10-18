'use client';

import { useCallback, useEffect, useState } from 'react';
import type { components } from '@am/api-client';
import { browserApi } from './browser-api';

export type SellerShop = components['schemas']['SellerShopDto'];
export type SellerBranch = components['schemas']['SellerBranchDto'];
export type ShopBody = components['schemas']['UpdateShopBody'];
export type BranchBody = components['schemas']['CreateBranchBody'];
export type WeeklyHours = components['schemas']['OpeningHoursInput'][];

export type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

/** Turns a gateway call into data or an error code the screens can put into words. */
async function run<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T>> {
  try {
    const { data, error, response } = await request;
    if (response.ok) return { ok: true, data: data as T };
    const body = (error ?? {}) as { code?: string; details?: Record<string, unknown> };
    return {
      ok: false,
      code: body.code ?? (response.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN'),
      details: body.details,
    };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}

export const shopsApi = {
  listMine: () =>
    run(browserApi.GET('/api/v1/seller/shops', { params: { query: { limit: 100 } } })),
  get: (shopId: string) =>
    run(browserApi.GET('/api/v1/seller/shops/{shopId}', { params: { path: { shopId } } })),
  create: (body: components['schemas']['CreateShopBody']) =>
    run(browserApi.POST('/api/v1/seller/shops', { body })),
  update: (shopId: string, body: ShopBody) =>
    run(browserApi.PATCH('/api/v1/seller/shops/{shopId}', { params: { path: { shopId } }, body })),
  createBranch: (shopId: string, body: BranchBody) =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/branches', {
        params: { path: { shopId } },
        body,
      }),
    ),
  updateBranch: (shopId: string, branchId: string, body: Partial<BranchBody>) =>
    run(
      browserApi.PATCH('/api/v1/seller/shops/{shopId}/branches/{branchId}', {
        params: { path: { shopId, branchId } },
        body,
      }),
    ),
  setHours: (shopId: string, branchId: string, hours: WeeklyHours) =>
    run(
      browserApi.PUT('/api/v1/seller/shops/{shopId}/branches/{branchId}/hours', {
        params: { path: { shopId, branchId } },
        body: { hours },
      }),
    ),
};

/** One shop of the signed-in seller, loaded in the browser (the session lives in cookies). */
export function useSellerShop(shopId: string) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; shop: SellerShop }
    | { status: 'error'; code: string }
  >({ status: 'loading' });

  const reload = useCallback(async () => {
    const result = await shopsApi.get(shopId);
    setState(
      result.ok ? { status: 'ready', shop: result.data } : { status: 'error', code: result.code },
    );
    return result;
  }, [shopId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload, setShop: (shop: SellerShop) => setState({ status: 'ready', shop }) };
}

/** The primary branch, else the oldest: the one onboarding sets up. */
export const firstBranch = (shop: SellerShop): SellerBranch | undefined =>
  shop.branches.find((b) => b.isPrimary) ?? shop.branches[0];

export type SetupStep = 'details' | 'branch' | 'hours' | 'contacts';
export const SETUP_STEPS: SetupStep[] = ['details', 'branch', 'hours', 'contacts'];

/** What onboarding still needs, worked out from the shop itself (so it resumes anywhere). */
export function setupProgress(shop: SellerShop): Record<SetupStep, boolean> {
  const branch = firstBranch(shop);
  return {
    details: Boolean(shop.name),
    branch: Boolean(branch),
    hours: Boolean(branch && branch.openingHours.length > 0),
    contacts: Boolean(shop.contactWhatsapp || shop.contactPhone || shop.contactEmail),
  };
}

/** The first step not done yet, or null when this part of onboarding is complete. */
export const nextStep = (shop: SellerShop): SetupStep | null =>
  SETUP_STEPS.find((step) => !setupProgress(shop)[step]) ?? null;
