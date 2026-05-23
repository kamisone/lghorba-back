import {
  Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { VariantAttribute } from './variant-attribute.entity';

/**
 * A predefined, reusable option value for a variation dimension.
 *
 * Domain: Catalog / Variations
 *
 * Relationship:
 *  VariantAttribute (Variation)  →  VariationOptionValue (predefined values)
 *  ProductVariant (ProductItem)  →  VariantOption (product_configuration junction)
 *                                         ↑ references this entity via optionValueId
 *
 * Examples:
 *  VariantAttribute "Color":
 *    VariationOptionValue: { value: "Black",  displayValue: "Noir",  sortOrder: 0 }
 *    VariationOptionValue: { value: "White",  displayValue: "Blanc", sortOrder: 1 }
 *    VariationOptionValue: { value: "Red",    displayValue: "Rouge", sortOrder: 2 }
 *
 *  VariantAttribute "Size":
 *    VariationOptionValue: { value: "S",   sortOrder: 0 }
 *    VariationOptionValue: { value: "M",   sortOrder: 1 }
 *    VariationOptionValue: { value: "L",   sortOrder: 2 }
 *    VariationOptionValue: { value: "XL",  sortOrder: 3 }
 *
 * Migration path from existing VariantOption.value (free text):
 *  1. Seed this table from distinct values across existing VariantOptions
 *  2. Backfill VariantOption.optionValueId from matching rows here
 *  3. Deprecate VariantOption.value once migration is complete
 *
 * The free-text VariantOption.value column is kept during transition for
 * backward compatibility (nullable optionValueId pattern).
 */
@Entity('shop_variation_option_values')
@Index(['attributeId', 'value'], { unique: true })
export class VariationOptionValue {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  @Index()
  attributeId: string;

  @ManyToOne(() => VariantAttribute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attributeId' })
  attribute: Relation<VariantAttribute>;

  /** Machine value — used in URLs, filters, SKU generation */
  @Column({ type: 'varchar', length: 200 }) value: string;

  /** Human-readable label (may differ from value for display) */
  @Column({ type: 'varchar', length: 200, nullable: true }) displayValue: string | null;

  /** For color swatches: hex color or GCS key */
  @Column({ type: 'varchar', length: 500, nullable: true }) swatchValue: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true }) swatchType: 'color' | 'image' | null;

  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @Column({ type: 'boolean', default: true }) isActive: boolean;
}
