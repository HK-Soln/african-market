import { DataSource, EntityManager, In, IsNull, LessThan, Not } from 'typeorm';
import {
  ActorClaims,
  AuditAction,
  AuditDetails,
  DecideListingRequest,
  DecideTradeLicenseRequest,
  GetVerificationRequest,
  KycDocumentAccessRequest,
  KycDocumentAccessResponse,
  KycWebhookRequest,
  ListVerificationQueueRequest,
  RefreshKycRequest,
  ShopErrors,
  ShopVerificationStatus,
  StartKycRequest,
  StartKycResponse,
  SubmitForVerificationRequest,
  SubmitTradeLicenseRequest,
  VerificationErrors,
  VerificationOverviewDto,
  VerificationQueuePage,
  VerificationRequestDto,
} from '@am/contracts';
import { findPage, OutboxService } from '@am/database';
import { Branch, Shop, VerificationAudit, VerificationRequest } from '../entities';
import { shopError, verificationError } from '../errors';
import { accessTo, requireReader } from '../shops/access';
import { toShopDto } from '../shops/mapper';
import { KycDecision, KycProvider, KycProviderError } from './kyc-provider';

const QUEUE_COLUMNS = {
  verificationStatus: 's.verification_status',
  kycStatus: 's.kyc_status',
  submittedAt: 's.submitted_at',
  name: 's.name',
  search: `concat_ws(' ', s.name, s.slug)`,
};

/** What an admin decision does to a listing: from which statuses, to which. */
const TRANSITIONS: Record<
  DecideListingRequest['decision'],
  { from: ShopVerificationStatus[]; to: ShopVerificationStatus; reason: boolean }
> = {
  approve: { from: ['pending'], to: 'verified', reason: false },
  reject: { from: ['pending'], to: 'rejected', reason: true },
  suspend: { from: ['verified'], to: 'suspended', reason: true },
  reinstate: { from: ['suspended'], to: 'verified', reason: false },
};

const AUDIT_ACTION: Record<DecideListingRequest['decision'], string> = {
  approve: 'listing_approved',
  reject: 'listing_rejected',
  suspend: 'listing_suspended',
  reinstate: 'listing_reinstated',
};

const isAdmin = (actor: ActorClaims) => actor.roles.includes('admin');

/**
 * Seller verification (decision T-28): the owner proves who they are on the provider's hosted
 * page; the provider's result arrives by webhook (or when the owner comes back) and is fetched
 * from the provider, never taken from the webhook body; an admin approves the listing. Every
 * step is written to verification_audit.
 */
