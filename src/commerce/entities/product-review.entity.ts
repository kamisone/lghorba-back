import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('shop_product_reviews')
@Index(['productId', 'status'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })            productId: string;
  @Column({ type: 'uuid', nullable: true }) orderId: string | null;
  /** Specific order line this review is for — maps to ordered_product_id in the domain spec */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  orderItemId: string | null;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: Relation<OrderItem> | null;

  @Column({ type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'varchar', length: 300 }) authorName: string;
  @Column({ type: 'varchar', length: 300 }) authorEmail: string;

  @Column({ type: 'int' }) rating: number; // 1–5, enforced in migration CHECK
  @Column({ type: 'varchar', length: 500, nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) body: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'published' | 'rejected';

  @Column({ type: 'boolean', default: false }) isVerifiedPurchase: boolean;
  @Column({ type: 'int', default: 0 })         helpfulVotes: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
