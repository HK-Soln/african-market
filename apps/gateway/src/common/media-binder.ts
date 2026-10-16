import { Injectable, Logger } from '@nestjs/common';
import { MediaPatterns, MediaPurpose, MediaTarget } from '@am/contracts';
import { ServiceCaller } from './service-caller';

/**
 * Binds uploads to what uses them, around a change in the owning service (decision T-27):
 * attach first (media checks the uploader, the purpose and the shop), then the change, then
 * release what the change no longer uses. A failed release is logged, not an error: the change
 * was made, and the object only stays stored longer.
 */
@Injectable()
export class MediaBinder {
  private readonly logger = new Logger(MediaBinder.name);

  constructor(private readonly caller: ServiceCaller) {}

  async attach(input: {
    actorId: string;
    purpose: MediaPurpose;
    shopId: string;
    target: MediaTarget;
    mediaIds: Array<string | null | undefined>;
  }): Promise<void> {
    const mediaIds = [...new Set(input.mediaIds.filter((id): id is string => Boolean(id)))];
    if (!mediaIds.length) return;
    await this.caller.call('media', MediaPatterns.attach, { ...input, mediaIds });
  }

  async release(target: MediaTarget, mediaIds: string[]): Promise<void> {
    if (!mediaIds.length) return;
    try {
      await this.caller.call('media', MediaPatterns.detach, { target, mediaIds });
    } catch (err) {
      this.logger.warn(
        `Could not release ${mediaIds.length} media of ${target.type} ${target.id}: ${(err as Error).message}`,
      );
    }
  }
}
