'use client';

import type { ContactTapChannel } from '@am/contracts';
import { browserApi } from './browser-api';

const VISITOR_KEY = 'am.visitor';

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

let pageVisitor: string | undefined;

/**
 * A random id for this visit (decision T-33): it only lets the shop's count skip repeated taps.
 * Kept for the tab's session, so it is gone when the tab closes; never linked to the device.
 */
export function visitorId(): string {
  try {
    const kept = window.sessionStorage.getItem(VISITOR_KEY);
    if (kept) return kept;
    const made = randomId();
    window.sessionStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch {
    // Storage blocked: one id for this page.
    pageVisitor ??= randomId();
    return pageVisitor;
  }
}

export interface ContactTap {
  shopId: string;
  branchId?: string;
  productId?: string;
  channel: ContactTapChannel;
}

/**
 * Counts a WhatsApp, call or email tap for the shop's analytics. Sent as the visitor taps and
 * not waited for: it must never hold up WhatsApp or the dialer, and it outlives the page.
 */
export function recordContact(tap: ContactTap): void {
  void browserApi
    .POST('/api/v1/contact-events', {
      body: {
        ...tap,
        sessionId: visitorId(),
        sourcePage: window.location.pathname.slice(0, 200),
      },
      keepalive: true,
    })
    .catch(() => {
      // A lost count is not worth bothering the visitor about.
    });
}
