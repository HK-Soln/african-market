import { randomUUID } from 'node:crypto';
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { MediaActor, MediaErrors } from '@am/contracts';
import { baseEnvSchema, loadEnv } from '@am/core';
import { OutboxMessage, OutboxService } from '@am/database';
import { MediaEnv, mediaEnvSchema } from '../src/config/media-env';
import { MediaAccessLog, MediaObject } from '../src/entities';
import { MediaCleanup } from '../src/media/media-cleanup';
import { MediaService } from '../src/media/media.service';
import { CdnPurger } from '../src/storage/cdn';
import { ObjectStore, UploadForm } from '../src/storage/object-store';
import { createTestDatabase, TestDatabase } from './support/test-database';

// Against real Postgres and MinIO (`pnpm infra:up`; CI starts both). Each run makes its own three
// buckets and removes them afterwards, so it cannot touch the buckets the running apps use.

const run = randomUUID().slice(0, 8);
const env = loadEnv(baseEnvSchema.extend(mediaEnvSchema.shape), {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
  RABBITMQ_URL: 'amqp://unused',
  REDIS_URL: 'redis://unused',
  S3_REGION: 'me-central-1',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'am-minio',
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'am-minio-secret',
  S3_UPLOADS_BUCKET: `t-${run}-uploads`,
  S3_PUBLIC_BUCKET: `t-${run}-public`,
  S3_PRIVATE_BUCKET: `t-${run}-private`,
  MEDIA_PUBLIC_BASE_URL: `${process.env.S3_ENDPOINT ?? 'http://localhost:9000'}/t-${run}-public`,
}) as MediaEnv;

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
});

/** Every key in a bucket. */
async function keysIn(bucket: string): Promise<string[]> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  return (listed.Contents ?? []).map((o) => o.Key!).sort();
}

