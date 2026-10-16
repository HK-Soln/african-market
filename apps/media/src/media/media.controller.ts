import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  AttachMediaResponse,
  CreateUploadResponse,
  DetachMediaResponse,
  MEDIA_PURPOSES,
  MediaDto,
  MediaErrors,
  MediaPatterns,
  PrivateMediaAccessResponse,
} from '@am/contracts';
import { mediaError } from '../errors';
import { MediaService } from './media.service';

/** The gateway validates first; the service validates again before it acts. */
function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw mediaError(MediaErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const actor = z.object({
  userId: uuid,
  roles: z.array(z.string().max(32)).max(10),
  shops: z.array(z.object({ shopId: uuid, role: z.enum(['owner', 'manager', 'staff']) })).max(100),
});
const purpose = z.enum(MEDIA_PURPOSES);
const target = z.object({ type: z.enum(['user', 'shop', 'product', 'branch']), id: uuid });
const correlationId = z.string().max(128).optional();

const createUploadSchema = z.object({
  actor,
  purpose,
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  shopId: uuid.optional(),
  staffMayUpload: z.boolean().optional(),
});
const confirmSchema = z.object({ actor, mediaId: uuid, correlationId });
const attachSchema = z.object({
  actorId: uuid,
  purpose,
  shopId: uuid.optional(),
  target,
  mediaIds: z.array(uuid).min(1).max(20),
});
const detachSchema = z.object({ target, mediaIds: z.array(uuid).min(1).max(100) });
const accessSchema = z.object({ actor, mediaId: uuid, correlationId });

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @MessagePattern(MediaPatterns.createUpload)
  createUpload(@Payload() payload: unknown): Promise<CreateUploadResponse> {
    return this.media.createUpload(parse(createUploadSchema, payload));
  }

  @MessagePattern(MediaPatterns.confirmUpload)
  confirmUpload(@Payload() payload: unknown): Promise<MediaDto> {
    return this.media.confirmUpload(parse(confirmSchema, payload));
  }

  @MessagePattern(MediaPatterns.attach)
  attach(@Payload() payload: unknown): Promise<AttachMediaResponse> {
    return this.media.attach(parse(attachSchema, payload));
  }

  @MessagePattern(MediaPatterns.detach)
  detach(@Payload() payload: unknown): Promise<DetachMediaResponse> {
    return this.media.detach(parse(detachSchema, payload));
  }

  @MessagePattern(MediaPatterns.privateAccess)
  privateAccess(@Payload() payload: unknown): Promise<PrivateMediaAccessResponse> {
    return this.media.privateAccess(parse(accessSchema, payload));
  }
}
