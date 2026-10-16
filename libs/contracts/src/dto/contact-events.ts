import type { ActorClaims } from './actor';

/**
 * Contact taps (F1-07): a customer pressed WhatsApp, call or email on a shop, branch or product.
 * Sellers see them as leads; we see demand before chat exists. A tap is counted once per
 * session, shop and channel in CONTACT_DEDUP_MINUTES.
 */

export const CONTACT_CHANNELS = ['whatsapp', 'call', 'email'] as const;
export type ContactTapChannel = (typeof CONTACT_CHANNELS)[number];

/** A second tap on the same channel of the same shop within this is the same lead. */
export const CONTACT_DEDUP_MINUTES = 10;

export interface RecordContactRequest {
  shopId: string;
  branchId?: string;
  productId?: string;
  channel: ContactTapChannel;
  /** A random id the app keeps for the visitor (not tied to the person). */
  sessionId: string;
  /** The app path the tap came from, without its query (`/en/shops/lagos-kitchen`). */
  sourcePage?: string;
  /** The signed-in person, from the access token; never from the body. */
  userId?: string;
  correlationId?: string;
}

export interface RecordContactResponse {
  /** False when it repeated a tap within the de-duplication window. */
  recorded: boolean;
}

export const CONTACT_STATS_PERIODS = [7, 30, 90] as const;
export type ContactStatsPeriod = (typeof CONTACT_STATS_PERIODS)[number];

/** Owners and managers: the shop's taps over the last 7, 30 or 90 days (Asia/Dubai days). */
export interface ContactStatsRequest {
  actor: ActorClaims;
  shopId: string;
  days: ContactStatsPeriod;
}

export type ChannelCounts = Record<ContactTapChannel, number>;

export interface ContactStatsDto {
  shopId: string;
  days: ContactStatsPeriod;
  /** `YYYY-MM-DD` of the first day. */
  from: string;
  /** `YYYY-MM-DD` of the last day (today). */
  to: string;
  total: number;
  byChannel: ChannelCounts;
  /** Every day of the period, oldest first, zero when nothing happened. */
  byDay: Array<{ date: string } & ChannelCounts>;
  /** The products most contacted about, at most 20, most first. */
  byProduct: Array<{ productId: string; count: number }>;
}

export const ContactErrors = {
  validationFailed: 'CONTACT_VALIDATION_FAILED',
  /** No public shop (or branch of it) with that id. */
  shopNotFound: 'CONTACT_SHOP_NOT_FOUND',
} as const;
