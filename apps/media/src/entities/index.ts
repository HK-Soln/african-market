import { MediaAccessLog } from './media-access-log.entity';
import { MediaObject } from './media-object.entity';

export * from './media-access-log.entity';
export * from './media-object.entity';

/** TypeORM entities owned by the media service. */
export const entities = [MediaObject, MediaAccessLog];
