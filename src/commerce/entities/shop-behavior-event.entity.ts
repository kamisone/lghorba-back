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
  | 'checkout_started'
  /**
   * Customer completed the shipping step and tried to continue to payment on an
   * order containing a test product, and was refused. This is the furthest a
   * test product can be taken, and the demand signal the feature exists to
   * collect — recorded server-side at the block, never accepted from the client.
   */
  | 'test_checkout_blocked';

// "purchase" is deliberately not an event type here — the purchase funnel step
// and customer timeline read directly from shop_orders/shop_order_items (the
// existing source of truth), to avoid a second, driftable copy of order data.
@Entity('shop_behavior_events')
@Index(['eventType', 'createdAt'])
@Index(['productId'])
@Index(['cartToken'])
@Index(['shopCustomerId'])
@Index(['countryCode'])
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

  // ISO-3166-1 alpha-2 country code, resolved from the request IP at write
  // time (see GeoIpService).
  /**
   * Salted SHA-256 of the visitor's IP — never the IP itself. Lets reports count
   * one visitor once per product no matter how often they refresh. NULL on rows
   * written before this existed, and on requests where no client IP was
   * resolvable; queries fall back to `cartToken` then the row id.
   */
  @Column({ type: 'varchar', length: 64, nullable: true }) visitorHash: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true }) countryCode:
    | string
    | null;

  /**
   * The visitor's raw address, kept (unlike earlier rows, where only
   * `visitorHash` was written) so an admin reviewing event details can add an
   * unwanted/bot source straight to the analytics IP exclusion list. NULL on
   * every row written before this column existed.
   */
  @Column({ type: 'varchar', length: 45, nullable: true }) clientIp: string | null;

  /**
   * 'mobile' | 'desktop', classified from the request's User-Agent at write
   * time (see device.util.ts). NULL when no User-Agent was available (e.g.
   * server-originated events with no request in scope) or on rows written
   * before this column existed.
   */
  @Column({ type: 'varchar', length: 10, nullable: true }) device:
    | 'mobile'
    | 'desktop'
    | null;

  /**
   * First-touch acquisition channel (e.g. 'Instagram', 'Facebook', 'TikTok',
   * 'Google', 'Other'), classified from a utm_source or the visitor's
   * landing Referer at write time (see platform.util.ts). NULL when neither
   * was available/captured, or on rows written before this column existed —
   * only event types with a natural client touchpoint at landing capture it.
   */
  @Column({ type: 'varchar', length: 30, nullable: true }) source: string | null;

  @CreateDateColumn() createdAt: Date;
}
