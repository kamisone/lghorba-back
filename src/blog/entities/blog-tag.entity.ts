import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('blog_tags')
export class BlogTag {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 300 })
  name: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
