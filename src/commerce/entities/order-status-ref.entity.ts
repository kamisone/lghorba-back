import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Reference table for order status codes.
 *
 * Domain: Orders
 *
 * Maps the user domain spec: order_status (id, status, ...etc)
 *
 * The Order entity uses a varchar status column for simplicity;
 * this table provides a controlled vocabulary for admin display,
 * i18n labels, and transition rules.
 */
@Entity('shop_order_status_refs')
export class OrderStatusRef {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  code: string;

  /** Human-readable label for admin UI */
  @Column({ type: 'varchar', length: 200 }) label: string;

  /** Optional description of when this status applies */
  @Column({ type: 'text', nullable: true }) description: string | null;

  /** Badge color for admin UI (hex or named CSS color) */
  @Column({ type: 'varchar', length: 50, nullable: true }) color: string | null;

  /** Controls display order in status filter dropdowns */
  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @Column({ type: 'boolean', default: true }) isActive: boolean;
}
