import { Address } from './address.entity';
import { AdminAudit } from './admin-audit.entity';
import { Country } from './country.entity';
import { Credential } from './credential.entity';
import { OtpChallenge } from './otp-challenge.entity';
import { Session } from './session.entity';
import { ShopMember } from './shop-member.entity';
import { User } from './user.entity';

export * from './address.entity';
export * from './admin-audit.entity';
export * from './country.entity';
export * from './credential.entity';
export * from './otp-challenge.entity';
export * from './session.entity';
export * from './shop-member.entity';
export * from './user.entity';

/** TypeORM entities owned by the identity service. See docs/PLAN.md "Data model". */
export const entities = [
  User,
  Credential,
  OtpChallenge,
  Session,
  ShopMember,
  Address,
  Country,
  AdminAudit,
];
