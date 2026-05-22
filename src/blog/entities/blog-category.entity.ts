import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('blog_categories')
export class BlogCategory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 300 })
  name: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
