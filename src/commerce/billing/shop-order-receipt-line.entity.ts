import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShopOrderReceipt } from './shop-order-receipt.entity';

@Entity('shop_order_receipt_lines')
export class ShopOrderReceiptLine {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) receiptId: string;
  @ManyToOne(() => ShopOrderReceipt, r => r.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiptId' })
  receipt: Relation<ShopOrderReceipt>;

  @Column({ type: 'varchar', length: 500 })              description: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) sku: string | null;
  @Column({ type: 'int' })                               quantity: number;
  @Column({ type: 'int' })                               unitPriceCents: number;
  @Column({ type: 'int' })                               totalCents: number;
  @Column({ type: 'int', default: 0 })                   sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
