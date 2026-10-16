import { Injectable } from '@nestjs/common';
import { ImageVariant, MediaPatterns, PublicMediaUrlsResponse } from '@am/contracts';
import { ServiceCaller } from './service-caller';

export type ImageUrls = Partial<Record<ImageVariant, string>>;

/**
 * Turns media ids into CDN links for pages: services keep ids only (they never read the media
 * schema), the gateway asks media once per response.
 */
@Injectable()
export class MediaLinks {
  constructor(private readonly caller: ServiceCaller) {}

  async of(ids: Array<string | null | undefined>): Promise<Map<string, ImageUrls>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length) return new Map();
    const links = new Map<string, ImageUrls>();
    // The media pattern takes 100 ids at a time.
    for (let i = 0; i < wanted.length; i += 100) {
      const { urls } = await this.caller.call<PublicMediaUrlsResponse>(
        'media',
        MediaPatterns.publicUrls,
        { mediaIds: wanted.slice(i, i + 100) },
      );
      for (const [id, u] of Object.entries(urls)) links.set(id, u);
    }
    return links;
  }
}
