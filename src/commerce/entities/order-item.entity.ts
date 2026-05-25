import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Order } from './order.entity';
import { ShopVendor } from './shop-vendor.entity';

@Entity('shop_order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, 'items', { onDelete: 'CASCADE' })
  order: Relation<Order>;

  @Column({ type: 'uuid', nullable: true }) productId: string | null;
  @Column({ type: 'uuid', nullable: true }) variantId: string | null;
  @Column({ type: 'uuid', nullable: true }) vendorId: string | null;

  @ManyToOne(() => ShopVendor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendorId' })
  vendor: Relation<ShopVendor> | null;

  @Column({ type: 'varchar', length: 500 })                  titleSnapshot:   string;
  @Column({ type: 'varchar', length: 200, nullable: true })  skuSnapshot:     string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) imageKeySnapshot: string | null;

  /** Frozen option choices at order time: [{attributeName, value, displayValue}] */
  @Column({ type: 'jsonb', nullable: true }) optionsSnapshot: Array<{
    attributeId: string; attributeName: string;
    optionValueId: string | null; value: string; displayValue: string | null;
  }> | null;

  /** Frozen compare-at price for order receipt display */
  @Column({ type: 'int', nullable: true }) compareAtPriceCentsSnapshot: number | null;

  @Column({ type: 'int' }) quantity: number;
  @Column({ type: 'int' }) unitPriceCents: number;
  @Column({ type: 'int' }) totalCents: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 20 }) taxRatePct: number;

  @CreateDateColumn() createdAt: Date;
}
