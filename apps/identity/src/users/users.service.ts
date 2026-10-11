import { DataSource, EntityManager } from 'typeorm';
import { GetMeRequest, IdentityErrors, MeResponse, UpdateMeRequest } from '@am/contracts';
import { EMIRATE_CODES, EmirateCode } from '@am/geo';
import { isLocale } from '@am/i18n';
import { User } from '../entities';
import { identityError } from '../errors';
import { loadMemberships } from '../sessions/session.service';
import { toUserDto } from './user.mapper';

export const NAME_MAX_LENGTH = 120;

const isEmirateCode = (value: string): value is EmirateCode =>
  (EMIRATE_CODES as readonly string[]).includes(value);

/** The signed-in person's own profile. */
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  async getMe(input: GetMeRequest): Promise<MeResponse> {
    return this.me(this.dataSource.manager, input.userId);
  }

  /**
   * Changes only the fields that are present. Phone and email are not here: changing either
   * needs the new one verified first.
   */
  async updateMe(input: UpdateMeRequest): Promise<MeResponse> {
    const patch: Partial<
      Pick<User, 'name' | 'preferredLanguage' | 'homeEmirate' | 'marketingConsentAt'>
    > = {};

    if (input.name !== undefined) {
      const name = input.name?.trim() || null;
      if (name && name.length > NAME_MAX_LENGTH) throw this.invalid('name');
      patch.name = name;
    }
    if (input.preferredLanguage !== undefined) {
      if (!isLocale(input.preferredLanguage)) throw this.invalid('preferredLanguage');
      patch.preferredLanguage = input.preferredLanguage;
    }
    if (input.homeEmirate !== undefined) {
      if (input.homeEmirate !== null && !isEmirateCode(input.homeEmirate)) {
        throw this.invalid('homeEmirate');
      }
      patch.homeEmirate = input.homeEmirate;
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await this.requireActive(manager, input.userId);
      if (input.marketingConsent === true && !user.marketingConsentAt) {
        // Confirming consent again keeps the time it was first given.
        patch.marketingConsentAt = new Date();
      } else if (input.marketingConsent === false) {
        patch.marketingConsentAt = null;
      }
      if (Object.keys(patch).length) await manager.update(User, { id: user.id }, patch);
      return this.me(manager, user.id);
    });
  }

  private async me(manager: EntityManager, userId: string): Promise<MeResponse> {
    const user = await this.requireActive(manager, userId);
    return { user: toUserDto(user), shops: await loadMemberships(manager, user.id) };
  }

  private async requireActive(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.findOneBy(User, { id: userId });
    if (!user) throw identityError(IdentityErrors.userNotFound);
    if (user.status !== 'active') throw identityError(IdentityErrors.userSuspended);
    return user;
  }

  private invalid(field: string) {
    return identityError(IdentityErrors.validationFailed, {
      issues: [{ path: field, message: 'Invalid value' }],
    });
  }
}
