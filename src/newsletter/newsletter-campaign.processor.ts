import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { CampaignStatus, NewsletterCampaign } from './newsletter-campaign.entity';
import { NewsletterCampaignRecipient, RecipientStatus } from './newsletter-campaign-recipient.entity';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { NewsletterMailerService } from './newsletter-mailer.service';
import {
  NEWSLETTER_BATCH_DELAY_MS,
  NEWSLETTER_BATCH_SIZE,
  NEWSLETTER_CAMPAIGN_QUEUE,
} from './newsletter.constants';
import { NewsletterSubscriber } from './newsletter-subscriber.entity';

export interface NewsletterCampaignJobData {
  campaignId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Processor(NEWSLETTER_CAMPAIGN_QUEUE)
export class NewsletterCampaignProcessor extends DlqAwareWorker {
  protected readonly queueName = NEWSLETTER_CAMPAIGN_QUEUE;
  private readonly logger = new Logger(NewsletterCampaignProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(NewsletterCampaign)
    private readonly campaignRepo: Repository<NewsletterCampaign>,
    @InjectRepository(NewsletterCampaignRecipient)
    private readonly recipientRepo: Repository<NewsletterCampaignRecipient>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    private readonly campaignsService: NewsletterCampaignsService,
    private readonly mailer: NewsletterMailerService,
  ) {
    super(dlqService);
  }

  async process(job: Job<NewsletterCampaignJobData>): Promise<void> {
    const { campaignId } = job.data;
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign || campaign.status === CampaignStatus.CANCELLED) {
      this.logger.log(`Campaign ${campaignId} missing or cancelled — skipping`);
      return;
    }

    if (campaign.status !== CampaignStatus.SENDING) {
      await this.campaignRepo.update(campaignId, { status: CampaignStatus.SENDING });
    }

    await this.campaignsService.materializeRecipients(campaignId);

    for (;;) {
      const pending = await this.recipientRepo.find({
        where: { campaignId, status: RecipientStatus.PENDING },
        take: NEWSLETTER_BATCH_SIZE,
      });

      if (pending.length === 0) break;

      for (const recipient of pending) {
        await this.sendToRecipient(campaign, recipient);
      }

      await sleep(NEWSLETTER_BATCH_DELAY_MS);
    }

    await this.campaignRepo.update(campaignId, { status: CampaignStatus.SENT, sentAt: new Date() });
    this.logger.log(`Campaign ${campaignId} sent`);
  }

  private async sendToRecipient(campaign: NewsletterCampaign, recipient: NewsletterCampaignRecipient): Promise<void> {
    try {
      const subscriber = recipient.subscriberId
        ? await this.subscriberRepo.findOne({ where: { id: recipient.subscriberId } })
        : null;
      const unsubscribeToken = subscriber?.unsubscribeToken ?? recipient.trackingToken;

      const html = this.mailer.buildTrackedHtml(campaign.htmlContent, {
        trackingToken: recipient.trackingToken,
        unsubscribeToken,
      });

      await this.mailer.sendCampaignEmail(recipient.email, campaign.subject, html);
      await this.recipientRepo.update(recipient.id, { status: RecipientStatus.SENT, sentAt: new Date() });
    } catch (err) {
      await this.recipientRepo.update(recipient.id, {
        status: RecipientStatus.FAILED,
        error: (err as Error)?.message ?? 'Unknown error',
      });
    }
  }
}
