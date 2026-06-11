import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MovementType =
  | 'order_placed' | 'order_cancelled' | 'order_paid' | 'order_refunded' | 'order_shipped'
  | 'manual_adjustment' | 'refund' | 'restock';

@Entity('shop_inventory_movements')
@Index(['variantId'])
@Index(['orderId'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })            variantId: string;
  @Column({ type: 'uuid', nullable: true }) orderId: string | null;
  @Column({ type: 'uuid', nullable: true }) adminId: string | null;

  @Column({ type: 'varchar', length: 50 }) type: MovementType;
  @Column({ type: 'int' }) delta: number;

  @Column({ type: 'int' }) availableAfter: number;
  @Column({ type: 'int' }) reservedAfter: number;
  @Column({ type: 'int', default: 0 }) committedAfter: number;

  @Column({ type: 'text', nullable: true }) note: string | null;

  @CreateDateColumn() createdAt: Date;
}
