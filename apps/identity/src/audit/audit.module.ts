import { Controller, Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AUDIT_LIST_SPEC, AuditPage, IdentityPatterns } from '@am/contracts';
import { EventBus, listQueryFromPayload } from '@am/core';
import { IdempotentConsumer } from '@am/database';
import { actorSchema, parsePayload } from '../validation';
import { AuditService } from './audit.service';

@Controller()
class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** The gateway lets only admins reach this; the service checks again. */
  @MessagePattern(IdentityPatterns.listAudit)
  list(@Payload() payload: unknown): Promise<AuditPage> {
    const { actor } = parsePayload(z.object({ actor: actorSchema }).passthrough(), payload);
    return this.audit.list(actor, listQueryFromPayload(payload, AUDIT_LIST_SPEC));
  }
}

/** Keeps what the other services record about admin actions. */
@Injectable()
class AuditConsumer implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('audit.recorded', async (event) => {
      await this.once.handle(event, 'identity.audit', (manager) =>
        this.audit.record(manager, event.payload, {
          id: event.id,
          source: event.source,
          occurredAt: new Date(event.occurredAt),
          correlationId: event.correlationId,
        }),
      );
    });
  }
}

/** Global: identity's own admin actions (countries, roles) are recorded straight away. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    {
      provide: AuditService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new AuditService(dataSource),
    },
    AuditConsumer,
  ],
  exports: [AuditService],
})
export class AuditModule {}
