import {
  Column, CreateDateColumn, DeleteDateColumn, Entity,
  Index, JoinColumn, JoinTable, ManyToMany, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductTag } from './product-tag.entity';
import { ShopVendor } from './shop-vendor.entity';
import { ProductMediaItem } from './product-media-item';
import { ProductInfoSection } from './product-info-section';
import { ProductTrustBadge } from './product-trust-badge';
import { ProductFaq } from './product-faq';

export type ProductStatus = 'draft' | 'active' | 'archived' | 'out_of_stock' | 'hidden';

@Entity('shop_products')
@Index(['status'])
@Index(['featured'])
export class Product {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300, unique: true }) slug: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) sku: string | null;
  @Column({ type: 'varchar', length: 500 }) title: string;

  @Column({ type: 'text', nullable: true }) shortDescription: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true }) featuredImageKey: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true })  featuredImageAlt: string | null;
  @Column({ type: 'text', array: true, default: '{}' })      galleryImageKeys: string[];

  /** Generic ordered media gallery (images + videos). Source of truth for the storefront gallery. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) media: ProductMediaItem[];

  @Column({ type: 'varchar', length: 300, nullable: true }) brand: string | null;
  @Column({ type: 'jsonb', nullable: true })                specifications: Record<string, string> | null;

  /** Ordered "Composition / Lavage / Sexe / ..." spec sections shown on the PDP. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) infoSections: ProductInfoSection[];

  /** Ordered icon+label trust signals shown near the PDP buy box. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) trustBadges: ProductTrustBadge[];

  /** Ordered FAQ entries shown near the bottom of the PDP and used for FAQPage JSON-LD. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) faqs: ProductFaq[];

  @Column({ type: 'varchar', length: 500, nullable: true }) seoTitle: string | null;
  @Column({ type: 'text', nullable: true })                 seoDescription: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) canonicalUrl: string | null;

  @Column({ type: 'boolean', default: false }) featured: boolean;
  @Column({ type: 'varchar', length: 50, default: 'draft' }) status: ProductStatus;

  @Column({ type: 'uuid', nullable: true }) vendorId: string | null;

  @ManyToOne(() => ShopVendor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendorId' })
  vendor: Relation<ShopVendor> | null;

  @Column({ type: 'uuid', nullable: true }) primaryCategoryId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryCategoryId' })
  primaryCategory: Relation<ProductCategory> | null;

  @Column({ type: 'timestamp with time zone', nullable: true }) publishedAt: Date | null;

  @ManyToMany(() => ProductCategory)
  @JoinTable({
    name: 'shop_product_category_map',
    joinColumn:        { name: 'productId',  referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: Relation<ProductCategory>[];

  @ManyToMany(() => ProductTag)
  @JoinTable({
    name: 'shop_product_tag_map',
    joinColumn:        { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId',     referencedColumnName: 'id' },
  })
  tags: Relation<ProductTag>[];

  // String reference to avoid circular import with ProductVariant
  @OneToMany('ProductVariant', 'product', { cascade: ['insert', 'update'] })
  variants: Relation<any>[];

  @CreateDateColumn()  createdAt: Date;
  @UpdateDateColumn()  updatedAt: Date;
  @DeleteDateColumn()  deletedAt: Date | null;
}
