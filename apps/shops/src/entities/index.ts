import { Branch } from './branch.entity';
import { OpeningHours } from './opening-hours.entity';
import { Shop } from './shop.entity';
import { SpecialHours } from './special-hours.entity';

export * from './branch.entity';
export * from './opening-hours.entity';
export * from './shop.entity';
export * from './special-hours.entity';

/** TypeORM entities owned by the shops service. Verification (F1-03) and contacts (F1-07) follow. */
export const entities = [Shop, Branch, OpeningHours, SpecialHours];
