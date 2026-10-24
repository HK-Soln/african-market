import { Controller, Module, OnModuleInit } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import {
  DecideReportResponse,
  REPORT_DETAILS_MAX,
  REPORT_LIST_SPEC,
  REPORT_OTHER_MIN,
  REPORT_OUTCOMES,
  REPORT_REASONS,
  ReportErrors,
  ShopReportPage,
  ShopsPatterns,
  SubmitReportResponse,
} from '@am/contracts';
import { EventBus, listQueryFromPayload } from '@am/core';
import { IdempotentConsumer, OutboxService } from '@am/database';
import { reportError, ReportsService } from './reports.service';

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw reportError(ReportErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const actor = z.object({
  userId: uuid,
  roles: z.array(z.string().max(32)).max(10),
  shops: z.array(z.object({ shopId: uuid, role: z.enum(['owner', 'manager', 'staff']) })).max(100),
});
const submitSchema = z
  .object({
    shopId: uuid,
    reason: z.enum(REPORT_REASONS),
    details: z.string().max(REPORT_DETAILS_MAX).optional(),
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    userId: uuid.optional(),
    correlationId: z.string().max(128).optional(),
  })
  .refine((r) => r.reason !== 'other' || (r.details?.trim().length ?? 0) >= REPORT_OTHER_MIN, {
    path: ['details'],
    message: `"other" needs at least ${REPORT_OTHER_MIN} characters saying what is wrong`,
  });
const decideSchema = z.object({
  actor,
  reportId: uuid,
  outcome: z.enum(REPORT_OUTCOMES),
  note: z.string().max(REPORT_DETAILS_MAX).optional(),
  correlationId: z.string().max(128).optional(),
});

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @MessagePattern(ShopsPatterns.submitReport)
  submit(@Payload() payload: unknown): Promise<SubmitReportResponse> {
    return this.reports.submit(parse(submitSchema, payload));
  }

  @MessagePattern(ShopsPatterns.listReports)
  list(@Payload() payload: unknown): Promise<ShopReportPage> {
    const { actor: who } = parse(z.object({ actor }).passthrough(), payload);
    return this.reports.list({
      actor: who,
      query: listQueryFromPayload(payload, REPORT_LIST_SPEC),
    });
  }

  @MessagePattern(ShopsPatterns.decideReport)
  decide(@Payload() payload: unknown): Promise<DecideReportResponse> {
    return this.reports.decide(parse(decideSchema, payload));
  }
}

@Module({
  controllers: [ReportsController],
  providers: [
    {
      provide: ReportsService,
      inject: [getDataSourceToken(), OutboxService],
      useFactory: (dataSource: DataSource, outbox: OutboxService) =>
        new ReportsService(dataSource, outbox),
    },
  ],
})
export class ReportsModule implements OnModuleInit {
  constructor(
    private readonly reports: ReportsService,
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('user.deleted', (event) =>
      this.once
        .handle(event, 'shops.report-erasure', () => this.reports.forgetUser(event.payload.userId))
        .then(() => undefined),
    );
  }
}
