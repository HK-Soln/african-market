import type { ActorClaims } from './actor';

/**
 * Media service contracts (F1-01, decision T-27). Only the media service touches storage: a
 * browser gets a single-use upload form for the quarantine bucket, media checks and re-encodes
 * the file, and everything after that goes through these patterns.
 */

export const MEDIA_PURPOSES = [
  'avatar',
  'shop_logo',
  'shop_gallery',
  'product_image',
  'trade_license',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export type MediaVisibility = 'public' | 'private';
export type MediaStatus = 'pending' | 'ready' | 'rejected' | 'deleted';

/** Image sizes kept for public images, by width in pixels (never enlarged). */
export const IMAGE_VARIANTS = { thumb: 200, card: 600, full: 1600 } as const;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

const MB = 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface MediaRule {
  visibility: MediaVisibility;
  /** Types a browser may declare, and that the bytes must turn out to be. */
  contentTypes: readonly string[];
  maxBytes: number;
  /** Variants made for an image; empty for private documents, kept whole. */
  variants: readonly ImageVariant[];
}

/**
 * What each purpose accepts. No SVG (it can carry scripts), no animated images, no HEIC (phones
 * convert to JPEG when a page asks for jpeg/png/webp).
 */
export const MEDIA_RULES: Record<MediaPurpose, MediaRule> = {
  avatar: {
    visibility: 'public',
    contentTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    variants: ['thumb', 'card'],
  },
  shop_logo: {
    visibility: 'public',
    contentTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    variants: ['thumb', 'card'],
  },
  shop_gallery: {
    visibility: 'public',
    contentTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    variants: ['thumb', 'card', 'full'],
  },
  product_image: {
    visibility: 'public',
    contentTypes: IMAGE_TYPES,
    maxBytes: 10 * MB,
    variants: ['thumb', 'card', 'full'],
  },
  trade_license: {
    visibility: 'private',
    contentTypes: [...IMAGE_TYPES, 'application/pdf'],
    maxBytes: 15 * MB,
    variants: [],
  },
};

/** Purposes that belong to a shop: the upload names the shop, and only its staff may make one. */
export const SHOP_MEDIA_PURPOSES: readonly MediaPurpose[] = [
  'shop_logo',
  'shop_gallery',
  'product_image',
  'trade_license',
];

/** Who is asking, from the verified access token. Media decides with this, not with ids alone. */
export type MediaActor = ActorClaims;

export interface CreateUploadRequest {
  actor: MediaActor;
  purpose: MediaPurpose;
  /** What the browser will send; must be one of the purpose's types. */
  contentType: string;
  /** The file's size; the upload link takes exactly this many bytes. */
  sizeBytes: number;
  /** Required for shop purposes. */
  shopId?: string;
  /** The shop lets staff upload product images (decision T-29); the gateway checks the setting. */
  staffMayUpload?: boolean;
}

export interface CreateUploadResponse {
  mediaId: string;
  /**
   * Where the browser sends the file: a PUT of the file as the body, with exactly these headers,
   * to the quarantine bucket. Any S3-compatible store (decision T-44).
   */
  upload: { method: 'PUT'; url: string; headers: Record<string, string> };
  /** ISO-8601 UTC: the form stops working then. */
  expiresAt: string;
}

export interface ConfirmUploadRequest {
  actor: MediaActor;
  mediaId: string;
  correlationId?: string;
}

export interface MediaDto {
  id: string;
  purpose: MediaPurpose;
  status: MediaStatus;
  /** The type it was stored as: image/webp for images, or application/pdf. */
  contentType: string | null;
  width: number | null;
  height: number | null;
  /** CDN URLs of the variants; empty for private documents, which never have a URL. */
  urls: Partial<Record<ImageVariant, string>>;
}

/** What uses a media object. */
export interface MediaTarget {
  type: 'user' | 'shop' | 'product' | 'branch';
  id: string;
}

/**
 * Binds objects to what uses them. Only the uploader may attach, only for the purpose the object
 * was made for, and only once (attaching to the same target again is fine). For shop purposes the
 * object must have been uploaded for `shopId`.
 */
export interface AttachMediaRequest {
  actorId: string;
  purpose: MediaPurpose;
  shopId?: string;
  target: MediaTarget;
  mediaIds: string[];
}

export interface AttachMediaResponse {
  media: MediaDto[];
}

/**
 * Unbinds objects from a target; the cleanup job deletes them a week later. The caller (the
 * gateway, for the owning service) has already checked that the actor may change the target.
 */
export interface DetachMediaRequest {
  target: MediaTarget;
  mediaIds: string[];
}

export interface DetachMediaResponse {
  detached: number;
}

/** Admins only: a private document, for the gateway to stream. Every call is logged. */
export interface PrivateMediaAccessRequest {
  actor: MediaActor;
  mediaId: string;
  /** Why it is being looked at, for the log (the request id). */
  correlationId?: string;
}

export interface PrivateMediaAccessResponse {
  /** A link valid for 60 seconds, for the gateway only; it never reaches a browser. */
  url: string;
  contentType: string;
  filename: string;
}

export const MediaErrors = {
  validationFailed: 'MEDIA_VALIDATION_FAILED',
  /** The caller may not upload this purpose (for this shop). */
  forbidden: 'MEDIA_FORBIDDEN',
  typeNotAllowed: 'MEDIA_TYPE_NOT_ALLOWED',
  tooLarge: 'MEDIA_TOO_LARGE',
  /** Too many uploads in progress or in the last hour. */
  rateLimited: 'MEDIA_RATE_LIMITED',
  notFound: 'MEDIA_NOT_FOUND',
  /** Confirmed before the file arrived; upload it, then confirm again. */
  uploadMissing: 'MEDIA_UPLOAD_MISSING',
  /** The upload window passed; start again. */
  uploadExpired: 'MEDIA_UPLOAD_EXPIRED',
  /** The file is not what it claims, is damaged, animated or too large in pixels; `details.reason`. */
  fileRejected: 'MEDIA_FILE_REJECTED',
  notReady: 'MEDIA_NOT_READY',
  wrongPurpose: 'MEDIA_WRONG_PURPOSE',
  alreadyAttached: 'MEDIA_ALREADY_ATTACHED',
} as const;

export type MediaErrorCode = (typeof MediaErrors)[keyof typeof MediaErrors];

/** Public: the CDN links of processed public images, for pages that show media by id. */
export interface PublicMediaUrlsRequest {
  mediaIds: string[];
}

export interface PublicMediaUrlsResponse {
  /** By media id; ids that are not public, processed images are left out. */
  urls: Record<string, Partial<Record<ImageVariant, string>>>;
}
