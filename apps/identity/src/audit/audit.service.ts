import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  ActorClaims,
  AuditEntryDto,
  AuditPage,
  AuditRecord,
  IdentityErrors,
  ListQuery,
} from '@am/contracts';
import { findPage } from '@am/database';
import { AdminAudit, User } from '../entities';
import { identityError } from '../errors';

/** AUDIT_LIST_SPEC's fields as SQL. */
const COLUMNS = {
  occurredAt: 'a.occurred_at',
  action: 'a.action',
  subjectType: 'a.subject_type',
  subjectId: 'a.subject_id',
  shopId: 'a.shop_id',
  actorId: 'a.actor_id',
};

export interface AuditOrigin {
  /** The event's id when the record came as one, so a repeat is the same row. */
  id?: string;
  source: string;
  occurredAt?: Date;
  correlationId?: string | null;
}

/** The admin audit log (decision T-42): every service's admin actions, in one place. */
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  /** Adds one entry, in the caller's transaction. A repeated event id adds nothing. */
  async record(manager: EntityManager, record: AuditRecord, origin: AuditOrigin): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(AdminAudit)
      .values({
        ...record,
        id: origin.id ?? randomUUID(),
        source: origin.source,
        correlationId: origin.correlationId ?? null,
        occurredAt: origin.occurredAt ?? new Date(),
      })
      .orIgnore()
      .execute();
  }

  async list(actor: Pick<ActorClaims, 'roles'>, query: ListQuery): Promise<AuditPage> {
    if (!actor.roles.includes('admin')) throw identityError(IdentityErrors.adminOnly);
    const qb = this.dataSource.getRepository(AdminAudit).createQueryBuilder('a');
    const page = await findPage(qb, query, { columns: COLUMNS, id: 'a.id' });
    // Admins' names as they are now; a deleted account shows none.
    const actorIds = [...new Set(page.items.flatMap((a) => (a.actorId ? [a.actorId] : [])))];
    const names = new Map(
      actorIds.length
        ? (
            await this.dataSource.getRepository(User).find({
              where: { id: In(actorIds) },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name])
        : [],
    );
    return {
      ...page,
      items: page.items.map((a): AuditEntryDto => ({
        id: a.id,
        source: a.source,
        actorId: a.actorId,
        actorName: (a.actorId && names.get(a.actorId)) || null,
        action: a.action as AuditEntryDto['action'],
        subjectType: a.subjectType as AuditEntryDto['subjectType'],
        subjectId: a.subjectId,
        shopId: a.shopId,
        details: a.details,
        correlationId: a.correlationId,
        occurredAt: a.occurredAt.toISOString(),
      })),
    };
  }
}
