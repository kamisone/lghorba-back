import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_customer_groups')
export class ShopCustomerGroup {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200 })    name: string;
  @Column({ type: 'text', nullable: true })     description: string | null;
  @Column({ type: 'jsonb', nullable: true })    criteria: Record<string, unknown> | null;
  @Column({ type: 'boolean', default: true })   isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
