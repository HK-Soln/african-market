'use client';

import { useCallback, useEffect, useState } from 'react';
import { uploadMedia, type MediaPurpose } from '@am/api-client';
import type { components } from '@am/api-client';
import { browserApi } from './browser-api';

export type SellerShop = components['schemas']['SellerShopDto'];
export type SellerBranch = components['schemas']['SellerBranchDto'];
export type ShopBody = components['schemas']['UpdateShopBody'];
export type BranchBody = components['schemas']['CreateBranchBody'];
export type WeeklyHours = components['schemas']['OpeningHoursInput'][];
export type VerificationOverview = components['schemas']['VerificationOverviewDto'];
export type VerificationRequest = components['schemas']['VerificationRequestDto'];
export type TradeLicenseBody = components['schemas']['SubmitTradeLicenseBody'];
export type SpecialDayBody = components['schemas']['SetSpecialHoursBody'];

export type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

/** Turns a gateway call into data or an error code the screens can put into words. */
export async function run<T>(
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
  verification: (shopId: string) =>
    run(
      browserApi.GET('/api/v1/seller/shops/{shopId}/verification', {
        params: { path: { shopId } },
      }),
    ),
  /** Starts the identity check; the answer's `url` is the provider's page to send the owner to. */
  startKyc: (shopId: string, locale: 'en' | 'ar' | 'fr') =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/verification/kyc', {
        params: { path: { shopId } },
        body: { locale },
      }),
    ),
  refreshKyc: (shopId: string) =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/verification/kyc/refresh', {
        params: { path: { shopId } },
      }),
    ),
  submit: (shopId: string) =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/verification/submit', {
        params: { path: { shopId } },
      }),
    ),
  submitTradeLicense: (shopId: string, body: TradeLicenseBody) =>
    run(
      browserApi.POST('/api/v1/seller/shops/{shopId}/verification/trade-license', {
        params: { path: { shopId } },
        body,
      }),
    ),
  /** Uploads a file straight to storage and confirms it (decision T-27); the media id to attach. */
  upload: async (shopId: string, file: File, purpose: MediaPurpose): Promise<Result<string>> => {
    const result = await uploadMedia(browserApi, file, { purpose, shopId });
    return result.ok ? { ok: true, data: result.data.id } : { ok: false, code: result.code };
  },
  deleteBranch: (shopId: string, branchId: string) =>
    run(
      browserApi.DELETE('/api/v1/seller/shops/{shopId}/branches/{branchId}', {
        params: { path: { shopId, branchId } },
      }),
    ),
  setSpecialDay: (shopId: string, branchId: string, date: string, body: SpecialDayBody) =>
    run(
      browserApi.PUT('/api/v1/seller/shops/{shopId}/branches/{branchId}/special-hours/{date}', {
        params: { path: { shopId, branchId, date } },
        body,
      }),
    ),
  deleteSpecialDay: (shopId: string, branchId: string, date: string) =>
    run(
      browserApi.DELETE('/api/v1/seller/shops/{shopId}/branches/{branchId}/special-hours/{date}', {
        params: { path: { shopId, branchId, date } },
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

export { firstBranch, nextStep, setupProgress, SETUP_STEPS, type SetupStep } from './setup';
