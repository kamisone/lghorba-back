import {
  Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { VariationOptionValue } from './variation-option-value.entity';
import { ProductCategory } from './product-category.entity';

/**
 * A variation dimension (axis) — maps to the `variation` entity in the domain model.
 *
 * Domain: Catalog / Variations
 *
 * Examples: Color, Size, Material, Storage
 *
 * Each attribute owns a controlled vocabulary of VariationOptionValues.
 * ProductVariants are linked to specific values via VariantOption (product_configuration).
 */
@Entity('shop_variant_attributes')
export class VariantAttribute {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200, unique: true }) name: string;
  @Column({ type: 'varchar', length: 200, unique: true }) slug: string;

  /** Optional scope — if set, this variation only applies to this product category */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  categoryId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Relation<ProductCategory> | null;

  /** Frontend widget hint: 'swatch' | 'button' | 'dropdown' */
  @Column({ type: 'varchar', length: 20, default: 'button' })
  @Index()
  displayType: 'swatch' | 'button' | 'dropdown';

  /** Controls display order in PDP variant selector */
  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @Column({ type: 'boolean', default: true }) isActive: boolean;

  /** Predefined vocabulary for this dimension */
  @OneToMany(() => VariationOptionValue, v => v.attribute, { cascade: ['insert', 'update'] })
  optionValues: Relation<VariationOptionValue>[];
}
