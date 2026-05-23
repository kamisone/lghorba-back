import {
  Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { VariantAttribute } from './variant-attribute.entity';
import { VariationOptionValue } from './variation-option-value.entity';

/**
 * Maps a ProductVariant to a specific variation option value.
 * Represents the `product_configuration` entity in the domain model.
 *
 * Domain: Catalog / Variations
 *
 * Backward-compatible dual-mode:
 *  - Existing rows: free-text `value` only (optionValueId = null)
 *  - New rows: optionValueId FK set, `value` mirrors optionValue.value
 *
 * Once all rows are migrated, optionValueId should be made NOT NULL.
 */
@Entity('shop_variant_options')
@Index(['variantId', 'attributeId'])
export class VariantOption {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) variantId: string;
  @Column({ type: 'uuid' }) attributeId: string;

  @ManyToOne('ProductVariant', 'options', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant: Relation<any>;

  @ManyToOne(() => VariantAttribute, { onDelete: 'CASCADE' })
  attribute: Relation<VariantAttribute>;

  /** FK to the structured vocabulary — null for legacy free-text rows */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  optionValueId: string | null;

  @ManyToOne(() => VariationOptionValue, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'optionValueId' })
  optionValue: Relation<VariationOptionValue> | null;

  /** Free-text value — kept for backward compat; mirrors optionValue.value when optionValueId is set */
  @Column({ type: 'varchar', length: 500 }) value: string;
}
