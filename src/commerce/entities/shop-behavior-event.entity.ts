import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type BehaviorEventType =
  | 'product_view'
  | 'search'
  | 'add_to_cart'
  | 'update_cart_item'
  | 'remove_from_cart'
  | 'checkout_started';

// "purchase" is deliberately not an event type here — the purchase funnel step
// and customer timeline read directly from shop_orders/shop_order_items (the
// existing source of truth), to avoid a second, driftable copy of order data.
@Entity('shop_behavior_events')
@Index(['eventType', 'createdAt'])
@Index(['productId'])
@Index(['cartToken'])
@Index(['shopCustomerId'])
export class ShopBehaviorEvent {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 30 }) eventType: BehaviorEventType;

  // Guest session identifier — same UUID as Cart.token (localStorage
  // "shop_cart_token"). Present on every event type where available.
  @Column({ type: 'varchar', length: 100, nullable: true }) cartToken:
    | string
    | null;

  // Set when known at write time; backfilled from Order.customerId (matched by
  // cartToken) once a cart converts to an order, so pre-checkout behavior gets
  // retroactively attributed to the resulting customer record.
  @Column({ type: 'uuid', nullable: true }) shopCustomerId: string | null;

  @Column({ type: 'uuid', nullable: true }) productId: string | null;
  @Column({ type: 'int', nullable: true }) quantity: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true }) searchQuery:
    | string
    | null;
  @Column({ type: 'int', nullable: true }) resultCount: number | null;

  @CreateDateColumn() createdAt: Date;
}
