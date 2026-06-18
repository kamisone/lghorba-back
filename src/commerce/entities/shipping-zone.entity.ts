import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('shop_shipping_zones')
export class ShippingZone {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 200 })            name: string;
  @Column({ type: 'text', array: true, default: '{}' }) countryCodes: string[];
  @Column({ type: 'boolean', default: true })           isActive: boolean;

  @Column({ type: 'int', default: 0 })                          surchargeCents: number;
  @Column({ type: 'int', nullable: true })                       freeShippingThresholdCents: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true })      estimatedDeliveryDays: string | null;
}
