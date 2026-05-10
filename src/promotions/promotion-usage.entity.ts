import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('promotion_usages')
export class PromotionUsage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  promotionId: string;

  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerEmail: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  originalAmount: number;

  @CreateDateColumn() createdAt: Date;
}