export class VerificationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly provider: KycProvider,
    private readonly sellerAppUrl: string,
  ) {}

  /** The owner starts (or resumes) identity verification; answers the hosted page to open. */
  async startKyc(input: StartKycRequest): Promise<StartKycResponse> {
    const request = await this.dataSource.transaction(async (manager) => {
      const shop = await this.ownedShop(manager, input.actor, input.shopId);
      if (shop.kycStatus === 'passed')
        throw verificationError(VerificationErrors.invalidTransition);
      // An unfinished one is resumed: the provider returns the same session for the same request.
      let request = await manager.findOne(VerificationRequest, {
        where: { shopId: shop.id, type: 'kyc', status: In(['started', 'pending']) },
        order: { createdAt: 'DESC' },
      });
      if (!request) {
        request = await manager.save(
          manager.create(VerificationRequest, {
            shopId: shop.id,
            type: 'kyc',
            submittedBy: input.actor.userId,
            status: 'started',
            provider: this.provider.name,
          }),
        );
        await this.audit(
          manager,
          shop.id,
          request.id,
          input.actor.userId,
          'kyc_started',
          {},
          input.correlationId,
        );
      }
      await manager.update(Shop, { id: shop.id }, { kycStatus: 'pending' });
      return request;
    });

    const locale = ['en', 'ar', 'fr'].includes(input.locale ?? '') ? input.locale! : 'en';
    const session = await this.providerCall(() =>
      this.provider.createSession({
        requestId: request.id,
        callbackUrl: `${this.sellerAppUrl.replace(/\/+$/, '')}/${locale}/shops/${input.shopId}/verification`,
        locale,
      }),
    );
    if (request.providerSessionId !== session.sessionId) {
      await this.dataSource.manager.update(
        VerificationRequest,
        { id: request.id },
        { providerSessionId: session.sessionId },
      );
    }
    return { requestId: request.id, url: session.url };
  }

  /** The owner is back from the hosted page: ask the provider where things stand. */
  async refreshKyc(input: RefreshKycRequest): Promise<VerificationOverviewDto> {
    const shop = await this.ownedShop(this.dataSource.manager, input.actor, input.shopId, false);
    const request = await this.dataSource.manager.findOne(VerificationRequest, {
      where: { shopId: shop.id, type: 'kyc', providerSessionId: Not(IsNull()) },
      order: { createdAt: 'DESC' },
    });
    if (request)
      await this.applyDecision(request.providerSessionId!, input.actor.userId, input.correlationId);
    return this.overview(shop.id, input.actor);
  }

  /**
   * A provider webhook. Only its signature and the session id are trusted; the decision itself is
   * fetched from the provider. Unknown sessions are acknowledged and ignored.
   */
  async webhook(input: KycWebhookRequest): Promise<{ accepted: boolean }> {
    const event = this.provider.verifyWebhook(input.rawBody, input.headers);
    if (!event) throw verificationError(VerificationErrors.webhookRejected);
    const applied = await this.applyDecision(event.sessionId, null, input.correlationId);
    return { accepted: applied };
  }

  /** The owner asks for the listing. The shop must be complete and identity verification begun. */
  async submit(input: SubmitForVerificationRequest): Promise<VerificationOverviewDto> {
    await this.dataSource.transaction(async (manager) => {
      const shop = await this.ownedShop(manager, input.actor, input.shopId);
      if (!['draft', 'rejected'].includes(shop.verificationStatus)) {
        throw verificationError(VerificationErrors.invalidTransition);
      }
      const branches = await manager.findBy(Branch, { shopId: shop.id });
      const missing: string[] = [];
      if (branches.length === 0) missing.push('branch');
      const hasContact = [shop, ...branches].some(
        (s) => s.contactWhatsapp || s.contactPhone || s.contactEmail,
      );
      if (!hasContact) missing.push('contact');
      if (!['pending', 'passed'].includes(shop.kycStatus)) missing.push('kyc');
      if (missing.length) throw verificationError(VerificationErrors.incomplete, { missing });

      await manager.update(
        Shop,
        { id: shop.id },
        { verificationStatus: 'pending', submittedAt: new Date(), verificationReason: null },
      );
      await this.audit(
        manager,
        shop.id,
        null,
        input.actor.userId,
        'submitted',
        {},
        input.correlationId,
      );
      await this.outbox.enqueue(manager, 'shop.updated', { shopId: shop.id }, input.correlationId);
    });
    return this.overview(input.shopId, input.actor);
  }

  async submitTradeLicense(input: SubmitTradeLicenseRequest): Promise<VerificationOverviewDto> {
    await this.dataSource.transaction(async (manager) => {
      const shop = await this.ownedShop(manager, input.actor, input.shopId);
      await manager.update(
        Shop,
        { id: shop.id },
        {
          legalName: input.legalName.trim(),
          tradeLicenseNo: input.licenseNumber.trim(),
          licenseIssuingAuthority: input.issuingAuthority.trim(),
          licenseExpiry: input.expiry,
          licenseMediaId: input.documentMediaId,
        },
      );
      // A new licence replaces one still waiting.
      await manager.update(
        VerificationRequest,
        { shopId: shop.id, type: 'trade_license', status: 'pending' },
        { status: 'rejected', reason: 'Replaced by a newer licence', decidedAt: new Date() },
      );
      const request = await manager.save(
        manager.create(VerificationRequest, {
          shopId: shop.id,
          type: 'trade_license',
          submittedBy: input.actor.userId,
          status: 'pending',
          documentMediaId: input.documentMediaId,
        }),
      );
      await this.audit(
        manager,
        shop.id,
        request.id,
        input.actor.userId,
        'license_submitted',
        { expiry: input.expiry },
        input.correlationId,
      );
    });
    return this.overview(input.shopId, input.actor);
  }

  /** The shop and its verifications: members see statuses, admins also the provider's summary. */
  async get(input: GetVerificationRequest): Promise<VerificationOverviewDto> {
    const shop = await this.dataSource.manager.findOneBy(Shop, { id: input.shopId });
    if (!shop) throw shopError(ShopErrors.notFound);
    requireReader(input.actor, shop);
    return this.overview(shop.id, input.actor);
  }

  async queue(input: ListVerificationQueueRequest): Promise<VerificationQueuePage> {
    this.requireAdmin(input.actor);
    const qb = this.dataSource
      .getRepository(Shop)
      .createQueryBuilder('s')
      .where('s.submitted_at IS NOT NULL');
    const page = await findPage(qb, input.query, { columns: QUEUE_COLUMNS, id: 's.id' });
    return { ...page, items: page.items.map((shop) => toShopDto(shop, [])) };
  }

  async decideListing(input: DecideListingRequest): Promise<VerificationOverviewDto> {
    this.requireAdmin(input.actor);
    const rule = TRANSITIONS[input.decision];
    const reason = input.reason?.trim() || null;
    if (rule.reason && !reason) throw verificationError(VerificationErrors.reasonRequired);
    await this.dataSource.transaction(async (manager) => {
      const shop = await manager.findOne(Shop, {
        where: { id: input.shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shop) throw shopError(ShopErrors.notFound);
      if (!rule.from.includes(shop.verificationStatus))
        throw verificationError(VerificationErrors.invalidTransition);
      if (rule.to === 'verified' && shop.kycStatus !== 'passed')
        throw verificationError(VerificationErrors.kycNotPassed);

      shop.verificationStatus = rule.to;
      shop.verificationReason = rule.reason ? reason : null;
      await manager.save(shop);
      await this.audit(
        manager,
        shop.id,
        null,
        input.actor.userId,
        AUDIT_ACTION[input.decision],
        { reason },
        input.correlationId,
      );
      await this.adminAudit(
        manager,
        input.actor,
        `shop.${AUDIT_ACTION[input.decision]}` as AuditAction,
        shop.id,
        { reason },
        input.correlationId,
      );
      await this.outbox.enqueue(
        manager,
        'shop.verified',
        {
          shopId: shop.id,
          verificationStatus: rule.to as 'verified' | 'rejected' | 'suspended',
          checkoutEnabled: shop.checkoutEnabled,
          codEnabled: shop.codEnabled,
        },
        input.correlationId,
      );
    });
    return this.overview(input.shopId, input.actor);
  }

  async decideTradeLicense(input: DecideTradeLicenseRequest): Promise<VerificationOverviewDto> {
    this.requireAdmin(input.actor);
    const reason = input.reason?.trim() || null;
    if (input.decision === 'reject' && !reason)
      throw verificationError(VerificationErrors.reasonRequired);
    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(VerificationRequest, {
        where: { id: input.requestId, shopId: input.shopId, type: 'trade_license' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw verificationError(VerificationErrors.requestNotFound);
      if (request.status !== 'pending')
        throw verificationError(VerificationErrors.invalidTransition);
      request.status = input.decision === 'approve' ? 'approved' : 'rejected';
      request.reviewerId = input.actor.userId;
      request.reason = reason;
      request.decidedAt = new Date();
      await manager.save(request);
      await this.audit(
        manager,
        request.shopId,
        request.id,
        input.actor.userId,
        `license_${request.status}`,
        { reason },
        input.correlationId,
      );
      await this.adminAudit(
        manager,
        input.actor,
        input.decision === 'approve' ? 'shop.license_approved' : 'shop.license_rejected',
        request.shopId,
        { reason, requestId: request.id },
        input.correlationId,
      );
    });
    return this.overview(input.shopId, input.actor);
  }

  /** Admins only: a fresh link to one identity image, for the gateway to stream. Logged first. */
  async kycDocument(input: KycDocumentAccessRequest): Promise<KycDocumentAccessResponse> {
    this.requireAdmin(input.actor);
    const request = await this.dataSource.manager.findOneBy(VerificationRequest, {
      id: input.requestId,
      shopId: input.shopId,
      type: 'kyc',
    });
    if (!request?.providerSessionId || request.erasedAt)
      throw verificationError(VerificationErrors.requestNotFound);
    await this.dataSource.transaction(async (manager) => {
      await this.audit(
        manager,
        request.shopId,
        request.id,
        input.actor.userId,
        'document_viewed',
        { kind: input.kind },
        input.correlationId,
      );
      await this.adminAudit(
        manager,
        input.actor,
        'shop.kyc_document_viewed',
        request.shopId,
        { kind: input.kind, requestId: request.id },
        input.correlationId,
      );
    });
    const decision = await this.providerCall(() =>
      this.provider.getDecision(request.providerSessionId!),
    );
    const url = decision.documents[input.kind];
    if (!url) throw verificationError(VerificationErrors.documentUnavailable);
    return { url, filename: `kyc-${input.kind}-${request.id}` };
  }

  /** On `user.deleted`: the provider session of each verification they made goes at `eraseBy`. */
  async scheduleErasure(userId: string, eraseBy: Date): Promise<void> {
    await this.dataSource.manager.update(
      VerificationRequest,
      { submittedBy: userId, erasedAt: IsNull() },
      { eraseAfter: eraseBy },
    );
  }

  /** Deletes provider sessions whose time came; the summary (names) goes with them. */
  async eraseDue(now = new Date()): Promise<number> {
    const due = await this.dataSource.manager.find(VerificationRequest, {
      where: { eraseAfter: LessThan(now), erasedAt: IsNull() },
      take: 100,
    });
    for (const request of due) {
      if (request.providerSessionId && request.provider === this.provider.name) {
        await this.providerCall(() => this.provider.deleteSession(request.providerSessionId!));
      }
      await this.dataSource.manager.update(
        VerificationRequest,
        { id: request.id },
        { kyc: null, erasedAt: now },
      );
    }
    return due.length;
  }

  /** Fetches the provider's decision for a session and records it. False for an unknown session. */
  private async applyDecision(
    sessionId: string,
    actorId: string | null,
    correlationId?: string,
  ): Promise<boolean> {
    const known = await this.dataSource.manager.findOneBy(VerificationRequest, {
      providerSessionId: sessionId,
    });
    if (!known) return false;
    const decision = await this.providerCall(() => this.provider.getDecision(sessionId));
    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(VerificationRequest, {
        where: { id: known.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.erasedAt) return;
      const status = this.requestStatus(decision);
      const changed =
        status !== request.status ||
        decision.summary.providerStatus !== request.kyc?.providerStatus;
      request.kyc = decision.summary;
      request.status = status;
      request.decidedAt =
        status === 'approved' || status === 'rejected' ? (request.decidedAt ?? new Date()) : null;
      await manager.save(request);

      // Only the newest KYC request decides the shop's KYC status.
      const newest = await manager.findOne(VerificationRequest, {
        where: { shopId: request.shopId, type: 'kyc' },
        order: { createdAt: 'DESC' },
      });
      if (newest?.id === request.id) {
        const kycStatus = {
          passed: 'passed',
          failed: 'failed',
          expired: 'none',
          pending: 'pending',
        }[decision.outcome] as Shop['kycStatus'];
        await manager.update(Shop, { id: request.shopId }, { kycStatus });
      }
      if (changed) {
        await this.audit(
          manager,
          request.shopId,
          request.id,
          actorId,
          'kyc_result',
          { providerStatus: decision.summary.providerStatus },
          correlationId,
        );
      }
    });
    return true;
  }

  private requestStatus(decision: KycDecision): VerificationRequest['status'] {
    return { passed: 'approved', failed: 'rejected', expired: 'expired', pending: 'pending' }[
      decision.outcome
    ] as VerificationRequest['status'];
  }

  private async overview(shopId: string, actor: ActorClaims): Promise<VerificationOverviewDto> {
    const manager = this.dataSource.manager;
    const shop = await manager.findOneByOrFail(Shop, { id: shopId });
    const branches = await manager.find(Branch, {
      where: { shopId },
      relations: { openingHours: true, specialHours: true },
    });
    const requests = await manager.find(VerificationRequest, {
      where: { shopId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const admin = isAdmin(actor);
    return {
      shop: toShopDto(shop, branches),
      requests: requests.map((r): VerificationRequestDto => ({
        id: r.id,
        shopId: r.shopId,
        type: r.type,
        status: r.status,
        // The provider's findings (a name, a nationality) are for admins.
        kyc: admin ? r.kyc : null,
        documentMediaId: admin ? r.documentMediaId : null,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
    };
  }

  /** The shop, locked, when the actor is its owner. Others learn nothing, or that it is owner-only. */
  private async ownedShop(
    manager: EntityManager,
    actor: ActorClaims,
    shopId: string,
    lock = true,
  ): Promise<Shop> {
    const shop = await manager.findOne(Shop, {
      where: { id: shopId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!shop) throw shopError(ShopErrors.notFound);
    const access = accessTo(actor, shop);
    if (!access) throw shopError(ShopErrors.notFound);
    if (access !== 'owner') throw verificationError(VerificationErrors.ownerOnly);
    return shop;
  }

  private requireAdmin(actor: ActorClaims): void {
    if (!isAdmin(actor)) throw verificationError(VerificationErrors.adminOnly);
  }

  private async providerCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof KycProviderError)
        throw verificationError(VerificationErrors.providerUnavailable);
      throw err;
    }
  }

  /** The admin audit log (decision T-42), published with the action it records. */
  private adminAudit(
    manager: EntityManager,
    actor: ActorClaims,
    action: AuditAction,
    shopId: string,
    details: AuditDetails,
    correlationId?: string,
  ) {
    return this.outbox.enqueue(
      manager,
      'audit.recorded',
      { actorId: actor.userId, action, subjectType: 'shop', subjectId: shopId, shopId, details },
      correlationId,
    );
  }

  private audit(
    manager: EntityManager,
    shopId: string,
    requestId: string | null,
    actorId: string | null,
    action: string,
    details: Record<string, unknown>,
    correlationId?: string,
  ) {
    return manager.save(
      manager.create(VerificationAudit, {
        shopId,
        requestId,
        actorId,
        action,
        details,
        correlationId: correlationId ?? null,
      }),
    );
  }
}
