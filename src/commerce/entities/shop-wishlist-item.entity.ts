import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('shop_wishlist_items')
@Index(['sessionToken', 'productId'], { unique: true })
@Index(['userId', 'productId'], { unique: true, where: '"userId" IS NOT NULL' })
export class ShopWishlistItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  // Guest wishlist: identified by session token (localStorage UUID)
  @Column({ type: 'varchar', length: 100, nullable: true }) sessionToken: string | null;
  // Authenticated wishlist: linked to user
  @Column({ type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'uuid' }) productId: string;
  @Column({ type: 'uuid', nullable: true }) variantId: string | null;

  @CreateDateColumn() addedAt: Date;
}
