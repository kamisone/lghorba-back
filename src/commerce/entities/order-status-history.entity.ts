import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('shop_order_status_history')
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, 'statusHistory', { onDelete: 'CASCADE' })
  order: Relation<Order>;

  @Column({ type: 'varchar', length: 30, nullable: true }) fromStatus: string | null;
  @Column({ type: 'varchar', length: 30 })                 toStatus: string;
  @Column({ type: 'text', nullable: true })                note: string | null;
  @Column({ type: 'uuid', nullable: true })                adminId: string | null;

  @CreateDateColumn() createdAt: Date;
}