/** Posts the upload form the way a browser does: the fields, then the file. */
async function post(
  form: UploadForm,
  bytes: Buffer,
  type: string,
  extra: Record<string, string> = {},
) {
  const body = new FormData();
  for (const [name, value] of Object.entries({ ...form.fields, ...extra }))
    body.append(name, value);
  body.append('file', new Blob([new Uint8Array(bytes)], { type }), 'upload');
  return (await fetch(form.url, { method: 'POST', body })).status;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

const photo = () =>
  sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#a9500e' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Adaeze Okafor' } })
    .toBuffer();
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

describe('media service (Postgres + MinIO)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let store: ObjectStore;
  let media: MediaService;
  let cleanup: MediaCleanup;
  const purged: string[] = [];
  const cdn: CdnPurger = { purge: async (keys) => void purged.push(...keys) };

  const shopId = randomUUID();
  const actor = (
    role?: 'owner' | 'manager' | 'staff',
    roles = ['customer', 'seller'],
  ): MediaActor => ({
    userId: randomUUID(),
    roles,
    shops: role ? [{ shopId, role }] : [],
  });

  /** Uploads and confirms a file, the whole way through. */
  async function upload(
    who: MediaActor,
    purpose: 'avatar' | 'shop_logo' | 'product_image' | 'trade_license',
    bytes: Buffer,
    type: string,
  ) {
    const created = await media.createUpload({
      actor: who,
      purpose,
      contentType: type,
      sizeBytes: bytes.length,
      shopId: purpose === 'avatar' ? undefined : shopId,
    });
    expect(await post(created.upload, bytes, type)).toBe(204);
    return media.confirmUpload({ actor: who, mediaId: created.mediaId });
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    store = new ObjectStore(env);
    await store.createBuckets();
    media = new MediaService(db, store, new OutboxService('media'));
    cleanup = new MediaCleanup(db, store, cdn);
  }, 60_000);

  afterAll(async () => {
    for (const bucket of [env.S3_UPLOADS_BUCKET, env.S3_PUBLIC_BUCKET, env.S3_PRIVATE_BUCKET]) {
      const keys = await keysIn(bucket).catch(() => []);
      if (keys.length) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    }
    await testDb?.drop();
  });

  describe('uploading an image', () => {
    it('stores re-encoded sizes in public, deletes the upload and announces it', async () => {
      const who = actor();
      const result = await upload(who, 'avatar', await photo(), 'image/jpeg');

      expect(result).toMatchObject({
        purpose: 'avatar',
        status: 'ready',
        contentType: 'image/webp',
        width: 600,
      });
      expect(Object.keys(result.urls).sort()).toEqual(['card', 'thumb']);
      expect(await keysIn(env.S3_UPLOADS_BUCKET)).not.toContain(result.id);

      // Anyone can read it at its public address, and nothing personal came along.
      const served = Buffer.from(await (await fetch(result.urls.card!)).arrayBuffer());
      const meta = await sharp(served).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 600 });
      expect(meta.exif).toBeUndefined();

      const event = (await db.getRepository(OutboxMessage).findBy({ name: 'media.ready' })).find(
        (e) => (e.envelope as { payload: { mediaId: string } }).payload.mediaId === result.id,
      );
      expect(event?.envelope).toMatchObject({
        payload: { ownerId: who.userId, purpose: 'avatar', urls: result.urls },
      });
    });

    it('lets storage refuse a file larger than announced, or another content type', async () => {
      const who = actor();
      const bytes = await photo();
      const created = await media.createUpload({
        actor: who,
        purpose: 'avatar',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      });
      expect(await post(created.upload, bytes, 'image/jpeg')).toBe(400);
      expect(
        await post(created.upload, bytes.subarray(0, 900), 'image/jpeg', {
          'Content-Type': 'text/html',
        }),
      ).toBe(403);
      expect(await codeOf(media.confirmUpload({ actor: who, mediaId: created.mediaId }))).toBe(
        MediaErrors.uploadMissing,
      );
    });

    it('rejects a file that is not what it claims to be, and throws the upload away', async () => {
      const who = actor();
      const fake = Buffer.from('<html><script>alert(1)</script></html>');
      const created = await media.createUpload({
        actor: who,
        purpose: 'avatar',
        contentType: 'image/png',
        sizeBytes: fake.length,
      });
      expect(await post(created.upload, fake, 'image/png')).toBe(204);
      const error = media.confirmUpload({ actor: who, mediaId: created.mediaId });
      await expect(error).rejects.toMatchObject({
        error: { code: MediaErrors.fileRejected, details: { reason: 'wrong_type' } },
      });
      expect(await keysIn(env.S3_UPLOADS_BUCKET)).not.toContain(created.mediaId);
      expect(
        await db.getRepository(MediaObject).findOneByOrFail({ id: created.mediaId }),
      ).toMatchObject({
        status: 'rejected',
        rejectReason: 'wrong_type',
      });
    });

    it('lets only the uploader confirm', async () => {
      const created = await media.createUpload({
        actor: actor(),
        purpose: 'avatar',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      });
      expect(await codeOf(media.confirmUpload({ actor: actor(), mediaId: created.mediaId }))).toBe(
        MediaErrors.notFound,
      );
    });

    it('refuses what the person may not upload, and types the purpose does not take', async () => {
      const base = { contentType: 'image/jpeg', sizeBytes: 100, shopId };
      expect(
        await codeOf(media.createUpload({ ...base, actor: actor('staff'), purpose: 'shop_logo' })),
      ).toBe(MediaErrors.forbidden);
      expect(
        await codeOf(
          media.createUpload({ ...base, actor: actor('manager'), purpose: 'trade_license' }),
        ),
      ).toBe(MediaErrors.forbidden);
      expect(
        await codeOf(
          media.createUpload({
            ...base,
            actor: actor('owner'),
            purpose: 'shop_logo',
            contentType: 'image/svg+xml',
          }),
        ),
      ).toBe(MediaErrors.typeNotAllowed);
      expect(
        await codeOf(
          media.createUpload({
            ...base,
            actor: actor('owner'),
            purpose: 'shop_logo',
            sizeBytes: 50 * 1024 * 1024,
          }),
        ),
      ).toBe(MediaErrors.tooLarge);
      expect(
        await codeOf(
          media.createUpload({
            ...base,
            actor: actor('staff'),
            purpose: 'product_image',
            staffMayUpload: true,
          }),
        ),
      ).toBeUndefined();
    });

    it('limits how many uploads one person can have waiting', async () => {
      const who = actor();
      for (let i = 0; i < 20; i++) {
        await media.createUpload({
          actor: who,
          purpose: 'avatar',
          contentType: 'image/jpeg',
          sizeBytes: 100,
        });
      }
      expect(
        await codeOf(
          media.createUpload({
            actor: who,
            purpose: 'avatar',
            contentType: 'image/jpeg',
            sizeBytes: 100,
          }),
        ),
      ).toBe(MediaErrors.rateLimited);
    });
  });

  describe('private documents', () => {
    it('keeps a trade licence private and lets only admins open it, each time logged', async () => {
      const owner = actor('owner');
      const result = await upload(owner, 'trade_license', pdf, 'application/pdf');

      expect(result).toMatchObject({ status: 'ready', contentType: 'application/pdf', urls: {} });
      expect(await keysIn(env.S3_PUBLIC_BUCKET)).not.toEqual(
        expect.arrayContaining([expect.stringContaining(result.id)]),
      );
      expect(await keysIn(env.S3_PRIVATE_BUCKET)).toContain(
        `trade_license/${result.id}/document.pdf`,
      );

      expect(await codeOf(media.privateAccess({ actor: owner, mediaId: result.id }))).toBe(
        MediaErrors.forbidden,
      );

      const admin = actor(undefined, ['customer', 'admin']);
      const access = await media.privateAccess({
        actor: admin,
        mediaId: result.id,
        correlationId: 'req-1',
      });
      expect(access).toMatchObject({
        contentType: 'application/pdf',
        filename: `trade_license-${result.id}.pdf`,
      });
      const response = await fetch(access.url);
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
      expect(await db.getRepository(MediaAccessLog).findBy({ mediaId: result.id })).toEqual([
        expect.objectContaining({ actorId: admin.userId, correlationId: 'req-1' }),
      ]);
    });
  });

  describe('public links', () => {
    it('gives the links of public images by id, and nothing for documents or unknown ids', async () => {
      const owner = actor('owner');
      const logo = await upload(owner, 'shop_logo', await photo(), 'image/jpeg');
      const licence = await upload(owner, 'trade_license', pdf, 'application/pdf');
      const pending = await media.createUpload({
        actor: owner,
        purpose: 'product_image',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        shopId,
      });
      const { urls } = await media.publicUrls({
        mediaIds: [logo.id, licence.id, pending.mediaId, randomUUID()],
      });
      expect(urls).toEqual({ [logo.id]: logo.urls });
    });
  });

  describe('attaching', () => {
    it('binds an object only for its uploader, its purpose and its shop, once', async () => {
      const manager = actor('manager');
      const image = await upload(manager, 'product_image', await photo(), 'image/jpeg');
      const product = { type: 'product' as const, id: randomUUID() };
      const request = {
        actorId: manager.userId,
        purpose: 'product_image' as const,
        shopId,
        target: product,
        mediaIds: [image.id],
      };

      expect(await codeOf(media.attach({ ...request, actorId: randomUUID() }))).toBe(
        MediaErrors.notFound,
      );
      expect(await codeOf(media.attach({ ...request, purpose: 'shop_logo' }))).toBe(
        MediaErrors.wrongPurpose,
      );
      expect(await codeOf(media.attach({ ...request, shopId: randomUUID() }))).toBe(
        MediaErrors.wrongPurpose,
      );

      await media.attach(request);
      await media.attach(request); // the same again is fine
      expect(
        await codeOf(media.attach({ ...request, target: { type: 'product', id: randomUUID() } })),
      ).toBe(MediaErrors.alreadyAttached);

      expect(
        (
          await media.detach({
            target: { type: 'product', id: randomUUID() },
            mediaIds: [image.id],
          })
        ).detached,
      ).toBe(0);
      expect((await media.detach({ target: product, mediaIds: [image.id] })).detached).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('deletes what nobody uses, from storage and the CDN, and keeps what is used', async () => {
      const owner = actor('owner');
      const used = await upload(owner, 'shop_logo', await photo(), 'image/jpeg');
      await media.attach({
        actorId: owner.userId,
        purpose: 'shop_logo',
        shopId,
        target: { type: 'shop', id: shopId },
        mediaIds: [used.id],
      });
      const unused = await upload(owner, 'shop_logo', await photo(), 'image/jpeg');
      const never = await media.createUpload({
        actor: owner,
        purpose: 'avatar',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      });
      await db.query(`UPDATE media.media_object SET created_at = now() - interval '2 days'`);

      await cleanup.run();

      const rows = await db.getRepository(MediaObject).find({ withDeleted: true });
      const status = (id: string) => rows.find((r) => r.id === id)?.status;
      expect([status(used.id), status(unused.id), status(never.mediaId)]).toEqual([
        'ready',
        'deleted',
        'deleted',
      ]);
      const publicKeys = await keysIn(env.S3_PUBLIC_BUCKET);
      expect(publicKeys.some((k) => k.includes(unused.id))).toBe(false);
      expect(publicKeys.some((k) => k.includes(used.id))).toBe(true);
      expect(purged).toEqual(expect.arrayContaining([`shop_logo/${unused.id}/card.webp`]));
    });

    it('deletes a deleted account’s avatar and unused uploads at once', async () => {
      const person = actor('owner');
      const avatar = await upload(person, 'avatar', await photo(), 'image/jpeg');
      await media.attach({
        actorId: person.userId,
        purpose: 'avatar',
        target: { type: 'user', id: person.userId },
        mediaIds: [avatar.id],
      });
      const shopImage = await upload(person, 'shop_logo', await photo(), 'image/jpeg');
      await media.attach({
        actorId: person.userId,
        purpose: 'shop_logo',
        shopId,
        target: { type: 'shop', id: shopId },
        mediaIds: [shopImage.id],
      });

      expect(await cleanup.removeForUser(person.userId)).toBe(1);
      const rows = await db.getRepository(MediaObject).find({ withDeleted: true });
      expect(rows.find((r) => r.id === avatar.id)?.status).toBe('deleted');
      expect(rows.find((r) => r.id === shopImage.id)?.status).toBe('ready');
    });
  });
});
