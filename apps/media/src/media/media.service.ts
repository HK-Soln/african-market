import { DataSource, EntityManager, In } from 'typeorm';
import {
  AttachMediaRequest,
  AttachMediaResponse,
  ConfirmUploadRequest,
  CreateUploadRequest,
  CreateUploadResponse,
  DetachMediaRequest,
  DetachMediaResponse,
  MEDIA_RULES,
  MediaActor,
  MediaDto,
  PublicMediaUrlsRequest,
  PublicMediaUrlsResponse,
  MediaErrorCode,
  MediaErrors,
  MediaPurpose,
  PrivateMediaAccessRequest,
  PrivateMediaAccessResponse,
  SHOP_MEDIA_PURPOSES,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { MediaAccessLog, MediaObject, StoredFile } from '../entities';
import { mediaError } from '../errors';
import { ObjectStore, ObjectTooLargeError } from '../storage/object-store';
import { checkPdf, encodeImage, FileRejected, sniffType } from './file-checks';

/** How long an upload form works. */
export const UPLOAD_FORM_SECONDS = 5 * 60;
/** How long a private document link lasts; only the gateway ever holds it. */
export const PRIVATE_LINK_SECONDS = 60;
/** Uploads one person may have waiting at once, and start in an hour. */
export const MAX_PENDING_PER_USER = 20;
export const MAX_UPLOADS_PER_HOUR = 100;

type Outcome<T> = { ok: T } | { error: MediaErrorCode; details?: Record<string, unknown> };

/**
 * Who may upload what (decision T-27, T-29): an avatar for yourself; shop images for a shop you
 * own or manage (product images also as staff, when the shop allows it); a trade licence only for
 * a shop you own.
 */
export function mayUpload(
  actor: MediaActor,
  purpose: MediaPurpose,
  shopId: string | undefined,
  staffMayUpload = false,
): boolean {
  if (purpose === 'avatar') return shopId === undefined;
  const role = actor.shops.find((s) => s.shopId === shopId)?.role;
  if (!role) return false;
  if (purpose === 'trade_license') return role === 'owner';
  if (purpose === 'product_image' && role === 'staff') return staffMayUpload;
  return role === 'owner' || role === 'manager';
}

/** Where a file of an object lives, by role of bucket. Never chosen by the client. */
const fileKey = (object: MediaObject, name: string, extension: string) =>
  `${object.purpose}/${object.id}/${name}.${extension}`;

export class MediaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly store: ObjectStore,
    private readonly outbox: OutboxService,
  ) {}

  async createUpload(input: CreateUploadRequest): Promise<CreateUploadResponse> {
    const rule = MEDIA_RULES[input.purpose];
    const needsShop = SHOP_MEDIA_PURPOSES.includes(input.purpose);
    if (needsShop !== Boolean(input.shopId)) throw mediaError(MediaErrors.validationFailed);
    if (!mayUpload(input.actor, input.purpose, input.shopId, input.staffMayUpload)) {
      throw mediaError(MediaErrors.forbidden);
    }
    if (!rule.contentTypes.includes(input.contentType)) {
      throw mediaError(MediaErrors.typeNotAllowed, { allowed: rule.contentTypes });
    }
    if (input.sizeBytes > rule.maxBytes) {
      throw mediaError(MediaErrors.tooLarge, { maxBytes: rule.maxBytes });
    }

    const object = await this.dataSource.transaction(async (manager) => {
      const counts = await manager
        .createQueryBuilder(MediaObject, 'm')
        .select(`count(*) FILTER (WHERE m.created_at > now() - interval '1 hour')`, 'lastHour')
        .addSelect(
          `count(*) FILTER (WHERE m.status = 'pending' AND m.upload_expires_at > now())`,
          'waiting',
        )
        .where('m.owner_id = :owner', { owner: input.actor.userId })
        .andWhere(`m.created_at > now() - interval '1 hour'`)
        .getRawOne<{ lastHour: string; waiting: string }>();
      if (
        Number(counts?.lastHour ?? 0) >= MAX_UPLOADS_PER_HOUR ||
        Number(counts?.waiting ?? 0) >= MAX_PENDING_PER_USER
      ) {
        return undefined;
      }
      return manager.save(
        manager.create(MediaObject, {
          ownerId: input.actor.userId,
          purpose: input.purpose,
          shopId: input.shopId ?? null,
          visibility: rule.visibility,
          declaredType: input.contentType,
          maxBytes: input.sizeBytes,
          uploadExpiresAt: new Date(Date.now() + UPLOAD_FORM_SECONDS * 1000),
        }),
      );
    });
    if (!object) throw mediaError(MediaErrors.rateLimited);

    const upload = await this.store.presignUpload(
      object.id,
      input.contentType,
      input.sizeBytes,
      UPLOAD_FORM_SECONDS,
    );
    return { mediaId: object.id, upload, expiresAt: object.uploadExpiresAt.toISOString() };
  }

  /**
   * Checks the uploaded file and stores it for good. Only the uploader may confirm. Images are
   * re-encoded into their variants; a trade licence PDF is kept as it is, privately. The upload
   * is deleted either way.
   */
  async confirmUpload(input: ConfirmUploadRequest): Promise<MediaDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<Outcome<MediaObject>> => {
        const object = await manager.findOne(MediaObject, {
          where: { id: input.mediaId, ownerId: input.actor.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!object) return { error: MediaErrors.notFound };
        if (object.status === 'ready') return { ok: object }; // a retried confirm
        if (object.status !== 'pending')
          return { error: MediaErrors.fileRejected, details: { reason: object.rejectReason } };

        let bytes: Buffer | undefined;
        try {
          bytes = await this.store.read('uploads', object.id, object.maxBytes);
        } catch (err) {
          if (!(err instanceof ObjectTooLargeError)) throw err;
          return this.reject(manager, object, 'too_large');
        }
        if (!bytes) {
          if (object.uploadExpiresAt.getTime() < Date.now() - 60_000)
            return { error: MediaErrors.uploadExpired };
          return { error: MediaErrors.uploadMissing };
        }

        const rule = MEDIA_RULES[object.purpose];
        const type = sniffType(bytes);
        if (!type || !rule.contentTypes.includes(type))
          return this.reject(manager, object, 'wrong_type');

        const files: MediaObject['files'] = {};
        try {
          if (type === 'application/pdf') {
            checkPdf(bytes);
            const key = fileKey(object, 'document', 'pdf');
            await this.store.write('private', key, bytes, type);
            files.document = { key, contentType: type, bytes: bytes.length };
          } else {
            for (const image of await encodeImage(bytes, rule.variants)) {
              const key = fileKey(object, image.name, 'webp');
              await this.store.write(object.visibility, key, image.bytes, 'image/webp');
              files[image.name] = {
                key,
                contentType: 'image/webp',
                bytes: image.bytes.length,
                width: image.width,
                height: image.height,
              };
            }
          }
        } catch (err) {
          if (err instanceof FileRejected) return this.reject(manager, object, err.reason);
          throw err;
        }

        const largest = Object.values(files).reduce<StoredFile | undefined>(
          (best, file) => ((file?.width ?? 0) > (best?.width ?? 0) ? file : best),
          undefined,
        );
        object.status = 'ready';
        object.files = files;
        object.width = largest?.width ?? null;
        object.height = largest?.height ?? null;
        await manager.save(object);
        await this.outbox.enqueue(
          manager,
          'media.ready',
          {
            mediaId: object.id,
            ownerId: object.ownerId,
            purpose: object.purpose,
            urls: this.urls(object),
          },
          input.correlationId,
        );
        return { ok: object };
      },
    );

    if ('error' in outcome) throw mediaError(outcome.error, outcome.details);
    // Committed: the quarantined original is no longer needed.
    await this.store.remove('uploads', [outcome.ok.id]);
    return this.toDto(outcome.ok);
  }

  async attach(input: AttachMediaRequest): Promise<AttachMediaResponse> {
    const ids = [...new Set(input.mediaIds)];
    return this.dataSource.transaction(async (manager) => {
      const objects = await manager.find(MediaObject, {
        where: { id: In(ids) },
        lock: { mode: 'pessimistic_write' },
      });
      if (objects.length !== ids.length) throw mediaError(MediaErrors.notFound);
      for (const object of objects) {
        const sameTarget =
          object.attachedType === input.target.type && object.attachedId === input.target.id;
        if (sameTarget) continue;
        // Only the uploader binds an object, so nobody can use someone else's file by its id.
        if (object.ownerId !== input.actorId) throw mediaError(MediaErrors.notFound);
        if (object.status !== 'ready') throw mediaError(MediaErrors.notReady);
        if (object.purpose !== input.purpose) throw mediaError(MediaErrors.wrongPurpose);
        if (object.shopId !== (input.shopId ?? null)) throw mediaError(MediaErrors.wrongPurpose);
        if (object.attachedId) throw mediaError(MediaErrors.alreadyAttached);
        object.attachedType = input.target.type;
        object.attachedId = input.target.id;
        object.attachedAt = new Date();
        object.detachedAt = null;
      }
      await manager.save(objects);
      return { media: objects.map((o) => this.toDto(o)) };
    });
  }

  async detach(input: DetachMediaRequest): Promise<DetachMediaResponse> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(MediaObject)
      .set({ attachedType: null, attachedId: null, attachedAt: null, detachedAt: () => 'now()' })
      .where('id IN (:...ids)', {
        ids: input.mediaIds.length ? input.mediaIds : ['00000000-0000-0000-0000-000000000000'],
      })
      .andWhere('attached_type = :type AND attached_id = :id', input.target)
      .execute();
    return { detached: result.affected ?? 0 };
  }

  /** Admins only. Every call is written to media_access_log before the link is made. */
  async privateAccess(input: PrivateMediaAccessRequest): Promise<PrivateMediaAccessResponse> {
    if (!input.actor.roles.includes('admin')) throw mediaError(MediaErrors.forbidden);
    const object = await this.dataSource.manager.findOneBy(MediaObject, {
      id: input.mediaId,
      visibility: 'private',
      status: 'ready',
    });
    const document = object?.files.document;
    if (!object || !document) throw mediaError(MediaErrors.notFound);
    await this.dataSource.manager.insert(MediaAccessLog, {
      mediaId: object.id,
      actorId: input.actor.userId,
      correlationId: input.correlationId ?? null,
    });
    const extension = document.contentType === 'application/pdf' ? 'pdf' : 'webp';
    const filename = `${object.purpose}-${object.id}.${extension}`;
    return {
      url: await this.store.presignRead(document.key, filename, PRIVATE_LINK_SECONDS),
      contentType: document.contentType,
      filename,
    };
  }

  toDto(object: MediaObject): MediaDto {
    const first = Object.values(object.files)[0];
    return {
      id: object.id,
      purpose: object.purpose,
      status: object.status,
      contentType: first?.contentType ?? null,
      width: object.width,
      height: object.height,
      urls: this.urls(object),
    };
  }

  /** Links of public images only; private documents and unfinished uploads are left out. */
  async publicUrls(input: PublicMediaUrlsRequest): Promise<PublicMediaUrlsResponse> {
    const ids = [...new Set(input.mediaIds)];
    if (!ids.length) return { urls: {} };
    const objects = await this.dataSource.manager.findBy(MediaObject, {
      id: In(ids),
      visibility: 'public',
      status: 'ready',
    });
    return { urls: Object.fromEntries(objects.map((o) => [o.id, this.urls(o)])) };
  }

  private urls(object: MediaObject): MediaDto['urls'] {
    if (object.visibility !== 'public' || object.status !== 'ready') return {};
    return Object.fromEntries(
      Object.entries(object.files)
        .filter(([name]) => name !== 'document')
        .map(([name, file]) => [name, this.store.publicUrl(file!.key)]),
    );
  }

  private async reject(
    manager: EntityManager,
    object: MediaObject,
    reason: string,
  ): Promise<Outcome<MediaObject>> {
    object.status = 'rejected';
    object.rejectReason = reason;
    await manager.save(object);
    await this.store.remove('uploads', [object.id]);
    return { error: MediaErrors.fileRejected, details: { reason } };
  }
}
