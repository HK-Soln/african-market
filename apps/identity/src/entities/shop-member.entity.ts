import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ShopRole } from '@am/auth';
import { AppBaseEntity } from '@am/database';
import { User } from './user.entity';

/**
 * A user's role in a shop. `shop_id` and `branch_ids` point at rows owned by the shops service,
 * so they are plain ids without foreign keys. Empty `branch_ids` means every branch.
 */
@Entity({ name: 'shop_member' })
@Index('shop_member_user_shop_uq', ['userId', 'shopId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('shop_member_shop_idx', ['shopId'])
@Check('shop_member_role_chk', `role IN ('owner', 'manager', 'staff')`)
export class ShopMember extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'text' })
  role!: ShopRole;

  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  branchIds!: string[];
}
