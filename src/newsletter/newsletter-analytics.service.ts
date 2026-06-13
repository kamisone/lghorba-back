import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CampaignStatus, NewsletterCampaign } from './newsletter-campaign.entity';
import { NewsletterCampaignRecipient } from './newsletter-campaign-recipient.entity';
import { NewsletterSubscriber, NewsletterSubscriberStatus } from './newsletter-subscriber.entity';

export interface NewsletterOverview {
  totalSubscribers: number;
  subscribedCount: number;
  unsubscribedCount: number;
  bouncedCount: number;
  sentEmails: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
  bounceRate: number;
}

export interface SubscriberGrowthPoint {
  date: string;
  newSubscribers: number;
  totalSubscribers: number;
}

export interface CampaignPerformanceRow {
  id: string;
  title: string;
  subject: string;
  sentAt: Date | null;
  recipients: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  openRate: number;
  clickRate: number;
}

@Injectable()
export class NewsletterAnalyticsService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterCampaign)
    private readonly campaignRepo: Repository<NewsletterCampaign>,
    @InjectRepository(NewsletterCampaignRecipient)
    private readonly recipientRepo: Repository<NewsletterCampaignRecipient>,
  ) {}

  async overview(): Promise<NewsletterOverview> {
    const statusCounts = await this.subscriberRepo.createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.status')
      .getRawMany<{ status: NewsletterSubscriberStatus; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of statusCounts) counts[row.status] = Number(row.count);

    const subscribedCount = counts[NewsletterSubscriberStatus.SUBSCRIBED] ?? 0;
    const unsubscribedCount = counts[NewsletterSubscriberStatus.UNSUBSCRIBED] ?? 0;
    const bouncedCount = counts[NewsletterSubscriberStatus.BOUNCED] ?? 0;
    const totalSubscribers = subscribedCount + unsubscribedCount + bouncedCount;

    const recipientStats = await this.recipientRepo.createQueryBuilder('r')
      .select('COUNT(*)', 'sent')
      .addSelect('COUNT(r.openedAt)', 'opened')
      .addSelect('COUNT(r.clickedAt)', 'clicked')
      .addSelect('COUNT(r.unsubscribedAt)', 'unsubscribed')
      .where('r.status = :status', { status: 'sent' })
      .getRawOne<{ sent: string; opened: string; clicked: string; unsubscribed: string }>();

    const sentEmails = Number(recipientStats?.sent ?? 0);
    const opened = Number(recipientStats?.opened ?? 0);
    const clicked = Number(recipientStats?.clicked ?? 0);
    const unsubscribedFromCampaigns = Number(recipientStats?.unsubscribed ?? 0);

    return {
      totalSubscribers,
      subscribedCount,
      unsubscribedCount,
      bouncedCount,
      sentEmails,
      openRate: sentEmails > 0 ? opened / sentEmails : 0,
      clickRate: sentEmails > 0 ? clicked / sentEmails : 0,
      unsubscribeRate: sentEmails > 0 ? unsubscribedFromCampaigns / sentEmails : 0,
      bounceRate: totalSubscribers > 0 ? bouncedCount / totalSubscribers : 0,
    };
  }

  async subscriberGrowth(days = 30): Promise<SubscriberGrowthPoint[]> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const totalBefore = await this.subscriberRepo.count({ where: { createdAt: LessThan(since) } });

    const rows = await this.subscriberRepo.createQueryBuilder('s')
      .select("DATE_TRUNC('day', s.createdAt)", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('s.createdAt >= :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: Date; count: string }>();

    const byDay = new Map<string, number>();
    for (const row of rows) {
      byDay.set(new Date(row.day).toISOString().slice(0, 10), Number(row.count));
    }

    const points: SubscriberGrowthPoint[] = [];
    let running = totalBefore;
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const newSubscribers = byDay.get(key) ?? 0;
      running += newSubscribers;
      points.push({ date: key, newSubscribers, totalSubscribers: running });
    }

    return points;
  }

  async campaignPerformance(limit = 20): Promise<CampaignPerformanceRow[]> {
    const rows = await this.campaignRepo.createQueryBuilder('camp')
      .leftJoin('newsletter_campaign_recipients', 'r', 'r."campaignId" = camp.id')
      .select(['camp.id', 'camp.title', 'camp.subject', 'camp.sentAt'])
      .addSelect('COUNT(r.id)', 'recipients')
      .addSelect('COUNT(r."openedAt")', 'opens')
      .addSelect('COUNT(r."clickedAt")', 'clicks')
      .addSelect('COUNT(r."unsubscribedAt")', 'unsubscribes')
      .where('camp.status = :status', { status: CampaignStatus.SENT })
      .groupBy('camp.id')
      .orderBy('camp.sentAt', 'DESC')
      .limit(limit)
      .getRawMany<{
        camp_id: string;
        camp_title: string;
        camp_subject: string;
        camp_sentAt: Date | null;
        recipients: string;
        opens: string;
        clicks: string;
        unsubscribes: string;
      }>();

    return rows.map((row) => {
      const recipients = Number(row.recipients);
      const opens = Number(row.opens);
      const clicks = Number(row.clicks);
      return {
        id: row.camp_id,
        title: row.camp_title,
        subject: row.camp_subject,
        sentAt: row.camp_sentAt,
        recipients,
        opens,
        clicks,
        unsubscribes: Number(row.unsubscribes),
        openRate: recipients > 0 ? opens / recipients : 0,
        clickRate: recipients > 0 ? clicks / recipients : 0,
      };
    });
  }
}
