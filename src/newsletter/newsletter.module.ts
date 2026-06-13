import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AntiSpamModule } from '../common/anti-spam/anti-spam.module';
import { DlqModule } from '../dlq/dlq.module';
import { NewsletterCampaignRecipient } from './newsletter-campaign-recipient.entity';
import { NewsletterCampaign } from './newsletter-campaign.entity';
import { NewsletterCampaignProcessor } from './newsletter-campaign.processor';
import { NewsletterAdminController } from './newsletter-admin.controller';
import { NewsletterAnalyticsController } from './newsletter-analytics.controller';
import { NewsletterAnalyticsService } from './newsletter-analytics.service';
import { NewsletterCampaignsController } from './newsletter-campaigns.controller';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { NewsletterMailerService } from './newsletter-mailer.service';
import { NewsletterSegmentationService } from './newsletter-segmentation.service';
import { NewsletterSubscriber } from './newsletter-subscriber.entity';
import { NewsletterController } from './newsletter.controller';
import { NEWSLETTER_CAMPAIGN_QUEUE } from './newsletter.constants';
import { NewsletterService } from './newsletter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsletterSubscriber, NewsletterCampaign, NewsletterCampaignRecipient]),
    BullModule.registerQueue({ name: NEWSLETTER_CAMPAIGN_QUEUE }),
    DlqModule,
    AntiSpamModule,
  ],
  controllers: [
    NewsletterController,
    NewsletterAdminController,
    NewsletterCampaignsController,
    NewsletterAnalyticsController,
  ],
  providers: [
    NewsletterService,
    NewsletterSegmentationService,
    NewsletterMailerService,
    NewsletterCampaignsService,
    NewsletterAnalyticsService,
    NewsletterCampaignProcessor,
  ],
})
export class NewsletterModule {}
