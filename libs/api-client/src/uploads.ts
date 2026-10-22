import type { ApiClient } from './index';
import { NETWORK_ERROR, toResult, type ApiResult } from './auth-actions';
import type { components } from './schema';

type Schemas = components['schemas'];
export type ApiMedia = Schemas['MediaDto'];
export type MediaPurpose = Schemas['CreateUploadDto']['purpose'];

/** Storage refused the file: not the size or type announced, or the link expired. */
export const UPLOAD_REFUSED = 'UPLOAD_REFUSED';

export interface UploadOptions {
  purpose: MediaPurpose;
  /** Required for shop purposes. */
  shopId?: string;
  /** Replaceable for tests; the browser's fetch otherwise. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Uploads one file the way the media service expects (decisions T-27, T-44): asks the gateway for
 * a signed link, PUTs the file straight to storage with it (the gateway never carries the bytes),
 * then confirms so media checks and stores it. Never throws; the result carries the error code.
 */
export async function uploadMedia(
  client: ApiClient,
  file: Blob,
  options: UploadOptions,
): Promise<ApiResult<ApiMedia>> {
  const created = await toResult(
    client.POST('/api/v1/media/uploads', {
      body: {
        purpose: options.purpose,
        contentType: file.type,
        sizeBytes: file.size,
        ...(options.shopId ? { shopId: options.shopId } : {}),
      },
    }),
  );
  if (!created.ok) return created;

  const { method, url, headers } = created.data.upload;
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  try {
    // The file is the whole body; the browser sets Content-Length from it, which is signed.
    const stored = await doFetch(url, { method, headers, body: file });
    if (!stored.ok) return { ok: false, code: UPLOAD_REFUSED };
  } catch {
    return { ok: false, code: NETWORK_ERROR };
  }

  return toResult(
    client.POST('/api/v1/media/uploads/{id}/confirm', {
      params: { path: { id: created.data.mediaId } },
    }),
  );
}
