import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { Product } from './product.entity';
import { ReviewMediaItem } from './review-media-item';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

@Entity('shop_product_reviews')
@Index(['productId', 'status'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) productId: string;

  @ManyToOne(() => Product, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

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
  @Column({ type: 'varchar', length: 500, nullable: true }) title:
    | string
    | null;
  @Column({ type: 'text', nullable: true }) body: string | null;

  /** Optional images/videos attached by the reviewer. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) media: ReviewMediaItem[];

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ReviewStatus;

  /** Always server-computed from a verified order lookup — never client-settable. */
  @Column({ type: 'boolean', default: false }) isVerifiedPurchase: boolean;
  @Column({ type: 'int', default: 0 }) helpfulVotes: number;

  @Column({ type: 'varchar', length: 500, nullable: true }) rejectionReason:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) moderatedAt: Date | null;
  /** Admin email who performed the last moderation action, for audit. */
  @Column({ type: 'varchar', length: 300, nullable: true }) moderatedBy:
    | string
    | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
