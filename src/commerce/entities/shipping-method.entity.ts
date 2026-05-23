import {
  Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShippingZone } from './shipping-zone.entity';

@Entity('shop_shipping_methods')
@Index(['zoneId'])
export class ShippingMethod {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) zoneId: string;
  @ManyToOne(() => ShippingZone, { onDelete: 'CASCADE' })
  zone: Relation<ShippingZone>;

  @Column({ type: 'varchar', length: 200 })           name: string;
  @Column({ type: 'text', nullable: true })           description: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) carrier: string | null;

  @Column({ type: 'int' }) priceCents: number;
  @Column({ type: 'int', nullable: true }) freeAboveCents: number | null;

  @Column({ type: 'int', default: 2 }) estimatedDaysMin: number;
  @Column({ type: 'int', default: 5 }) estimatedDaysMax: number;

  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'int', default: 0 })        sortOrder: number;
}
