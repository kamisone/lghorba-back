import {
  Column, Entity, Index, PrimaryColumn,
} from 'typeorm';

/**
 * ISO 3166-1 alpha-2 country reference table.
 * PK is the 2-letter ISO code (FR, GB, MA…) — no surrogate key needed.
 * Seeded once; shipping zones, addresses, and tax rules all reference this.
 */
@Entity('shop_countries')
export class Country {
  /** ISO 3166-1 alpha-2 — FR, GB, MA, US … */
  @PrimaryColumn({ type: 'char', length: 2 }) isoCode: string;

  @Column({ type: 'varchar', length: 200 }) name: string;

  /** +33, +212 … (without leading zeros) */
  @Column({ type: 'varchar', length: 10, nullable: true }) phonePrefix: string | null;

  /** ISO 4217 currency code: EUR, GBP, MAD … */
  @Column({ type: 'char', length: 3, nullable: true }) currencyCode: string | null;

  /** ISO 3166-1 alpha-3 for analytics/exports */
  @Column({ type: 'char', length: 3, nullable: true }) isoCode3: string | null;

  /** Continent code: EU, AF, AS, NA, SA, OC, AN */
  @Column({ type: 'varchar', length: 2, nullable: true }) continentCode: string | null;

  /** Controls whether country is shown in checkout address forms */
  @Column({ type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  /** Whether the platform ships to this country */
  @Column({ type: 'boolean', default: false }) isShippingEnabled: boolean;

  /** EU VAT zone member — drives tax rule selection */
  @Column({ type: 'boolean', default: false }) isEuVat: boolean;
}
