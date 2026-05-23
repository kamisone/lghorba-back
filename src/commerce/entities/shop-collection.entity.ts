import {
  Column, CreateDateColumn, Entity, OneToMany,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_collections')
export class ShopCollection {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200, unique: true }) slug: string;
  @Column({ type: 'varchar', length: 500 })               name: string;
  @Column({ type: 'text', nullable: true })               description: string | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) imageKey: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true }) seoTitle: string | null;
  @Column({ type: 'text', nullable: true })                  seoDescription: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) metaKeywords: string | null;

  // Hero text (translatable)
  @Column({ type: 'varchar', length: 255, nullable: true }) heroTitle: string | null;
  @Column({ type: 'text', nullable: true })                  heroSubtitle: string | null;

  // Editorial copy for SEO collection landing pages
  @Column({ type: 'text', nullable: true }) heroCopy: string | null;
  @Column({ type: 'text', nullable: true }) bodyHtml: string | null;

  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'boolean', default: false }) isFeatured: boolean;
  @Column({ type: 'int', default: 0 })        sortOrder: number;

  @Column({ type: 'timestamp with time zone', nullable: true }) publishedAt: Date | null;

  @OneToMany('ShopCollectionProduct', 'collection', { cascade: ['insert', 'update', 'remove'] })
  collectionProducts: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
