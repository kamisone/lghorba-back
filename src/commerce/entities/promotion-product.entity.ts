import {
  Column, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShopPromotion } from './shop-promotion.entity';
import { Product } from './product.entity';

@Entity('shop_promotion_products')
@Index(['promotionId', 'productId'], { unique: true })
export class PromotionProduct {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  @Index()
  promotionId: string;

  @ManyToOne(() => ShopPromotion, 'productLinks', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promotionId' })
  promotion: Relation<ShopPromotion>;

  @Column({ type: 'uuid' })
  @Index()
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;
}
