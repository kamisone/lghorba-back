import {
  Column, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShopPromotion } from './shop-promotion.entity';
import { ProductCategory } from './product-category.entity';

@Entity('shop_promotion_categories')
@Index(['promotionId', 'categoryId'], { unique: true })
export class PromotionCategory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  @Index()
  promotionId: string;

  @ManyToOne(() => ShopPromotion, 'categoryLinks', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotionId' })
  promotion: Relation<ShopPromotion>;

  @Column({ type: 'uuid' })
  @Index()
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Relation<ProductCategory>;
}
