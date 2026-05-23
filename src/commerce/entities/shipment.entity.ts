import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type ShipmentStatus = 'pending' | 'label_created' | 'in_transit' | 'delivered' | 'failed';

@Entity('shop_shipments')
@Index(['orderId'])
export class Shipment {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })                             orderId: string;
  @Column({ type: 'uuid', nullable: true })             methodId: string | null;
  @Column({ type: 'varchar', length: 30, default: 'pending' }) status: ShipmentStatus;

  @Column({ type: 'varchar', length: 200, nullable: true }) carrier: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) trackingNumber: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) trackingUrl: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true }) shippedAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) deliveredAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) estimatedDeliveryAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
