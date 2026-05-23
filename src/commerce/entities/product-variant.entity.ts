import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { VariantOption } from './variant-option.entity';

@Entity('shop_product_variants')
@Index(['productId'])
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) productId: string;

  @ManyToOne(() => Product, 'variants', { onDelete: 'CASCADE' })
  product: Relation<Product>;

  @Column({ type: 'varchar', length: 200, unique: true }) sku: string;
  @Column({ type: 'varchar', length: 500 })               title: string;

  @Column({ type: 'int' })          priceCents: number;
  @Column({ type: 'int', nullable: true }) compareAtPriceCents: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true }) barcode: string | null;
  @Column({ type: 'int', nullable: true })                  weightGrams: number | null;
  @Column({ type: 'jsonb', nullable: true })                dimensions: { lengthCm: number; widthCm: number; heightCm: number } | null;

  @Column({ type: 'text', array: true, default: '{}' }) mediaKeys: string[];

  @Column({ type: 'boolean', default: false }) isDefault: boolean;
  @Column({ type: 'int', default: 0 })         sortOrder: number;

  // String reference to avoid circular import
  @OneToMany('VariantOption', 'variant', { cascade: ['insert', 'update', 'remove'] })
  options: Relation<VariantOption>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
