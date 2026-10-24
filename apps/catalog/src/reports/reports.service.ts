import { DataSource } from 'typeorm';
import {
  ActorClaims,
  DecideReportRequest,
  DecideReportResponse,
  ListReportsRequest,
  ReportErrorCode,
  ReportErrors,
  ProductReportDto,
  ProductReportPage,
  SubmitProductReportRequest,
  SubmitReportResponse,
} from '@am/contracts';
import { AppRpcException } from '@am/core';
import { findPage, OutboxService } from '@am/database';
import { KnownShop, Product, ProductReport } from '../entities';

const STATUS: Partial<Record<ReportErrorCode, number>> = {
  [ReportErrors.listingNotFound]: 404,
  [ReportErrors.notFound]: 404,
  [ReportErrors.alreadyClosed]: 409,
  [ReportErrors.adminOnly]: 403,
};

const MESSAGE: Record<ReportErrorCode, string> = {
  [ReportErrors.validationFailed]: 'Invalid request',
  [ReportErrors.listingNotFound]: 'No such product',
  [ReportErrors.notFound]: 'No such report',
  [ReportErrors.alreadyClosed]: 'This report was already decided',
  [ReportErrors.adminOnly]: 'Only an admin can do this',
};

export function reportError(
  code: ReportErrorCode,
  details?: Record<string, unknown>,
): AppRpcException {
  return new AppRpcException({
    status: STATUS[code] ?? 400,
    code,
    message: MESSAGE[code],
    details,
  });
}

const COLUMNS = {
  status: 'r.status',
  reason: 'r.reason',
  shopId: 'r.shop_id',
  createdAt: 'r.created_at',
};

function requireAdmin(actor: ActorClaims): void {
  if (!actor.roles.includes('admin')) throw reportError(ReportErrors.adminOnly);
}

function toDto(report: ProductReport): ProductReportDto {
  return {
    id: report.id,
    shopId: report.shopId,
    productId: report.productId,
    productTitle: report.product?.title ?? {},
    reason: report.reason,
    details: report.details,
    signedIn: report.reporterId !== null,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    decidedAt: report.decidedAt?.toISOString() ?? null,
    decisionNote: report.decisionNote,
  };
}

/** Reports on public products (F1-15). */
export class ReportsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Anyone, on a public product (active, of a verified shop). A visitor's second report while the
   * first is open adds nothing.
   */
  async submit(input: SubmitProductReportRequest): Promise<SubmitReportResponse> {
    const manager = this.dataSource.manager;
    const product = await manager.findOneBy(Product, { id: input.productId, status: 'active' });
    const shop = product && (await manager.findOneBy(KnownShop, { id: product.shopId }));
    if (!product || !shop?.verified) throw reportError(ReportErrors.listingNotFound);
    const result = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(ProductReport)
      .values({
        productId: product.id,
        shopId: product.shopId,
        reason: input.reason,
        details: input.details?.trim() || null,
        reporterId: input.userId ?? null,
        sessionId: input.sessionId,
      })
      .orIgnore()
      .execute();
    // ON CONFLICT DO NOTHING returns no row when the visitor's open report was already there.
    return { recorded: (result.raw as unknown[]).length > 0 };
  }

  async list(input: ListReportsRequest): Promise<ProductReportPage> {
    requireAdmin(input.actor);
    const qb = this.dataSource
      .getRepository(ProductReport)
      .createQueryBuilder('r')
      // A product removed since is still named in its reports.
      .withDeleted()
      .leftJoinAndSelect('r.product', 'product')
      .where('r.deleted_at IS NULL');
    const page = await findPage(qb, input.query, { columns: COLUMNS, id: 'r.id' });
    return { ...page, items: page.items.map(toDto) };
  }

  /** Closes the report and every other open report on the same product, with one audit entry. */
  async decide(input: DecideReportRequest): Promise<DecideReportResponse> {
    requireAdmin(input.actor);
    return this.dataSource.transaction(async (manager) => {
      const report = await manager.findOne(ProductReport, {
        where: { id: input.reportId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!report) throw reportError(ReportErrors.notFound);
      if (report.status !== 'open') throw reportError(ReportErrors.alreadyClosed);
      const note = input.note?.trim() || null;
      const closed: Array<{ id: string; reason: string }> = await manager
        .query(
          `UPDATE catalog.product_report
            SET status = $2, decided_at = now(), decided_by = $3, decision_note = $4, updated_at = now()
          WHERE product_id = $1 AND status = 'open' AND deleted_at IS NULL
          RETURNING id, reason`,
          [report.productId, input.outcome, input.actor.userId, note],
        )
        .then(([rows]: [Array<{ id: string; reason: string }>]) => rows);
      // The admin audit log (decision T-42).
      await this.outbox.enqueue(
        manager,
        'audit.recorded',
        {
          actorId: input.actor.userId,
          action:
            input.outcome === 'resolved' ? 'product.report_resolved' : 'product.report_dismissed',
          subjectType: 'product',
          subjectId: report.productId,
          shopId: report.shopId,
          details: {
            reports: closed.length,
            reasons: [...new Set(closed.map((r) => r.reason))].sort().join(','),
          },
        },
        input.correlationId,
      );
      return { closed: closed.length };
    });
  }

  /** A deleted account's reports stay, without the person (T-23). */
  async forgetUser(userId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE catalog.product_report SET reporter_id = NULL WHERE reporter_id = $1`,
      [userId],
    );
  }
}
