import {
  Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Product } from './product.entity';
import { VariantAttribute } from './variant-attribute.entity';
import { VariationOptionValue } from './variation-option-value.entity';

/**
 * Declares which variation dimensions a specific product uses.
 *
 * This is the "allowed variations" scoping layer: a product can use a
 * subset of globally-defined VariantAttributes. Without this table
 * the PDP would need to show every global attribute for every product.
 *
 * Examples:
 *   Product "T-Shirt" → uses [Color, Size]
 *   Product "Laptop"  → uses [Storage, Color]
 *   Product "Book"    → uses no variation dimensions (single variant)
 *
 * Populated automatically when a variant is created with options.
 * Can also be managed explicitly by the admin.
 */
@Entity('shop_product_variant_attributes')
@Index(['productId', 'attributeId'], { unique: true })
export class ProductVariantAttribute {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'uuid' }) attributeId: string;

  @ManyToOne(() => VariantAttribute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attributeId' })
  attribute: Relation<VariantAttribute>;

  /** Display order of this dimension in the PDP variant selector */
  @Column({ type: 'int', default: 0 }) sortOrder: number;

  /** The option value pre-selected for this dimension on the storefront */
  @Column({ type: 'uuid', nullable: true }) defaultOptionValueId: string | null;

  @ManyToOne(() => VariationOptionValue, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultOptionValueId' })
  defaultOptionValue: Relation<VariationOptionValue> | null;
}
