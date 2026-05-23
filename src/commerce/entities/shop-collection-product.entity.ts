import {
  Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShopCollection } from './shop-collection.entity';

@Entity('shop_collection_products')
@Index(['collectionId', 'productId'], { unique: true })
export class ShopCollectionProduct {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) collectionId: string;
  @Column({ type: 'uuid' }) productId: string;

  @ManyToOne(() => ShopCollection, 'collectionProducts', { onDelete: 'CASCADE' })
  collection: Relation<ShopCollection>;

  @Column({ type: 'int', default: 0 }) sortOrder: number;
}
