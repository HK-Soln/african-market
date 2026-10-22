import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaEnv } from '../config/media-env';

export type BucketName = 'uploads' | 'public' | 'private';

/**
 * Where a browser sends one file: a PUT of the file as the body to `url`, with exactly these
 * headers. It works the same on every S3-compatible store (AWS S3, Cloudflare R2, MinIO), which
 * the older POST form does not (R2 has no POST uploads), decision T-44.
 */
export interface UploadTarget {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
}

/** Thrown by `read` when an object is larger than the caller allows. */
export class ObjectTooLargeError extends Error {}

/**
 * Everything the media service does with storage, over the S3 API, so any S3-compatible store
 * works: AWS S3, Cloudflare R2 (S3_ENDPOINT and keys), MinIO locally. Only this class holds the
 * credentials; the service code names buckets by role (uploads, public, private), never by their
 * real names.
 */
export class ObjectStore {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor(private readonly env: MediaEnv) {
    const credentials =
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined;
    const make = (endpoint?: string) =>
      new S3Client({
        region: env.S3_REGION,
        endpoint,
        credentials,
        // MinIO serves buckets as paths, not subdomains.
        forcePathStyle: Boolean(endpoint),
        // Checksums only where an operation needs one: signed upload links must not carry a
        // checksum of an empty body, or every real upload would fail it.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    this.client = make(env.S3_ENDPOINT);
    this.presignClient = make(env.S3_PRESIGN_ENDPOINT ?? env.S3_ENDPOINT);
    this.buckets = {
      uploads: env.S3_UPLOADS_BUCKET,
      public: env.S3_PUBLIC_BUCKET,
      private: env.S3_PRIVATE_BUCKET,
    };
  }

  /**
   * A link that lets a browser write exactly one object: this key, this content type and exactly
   * `sizeBytes` bytes (both are signed, so storage refuses anything else), for `expiresSeconds`.
   */
  async presignUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresSeconds: number,
  ): Promise<UploadTarget> {
    const url = await getSignedUrl(
      this.presignClient,
      new PutObjectCommand({
        Bucket: this.buckets.uploads,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: expiresSeconds, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    // The browser sets Content-Length itself, from the file.
    return { method: 'PUT', url, headers: { 'Content-Type': contentType } };
  }

  /** The object's bytes, or undefined when it is not there. Refuses more than `maxBytes`. */
  async read(bucket: BucketName, key: string, maxBytes: number): Promise<Buffer | undefined> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      if ((result.ContentLength ?? 0) > maxBytes) {
        result.Body?.transformToWebStream()
          .cancel()
          .catch(() => undefined);
        throw new ObjectTooLargeError(`${result.ContentLength} bytes`);
      }
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : undefined;
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === 'NoSuchKey')
        return undefined;
      throw err;
    }
  }

  /** Stores an object. Keys are never reused, so a stored object can be cached for good. */
  async write(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: bucket === 'public' ? 'public, max-age=31536000, immutable' : 'no-store',
      }),
    );
  }

  /** Deletes objects; ones that are already gone are fine. */
  async remove(bucket: BucketName, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.buckets[bucket],
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  /** A short link to a private object, for the gateway to stream; downloads as a file. */
  presignRead(key: string, filename: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.buckets.private,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
        ResponseCacheControl: 'no-store',
      }),
      { expiresIn: expiresSeconds },
    );
  }

  /** The public address of a public object. */
  publicUrl(key: string): string {
    return `${this.env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;
  }

  /**
   * Local MinIO only (S3_CREATE_BUCKETS): makes the buckets, and lets anyone read the public one,
   * which the CDN does in AWS.
   */
  async createBuckets(): Promise<void> {
    for (const name of Object.values(this.buckets)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: name }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: name }));
      }
    }
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.buckets.public,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.buckets.public}/*`],
            },
          ],
        }),
      }),
    );
  }
}
