import { UserDto } from '@am/contracts';
import { User } from '../entities';

/** What leaves the service for a user: no consent timestamps, status or internal fields. */
export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  phone: user.phone,
  email: user.email,
  name: user.name,
  preferredLanguage: user.preferredLanguage,
  roles: user.roles,
  phoneVerified: user.phoneVerifiedAt !== null,
  emailVerified: user.emailVerifiedAt !== null,
  createdAt: user.createdAt.toISOString(),
});
