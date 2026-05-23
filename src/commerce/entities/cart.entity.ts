import {
  Column, CreateDateColumn, Entity, Index, OneToMany,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

export type CartStatus = 'active' | 'completed' | 'abandoned' | 'merged';

@Entity('shop_carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' }) token: string;

  @Column({ type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' }) status: CartStatus;

  @Column({ type: 'timestamp with time zone', nullable: true }) expiresAt: Date | null;

  // String reference to avoid circular import
  @OneToMany('CartItem', 'cart', { eager: true, cascade: ['insert', 'update', 'remove'] })
  items: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
