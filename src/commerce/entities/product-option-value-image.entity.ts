import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { VariationOptionValue } from './variation-option-value.entity';

/**
 * Per-product image for a global "image" swatch option value.
 *
 * VariationOptionValue (e.g. "Color → Red") is global and shared across
 * products. The image representing "Red" is product-specific (Product A's
 * red t-shirt photo is not Product B's red backpack photo), so it lives
 * here, scoped to (productId, optionValueId) rather than on the global
 * option value itself.
 */
@Entity('shop_product_option_value_images')
@Index(['productId', 'optionValueId'], { unique: true })
export class ProductOptionValueImage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'uuid' }) optionValueId: string;

  @ManyToOne(() => VariationOptionValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'optionValueId' })
  optionValue: Relation<VariationOptionValue>;

  /** GCS media key — this product's image for this option value */
  @Column({ type: 'varchar', length: 1000 }) mediaKey: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
