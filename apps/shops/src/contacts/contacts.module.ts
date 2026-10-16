import {
  Controller,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import {
  CONTACT_CHANNELS,
  ContactErrors,
  ContactStatsDto,
  RecordContactResponse,
  ShopsPatterns,
} from '@am/contracts';
import { AppRpcException, EventBus } from '@am/core';
import { IdempotentConsumer } from '@am/database';
import { ContactService } from './contact.service';

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw AppRpcException.badRequest(ContactErrors.validationFailed, 'Invalid request', {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const recordSchema = z.object({
  shopId: uuid,
  branchId: uuid.optional(),
  productId: uuid.optional(),
  channel: z.enum(CONTACT_CHANNELS),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  sourcePage: z
    .string()
    .max(200)
    .regex(/^\/[^?#\s]*$/)
    .optional(),
  userId: uuid.optional(),
  correlationId: z.string().max(128).optional(),
});
const statsSchema = z.object({
  actor: z.object({
    userId: uuid,
    roles: z.array(z.string().max(32)).max(10),
    shops: z
      .array(z.object({ shopId: uuid, role: z.enum(['owner', 'manager', 'staff']) }))
      .max(100),
  }),
  shopId: uuid,
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactService) {}

  @MessagePattern(ShopsPatterns.recordContact)
  record(@Payload() payload: unknown): Promise<RecordContactResponse> {
    return this.contacts.record(parse(recordSchema, payload));
  }

  @MessagePattern(ShopsPatterns.contactStats)
  stats(@Payload() payload: unknown): Promise<ContactStatsDto> {
    return this.contacts.stats(parse(statsSchema, payload));
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Module({
  controllers: [ContactsController],
  providers: [
    {
      provide: ContactService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new ContactService(dataSource),
    },
  ],
})
export class ContactsModule implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ContactsModule.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly contacts: ContactService,
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('user.deleted', (event) =>
      this.once
        .handle(event, 'shops.contact-erasure', () =>
          this.contacts.forgetUser(event.payload.userId),
        )
        .then(() => undefined),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.partitions();
    this.timer = setInterval(() => void this.partitions(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async partitions(): Promise<void> {
    try {
      const made = await this.contacts.ensurePartitions();
      if (made) this.logger.log(`Created ${made} contact_event partitions`);
    } catch (err) {
      this.logger.warn(`Could not create contact_event partitions: ${(err as Error).message}`);
    }
  }
}
