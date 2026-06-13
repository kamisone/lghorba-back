import * as crypto from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { AudienceDefinition, CampaignStatus, NewsletterCampaign } from './newsletter-campaign.entity';
import { NewsletterCampaignRecipient, RecipientStatus } from './newsletter-campaign-recipient.entity';
import { NewsletterMailerService } from './newsletter-mailer.service';
import { NEWSLETTER_CAMPAIGN_QUEUE, NEWSLETTER_SEND_CAMPAIGN_JOB } from './newsletter.constants';
import { NewsletterSegmentationService } from './newsletter-segmentation.service';
import { NewsletterSubscriber } from './newsletter-subscriber.entity';

export interface CampaignListFilters {
  status?: CampaignStatus;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NewsletterCampaignsService {
  constructor(
    @InjectRepository(NewsletterCampaign)
    private readonly campaignRepo: Repository<NewsletterCampaign>,
    @InjectRepository(NewsletterCampaignRecipient)
    private readonly recipientRepo: Repository<NewsletterCampaignRecipient>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectQueue(NEWSLETTER_CAMPAIGN_QUEUE)
    private readonly queue: Queue,
    private readonly segmentation: NewsletterSegmentationService,
    private readonly mailer: NewsletterMailerService,
  ) {}

  async list(filters: CampaignListFilters): Promise<{ items: NewsletterCampaign[]; total: number }> {
    const { status, type, search, limit = 20, offset = 0 } = filters;
    const qb = this.campaignRepo.createQueryBuilder('camp');

    if (status) qb.andWhere('camp.status = :status', { status });
    if (type) qb.andWhere('camp.type = :type', { type });
    if (search) qb.andWhere('(camp.title ILIKE :search OR camp.subject ILIKE :search)', { search: `%${search}%` });

    qb.orderBy('camp.createdAt', 'DESC').skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOne(id: string): Promise<NewsletterCampaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  create(dto: CreateCampaignDto): Promise<NewsletterCampaign> {
    return this.campaignRepo.save(this.campaignRepo.create({
      title: dto.title,
      subject: dto.subject,
      previewText: dto.previewText ?? null,
      htmlContent: dto.htmlContent ?? '',
      audience: dto.audience ?? { segment: 'all' },
      type: dto.type,
      tags: dto.tags ?? [],
      status: CampaignStatus.DRAFT,
    }));
  }

  async update(id: string, dto: UpdateCampaignDto): Promise<NewsletterCampaign> {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only draft or scheduled campaigns can be edited');
    }

    if (dto.title !== undefined) campaign.title = dto.title;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.previewText !== undefined) campaign.previewText = dto.previewText;
    if (dto.htmlContent !== undefined) campaign.htmlContent = dto.htmlContent;
    if (dto.audience !== undefined) campaign.audience = dto.audience;
    if (dto.type !== undefined) campaign.type = dto.type;
    if (dto.tags !== undefined) campaign.tags = dto.tags;

    return this.campaignRepo.save(campaign);
  }

  async remove(id: string): Promise<void> {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be deleted');
    }
    await this.campaignRepo.delete(id);
  }

  async duplicate(id: string): Promise<NewsletterCampaign> {
    const campaign = await this.findOne(id);
    return this.campaignRepo.save(this.campaignRepo.create({
      title: `${campaign.title} (copy)`,
      subject: campaign.subject,
      previewText: campaign.previewText,
      htmlContent: campaign.htmlContent,
      audience: campaign.audience,
      type: campaign.type,
      tags: campaign.tags,
      status: CampaignStatus.DRAFT,
    }));
  }

  previewAudienceCount(audience: AudienceDefinition): Promise<number> {
    return this.segmentation.count(audience);
  }

  async schedule(id: string, scheduledAt: Date): Promise<NewsletterCampaign> {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be scheduled');
    }

    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    const job = await this.queue.add(NEWSLETTER_SEND_CAMPAIGN_JOB, { campaignId: id }, {
      delay,
      jobId: `campaign-${id}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });

    campaign.status = CampaignStatus.SCHEDULED;
    campaign.scheduledAt = scheduledAt;
    campaign.bullJobId = job.id ?? null;
    return this.campaignRepo.save(campaign);
  }

  async cancel(id: string): Promise<NewsletterCampaign> {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled campaigns can be cancelled');
    }

    if (campaign.bullJobId) {
      const job = await this.queue.getJob(campaign.bullJobId);
      if (job) await job.remove();
    }

    campaign.status = CampaignStatus.DRAFT;
    campaign.scheduledAt = null;
    campaign.bullJobId = null;
    return this.campaignRepo.save(campaign);
  }

  async sendNow(id: string): Promise<NewsletterCampaign> {
    const campaign = await this.findOne(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be sent');
    }

    const job = await this.queue.add(NEWSLETTER_SEND_CAMPAIGN_JOB, { campaignId: id }, {
      delay: 0,
      jobId: `campaign-${id}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });

    campaign.status = CampaignStatus.SCHEDULED;
    campaign.scheduledAt = new Date();
    campaign.bullJobId = job.id ?? null;
    return this.campaignRepo.save(campaign);
  }

  async sendTest(id: string, to: string): Promise<void> {
    const campaign = await this.findOne(id);
    const html = this.mailer.buildTrackedHtml(campaign.htmlContent, {
      trackingToken: 'test',
      unsubscribeToken: 'test',
    });
    await this.mailer.sendTestEmail(to, campaign.subject, html);
  }

  /**
   * Inserts one recipient row per subscriber in the campaign's audience.
   * ON CONFLICT DO NOTHING makes this safe to call again on job retries.
   */
  async materializeRecipients(campaignId: string): Promise<void> {
    const campaign = await this.findOne(campaignId);

    for await (const batch of this.segmentation.iterateSubscribers(campaign.audience)) {
      const values = batch.map((subscriber) => ({
        campaignId,
        subscriberId: subscriber.id,
        email: subscriber.email,
        status: RecipientStatus.PENDING,
        trackingToken: crypto.randomBytes(24).toString('hex'),
      }));

      await this.recipientRepo.createQueryBuilder()
        .insert()
        .into(NewsletterCampaignRecipient)
        .values(values)
        .orIgnore()
        .execute();
    }
  }
}
