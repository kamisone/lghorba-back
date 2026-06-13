import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum NewsletterSubscriberStatus {
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
}

@Entity('newsletter_subscribers')
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  locale: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: NewsletterSubscriberStatus,
    enumName: 'newsletter_subscriber_status',
    default: NewsletterSubscriberStatus.SUBSCRIBED,
  })
  status: NewsletterSubscriberStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ type: 'varchar', length: 64, unique: true, nullable: true })
  unsubscribeToken: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
