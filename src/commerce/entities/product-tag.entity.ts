import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shop_product_tags')
export class ProductTag {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 200, unique: true }) name: string;
  @Column({ type: 'varchar', length: 200, unique: true }) slug: string;
}
