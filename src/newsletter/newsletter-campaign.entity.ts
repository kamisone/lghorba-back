import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
}

export enum CampaignType {
  NEWSLETTER = 'newsletter',
  PROMOTION = 'promotion',
  NEW_ARRIVALS = 'new_arrivals',
  FLASH_SALE = 'flash_sale',
  CATEGORY = 'category',
  ABANDONED_CART = 'abandoned_cart',
  PRODUCT_LAUNCH = 'product_launch',
  ANNOUNCEMENT = 'announcement',
}

export type AudienceSegment =
  | 'all'
  | 'fr'
  | 'en'
  | 'customers'
  | 'non_customers'
  | 'purchasers'
  | 'newsletter_only'
  | 'tags';

export interface AudienceDefinition {
  segment: AudienceSegment;
  tags?: string[];
}

@Entity('newsletter_campaigns')
export class NewsletterCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 250 })
  subject: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  previewText: string | null;

  @Column({ type: 'text', default: '' })
  htmlContent: string;

  @Column({ type: 'jsonb', default: { segment: 'all' } })
  audience: AudienceDefinition;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    enumName: 'newsletter_campaign_status',
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus;

  @Column({
    type: 'enum',
    enum: CampaignType,
    enumName: 'newsletter_campaign_type',
    default: CampaignType.NEWSLETTER,
  })
  type: CampaignType;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bullJobId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
