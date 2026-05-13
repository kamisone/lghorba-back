import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
