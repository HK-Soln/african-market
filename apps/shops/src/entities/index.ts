import { Branch } from './branch.entity';
import { OpeningHours } from './opening-hours.entity';
import { Shop } from './shop.entity';
import { SpecialHours } from './special-hours.entity';
import { VerificationAudit } from './verification-audit.entity';
import { VerificationRequest } from './verification-request.entity';

export * from './branch.entity';
export * from './opening-hours.entity';
export * from './shop.entity';
export * from './special-hours.entity';
export * from './verification-audit.entity';
export * from './verification-request.entity';

/** TypeORM entities owned by the shops service. Contact events (F1-07) follow. */
export const entities = [
  Shop,
  Branch,
  OpeningHours,
  SpecialHours,
  VerificationRequest,
  VerificationAudit,
];
