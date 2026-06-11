import {
  Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_inventory_items')
@Index(['variantId'], { unique: true })
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) variantId: string;
  @Column({ type: 'uuid' }) productId: string;

  @Column({ type: 'int', default: 0 }) available: number;

  /** Held for unpaid orders (awaiting_payment) — released back to `available` after the 15-min checkout reservation expires or the order is cancelled. */
  @Column({ type: 'int', default: 0 }) reserved: number;

  /** Held for paid orders not yet shipped — moved here from `reserved` once payment is confirmed; deducted permanently on shipment. */
  @Column({ type: 'int', default: 0 }) committed: number;

  @Column({ type: 'int', default: 0 }) incoming: number;
  @Column({ type: 'int', default: 5 }) lowStockThreshold: number;

  @UpdateDateColumn() updatedAt: Date;
}
