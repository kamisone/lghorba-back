import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';

@Entity('shop_cart_items')
@Index(['cartId', 'variantId'], { unique: true })
export class CartItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) cartId: string;
  @Column({ type: 'uuid' }) productId: string;
  @Column({ type: 'uuid' }) variantId: string;

  @ManyToOne(() => Cart, 'items', { onDelete: 'CASCADE' })
  cart: Relation<Cart>;

  @Column({ type: 'int' }) quantity: number;
  @Column({ type: 'int' }) unitPriceCents: number;

  @Column({ type: 'varchar', length: 500 })        titleSnapshot: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) skuSnapshot: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) imageKeySnapshot: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
