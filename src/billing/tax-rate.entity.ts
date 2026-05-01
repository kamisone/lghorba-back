import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tax_rates')
export class TaxRate {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** ISO 3166-1 alpha-2. */
  @Column({ type: 'varchar', length: 2 }) countryCode: string;

  /** e.g. 'car_rental' */
  @Column({ type: 'varchar', default: 'car_rental' }) serviceType: string;

  /** Fractional rate, e.g. 0.2000 for 20%. */
  @Column({ type: 'decimal', precision: 6, scale: 4 }) rate: number;

  /** Human-readable, e.g. 'TVA 20%'. */
  @Column({ type: 'varchar' }) label: string;

  @Column({ type: 'date' }) validFrom: string;

  /** NULL means currently active. */
  @Column({ type: 'date', nullable: true }) validTo: string | null;

  @CreateDateColumn() createdAt: Date;
}
