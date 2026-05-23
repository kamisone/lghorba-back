import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('blog_product_references')
@Index(['postId'])
@Index(['postId', 'productId'], { unique: true })
export class BlogProductReference {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) postId: string;
  @Column({ type: 'uuid' }) productId: string;

  // Optional editorial teaser shown under the product card in the post
  @Column({ type: 'varchar', length: 300, nullable: true }) label: string | null;
  @Column({ type: 'int', default: 0 })                      sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
