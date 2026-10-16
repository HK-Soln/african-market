import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  ListVerifiedShopIdsResponse,
  ShopErrors,
  ShopSearchSnapshotResponse,
  ShopsPatterns,
} from '@am/contracts';
import { shopError } from '../errors';
import { SearchSnapshotService } from './search-snapshot.service';

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw shopError(ShopErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/** Read by the discovery service only; the gateway routes none of these. */
@Controller()
export class SearchSnapshotController {
  constructor(private readonly snapshots: SearchSnapshotService) {}

  @MessagePattern(ShopsPatterns.searchSnapshot)
  snapshot(@Payload() payload: unknown): Promise<ShopSearchSnapshotResponse> {
    return this.snapshots.snapshot(parse(z.object({ shopId: z.uuid() }), payload));
  }

  @MessagePattern(ShopsPatterns.listVerifiedShopIds)
  verifiedIds(@Payload() payload: unknown): Promise<ListVerifiedShopIdsResponse> {
    return this.snapshots.verifiedIds(
      parse(
        z.object({ after: z.uuid().optional(), limit: z.number().int().min(1).max(500) }),
        payload,
      ),
    );
  }
}
