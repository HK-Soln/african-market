import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import { DiscoveryErrors, DiscoveryPatterns, RebuildSearchResponse } from '@am/contracts';
import { AppRpcException } from '@am/core';
import { SearchIndexer } from './indexer';

const rebuildSchema = z.object({
  actor: z.object({ userId: z.uuid(), roles: z.array(z.string().max(32)).max(10) }).passthrough(),
  correlationId: z.string().max(128).optional(),
});

@Controller()
export class SearchController {
  constructor(private readonly indexer: SearchIndexer) {}

  /** Admins: rebuilds the read model from the owning services. */
  @MessagePattern(DiscoveryPatterns.rebuild)
  async rebuild(@Payload() payload: unknown): Promise<RebuildSearchResponse> {
    const parsed = rebuildSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.actor.roles.includes('admin'))
      throw AppRpcException.forbidden(DiscoveryErrors.adminOnly, 'Only an admin can do this');
    const result = await this.indexer.rebuild();
    if (!result)
      throw AppRpcException.conflict(DiscoveryErrors.rebuildRunning, 'A rebuild is running');
    return result;
  }
}
