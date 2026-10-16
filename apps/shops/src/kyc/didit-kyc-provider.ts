import { createHmac, timingSafeEqual } from 'node:crypto';
import type { KycDocumentKind, KycSummary } from '@am/contracts';
import {
  KycDecision,
  KycOutcome,
  KycProvider,
  KycProviderError,
  KycSession,
  KycWebhookEvent,
} from './kyc-provider';

/** A webhook older or newer than this is refused, so a captured one cannot be replayed later. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;
const TIMEOUT_MS = 10_000;

export interface DiditSettings {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  workflowId: string;
}

/** Didit session statuses, in our terms. Anything else is still in progress. */
export function outcomeOf(status: string): KycOutcome {
  switch (status) {
    case 'Approved':
      return 'passed';
    case 'Declined':
      return 'failed';
    case 'Abandoned':
    case 'Expired':
    case 'Kyc Expired':
      return 'expired';
    default:
      return 'pending';
  }
}

type Item = Record<string, unknown>;
const first = (value: unknown): Item | undefined =>
  Array.isArray(value) && value.length ? (value[0] as Item) : undefined;
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** The parts of Didit's decision an admin needs; images and personal numbers are left out. */
export function summarise(decision: Item): {
  summary: KycSummary;
  documents: Partial<Record<KycDocumentKind, string>>;
} {
  const id = first(decision.id_verifications);
  const liveness = first(decision.liveness_checks);
  const face = first(decision.face_matches);
  const warnings = [id, liveness, face]
    .flatMap((item) => (Array.isArray(item?.warnings) ? item.warnings : []))
    .map((w) =>
      typeof w === 'string' ? w : (str((w as Item)?.risk) ?? str((w as Item)?.short_description)),
    )
    .filter((w): w is string => Boolean(w));
  const documents: Partial<Record<KycDocumentKind, string>> = {};
  const links: Array<[KycDocumentKind, unknown]> = [
    ['id_front', id?.front_image],
    ['id_back', id?.back_image],
    ['portrait', id?.portrait_image],
    ['selfie', liveness?.reference_image],
  ];
  for (const [kind, link] of links) if (str(link)) documents[kind] = link as string;
  return {
    summary: {
      providerStatus: str(decision.status) ?? 'Unknown',
      documentType: str(id?.document_type),
      issuingState: str(id?.issuing_state),
      nationality: str(id?.nationality),
      documentExpiry: str(id?.expiration_date),
      fullName:
        str(id?.full_name) ??
        ([str(id?.first_name), str(id?.last_name)].filter(Boolean).join(' ') || null),
      idStatus: str(id?.status),
      livenessStatus: str(liveness?.status),
      livenessScore: num(liveness?.score),
      faceMatchStatus: str(face?.status),
      faceMatchScore: num(face?.score),
      warnings: [...new Set(warnings)],
    },
    documents,
  };
}

/** JSON with sorted keys and no spaces: what Didit's X-Signature-V2 is computed over. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Item)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameHex = (expected: string, given: string | undefined): boolean => {
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given.toLowerCase(), 'utf8'));
};

/**
 * Didit hosted sessions (https://docs.didit.me). The API key is sent only from this service;
 * webhooks are checked with HMAC-SHA256 over the raw body (`X-Signature`), or over the sorted
 * JSON (`X-Signature-V2`), within five minutes of `X-Timestamp`.
 */
export class DiditKycProvider implements KycProvider {
  readonly name = 'didit' as const;

  constructor(
    private readonly settings: DiditSettings,
    private readonly http: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async createSession(input: {
    requestId: string;
    callbackUrl: string;
    locale?: string;
  }): Promise<KycSession> {
    const body = await this.call('POST', '/v3/session/', {
      workflow_id: this.settings.workflowId,
      // Ties the session to our request; Didit also uses it to return an unfinished session.
      vendor_data: input.requestId,
      callback: input.callbackUrl,
      ...(input.locale ? { language: input.locale } : {}),
    });
    const sessionId = str(body.session_id);
    const url = str(body.url);
    if (!sessionId || !url)
      throw new KycProviderError('Didit created a session without an id or url');
    return { sessionId, url };
  }

  async getDecision(sessionId: string): Promise<KycDecision> {
    const decision = await this.call(
      'GET',
      `/v3/session/${encodeURIComponent(sessionId)}/decision/`,
    );
    const { summary, documents } = summarise(decision);
    return { outcome: outcomeOf(summary.providerStatus), summary, documents };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.call(
      'DELETE',
      `/v3/session/${encodeURIComponent(sessionId)}/delete/`,
      undefined,
      [404],
    );
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): KycWebhookEvent | undefined {
    const header = (name: string) => headers[name] ?? headers[name.toLowerCase()];
    const timestamp = Number(header('X-Timestamp'));
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      return undefined;
    }
    const hmac = (data: string) =>
      createHmac('sha256', this.settings.webhookSecret).update(data, 'utf8').digest('hex');

    let payload: Item;
    try {
      payload = JSON.parse(rawBody) as Item;
    } catch {
      return undefined;
    }
    const signed =
      sameHex(hmac(rawBody), header('X-Signature')) ||
      sameHex(hmac(canonical(payload)), header('X-Signature-V2'));
    if (!signed) return undefined;

    const sessionId = str(payload.session_id);
    if (!sessionId) return undefined;
    return { sessionId, requestId: str(payload.vendor_data), eventId: str(payload.event_id) };
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [],
  ): Promise<Item> {
    let response: Response;
    try {
      response = await this.http(`${this.settings.apiUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          'x-api-key': this.settings.apiKey,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new KycProviderError(`Didit unreachable: ${(err as Error).message}`);
    }
    if (okStatuses.includes(response.status)) return {};
    if (!response.ok) {
      // The body may hold personal data; only the status goes in the error.
      throw new KycProviderError(
        `Didit ${method} ${path.split('/')[2]} answered ${response.status}`,
      );
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as Item) : {};
  }
}
