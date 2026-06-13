import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';

export enum RecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('newsletter_campaign_recipients')
@Index(['campaignId', 'email'], { unique: true })
export class NewsletterCampaignRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @Column({ type: 'uuid', nullable: true })
  subscriberId: string | null;

  @Column({ type: 'varchar', length: 300 })
  email: string;

  @Column({
    type: 'enum',
    enum: RecipientStatus,
    enumName: 'newsletter_recipient_status',
    default: RecipientStatus.PENDING,
  })
  status: RecipientStatus;

  @Column({ type: 'varchar', length: 64, unique: true })
  trackingToken: string;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  clickedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
