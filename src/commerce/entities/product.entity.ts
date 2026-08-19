import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductTag } from './product-tag.entity';
import { ShippingMethod } from './shipping-method.entity';
import { ShopVendor } from './shop-vendor.entity';
import { ProductMediaItem } from './product-media-item';
import { ProductInfoSection } from './product-info-section';
import { ProductTrustBadge } from './product-trust-badge';
import { ProductFaq } from './product-faq';
import { ProductDocument } from './product-document';
import { ProductStoryItem } from './product-story-item';
import { ProductSocialVideo } from './product-social-video';
import { ProductZoomedImage } from './product-zoomed-image';
import { ProductUpsellTier } from './product-upsell-tier';
import { ProductPrivateLink } from './product-private-link';

export type ProductStatus =
  | 'draft'
  | 'active'
  | 'archived'
  | 'out_of_stock'
  | 'hidden';

@Entity('shop_products')
@Index(['status'])
@Index(['featured'])
@Index(['isTestProduct'])
@Index(['freeShipping'])
export class Product {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300, unique: true }) slug: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) sku: string | null;
  @Column({ type: 'varchar', length: 500 }) title: string;

  @Column({ type: 'text', nullable: true }) shortDescription: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true }) featuredImageKey:
    | string
    | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) featuredImageAlt:
    | string
    | null;
  @Column({ type: 'text', array: true, default: '{}' })
  galleryImageKeys: string[];

  /** Generic ordered media gallery (images + videos). Source of truth for the storefront gallery. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) media: ProductMediaItem[];

  @Column({ type: 'varchar', length: 300, nullable: true }) brand:
    | string
    | null;
  @Column({ type: 'jsonb', nullable: true }) specifications: Record<
    string,
    string
  > | null;

  /** Ordered "Composition / Lavage / Sexe / ..." spec sections shown on the PDP. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  infoSections: ProductInfoSection[];

  /** Ordered icon+label trust signals shown near the PDP buy box. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  trustBadges: ProductTrustBadge[];

  /** Ordered FAQ entries shown near the bottom of the PDP and used for FAQPage JSON-LD. */
  @Column({ type: 'jsonb', default: () => "'[]'" }) faqs: ProductFaq[];

  /** Ordered "Zoomed Images" shown between Specifications and FAQ on the PDP. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  zoomedImages: ProductZoomedImage[];

  /** Ordered Story Gallery images (side + narrative locations) shown on the PDP. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  storyGallery: ProductStoryItem[];

  /** Ordered social/reels videos shown in a vertical carousel on the PDP. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  socialVideos: ProductSocialVideo[];

  /**
   * Optional heading shown above the Social Videos carousel. FR default text;
   * EN translation stored as a top-level `socialVideosTitle` row in the
   * translations table. The storefront falls back to a localized default when empty.
   */
  @Column({ type: 'varchar', length: 300, nullable: true }) socialVideosTitle:
    | string
    | null;

  /**
   * Optional heading shown above the Narrative Gallery (Location 2).
   * FR default text; EN translation stored as a top-level `storyNarrativeTitle`
   * row in the translations table. Hidden on the PDP when empty.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  storyNarrativeTitle: string | null;

  /** Downloadable PDF documents (notice, fiche technique, etc.) */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  documents: ProductDocument[];

  /**
   * Internal reference links (Alibaba/supplier listings, sourcing pages,
   * factory contacts, etc.) — admin-only, never returned by any public
   * endpoint. See ProductPrivateLink and the strip in ProductService.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  privateLinks: ProductPrivateLink[];

  @Column({ type: 'varchar', length: 500, nullable: true }) seoTitle:
    | string
    | null;
  @Column({ type: 'text', nullable: true }) seoDescription: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) canonicalUrl:
    | string
    | null;

  /**
   * Product-level base price in cents.
   * Effective variant price = basePriceCents + sum(selected option adjustments)
   * when the variant has no explicit priceCents override.
   * NULL on legacy products that use per-variant explicit prices exclusively.
   */
  @Column({ type: 'int', nullable: true }) basePriceCents: number | null;

  /**
   * Quantity-based upselling ("buy N, pay X each"). When false, the product
   * behaves exactly as it did before this existed — `upsellTiers` is ignored
   * entirely, not just hidden, everywhere price is resolved.
   */
  @Column({ type: 'boolean', default: false }) upsellingEnabled: boolean;

  /** Ordered quantity-price tiers. See resolveUnitPriceForQuantity for how these apply. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  upsellTiers: ProductUpsellTier[];

  @Column({ type: 'boolean', default: false }) featured: boolean;

  /**
   * Demand-validation product. Behaves normally through the shipping step, then
   * checkout is refused before any PaymentIntent is created — used to measure
   * real purchase intent before committing to inventory.
   */
  @Column({ type: 'boolean', default: false }) isTestProduct: boolean;

  /**
   * Ships free regardless of the order total. Any cart containing at least one
   * such product pays no shipping — shipping is priced per order, not per line,
   * so it cannot be applied to part of a basket.
   *
   * Independent of the zone/method thresholds and of `free_shipping` promotions;
   * whichever grants it first wins (see PricingEngineService).
   */
  @Column({ type: 'boolean', default: false }) freeShipping: boolean;

  /**
   * Optional paid alternatives offered next to free shipping, for customers who
   * want faster delivery. Only meaningful when `freeShipping` is true, and only
   * settable to methods flagged `availableForFreeShipping`.
   *
   * Several may be configured; which ones a given customer sees depends on the
   * shipping zone resolved from their address — methods outside that zone are
   * never quoted.
   */
  /**
   * Delivery window advertised for the free option, in days. The free option is
   * synthetic rather than one of the zone's methods, so without this it can only
   * borrow an estimate from whichever method happens to exist there. NULL falls
   * back to that borrowed estimate.
   */
  @Column({ type: 'int', nullable: true }) freeShippingDaysMin: number | null;
  @Column({ type: 'int', nullable: true }) freeShippingDaysMax: number | null;

  @ManyToMany(() => ShippingMethod)
  @JoinTable({
    name: 'shop_product_free_shipping_methods',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'shippingMethodId', referencedColumnName: 'id' },
  })
  freeShippingUpgradeMethods: Relation<ShippingMethod>[];
  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: ProductStatus;

  /**
   * Cached review aggregates — recomputed by ReviewsService.recomputeProductStats()
   * whenever a review's approved-state changes, so public reads never scan
   * shop_product_reviews. Counts/averages "approved" reviews only.
   */
  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  ratingAverage: number;
  @Column({ type: 'int', default: 0 }) reviewCount: number;
  @Column({ type: 'jsonb', default: () => `'{"1":0,"2":0,"3":0,"4":0,"5":0}'` })
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;

  @Column({ type: 'uuid', nullable: true }) vendorId: string | null;

  @ManyToOne(() => ShopVendor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendorId' })
  vendor: Relation<ShopVendor> | null;

  @Column({ type: 'uuid', nullable: true }) primaryCategoryId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryCategoryId' })
  primaryCategory: Relation<ProductCategory> | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  publishedAt: Date | null;

  @ManyToMany(() => ProductCategory)
  @JoinTable({
    name: 'shop_product_category_map',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: Relation<ProductCategory>[];

  @ManyToMany(() => ProductTag)
  @JoinTable({
    name: 'shop_product_tag_map',
    joinColumn: { name: 'productId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: Relation<ProductTag>[];

  // String reference to avoid circular import with ProductVariant
  @OneToMany('ProductVariant', 'product', { cascade: ['insert', 'update'] })
  variants: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @DeleteDateColumn() deletedAt: Date | null;
}
