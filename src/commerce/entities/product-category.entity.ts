import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 300 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  seoTitle: string | null;

  @Column({ type: 'text', nullable: true })
  seoDescription: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  imageKey: string | null;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => ProductCategory, c => c.children, { nullable: true, onDelete: 'SET NULL' })
  parent: Relation<ProductCategory> | null;

  @OneToMany(() => ProductCategory, c => c.parent)
  children: Relation<ProductCategory>[];

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
