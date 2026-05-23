import {
  Column, CreateDateColumn, Entity, Index, OneToMany,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_customers')
@Index(['email'], { unique: true })
export class ShopCustomer {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300 }) email: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) firstName: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) lastName: string | null;
  @Column({ type: 'varchar', length: 50,  nullable: true }) phone: string | null;

  // Link to platform user account (nullable — guest customers don't have one)
  @Column({ type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'boolean', default: true }) marketingOptIn: boolean;

  @Column({ type: 'int', default: 0 }) totalOrders: number;
  @Column({ type: 'int', default: 0 }) totalSpentCents: number;

  // String reference to avoid circular import
  @OneToMany('ShopCustomerAddress', 'customer', { cascade: ['insert', 'update', 'remove'] })
  addresses: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
