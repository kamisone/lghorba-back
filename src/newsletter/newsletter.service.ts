import * as crypto from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';
import { BulkSubscriberActionDto, CreateSubscriberAdminDto, UpdateSubscriberDto } from './dto/subscriber.dto';
import { NewsletterCampaignRecipient } from './newsletter-campaign-recipient.entity';
import { NewsletterSubscriber, NewsletterSubscriberStatus } from './newsletter-subscriber.entity';

export interface AdminListFilters {
  search?: string;
  status?: NewsletterSubscriberStatus;
  locale?: string;
  source?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly repo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterCampaignRecipient)
    private readonly recipientRepo: Repository<NewsletterCampaignRecipient>,
  ) {}

  async subscribe(dto: CreateNewsletterSubscriberDto): Promise<{ id: string; createdAt: Date }> {
    try {
      const saved = await this.repo.save(
        this.repo.create({
          email: dto.email,
          locale: dto.locale ?? null,
          source: 'footer-form',
          status: NewsletterSubscriberStatus.SUBSCRIBED,
          unsubscribeToken: crypto.randomBytes(24).toString('hex'),
          lastActivityAt: new Date(),
        }),
      );
      return { id: saved.id, createdAt: saved.createdAt };
    } catch (err) {
      const driverError = (err as unknown as { driverError?: { code?: string } }).driverError;
      if (err instanceof QueryFailedError && driverError?.code === '23505') {
        // Already subscribed — treat as success without exposing enumeration info.
        const existing = await this.repo.findOne({ where: { email: dto.email } });
        return { id: existing?.id ?? 'ok', createdAt: existing?.createdAt ?? new Date() };
      }
      this.logger.error('Failed to save newsletter subscriber', err as Error);
      throw err;
    }
  }

  async adminList(filters: AdminListFilters): Promise<{ items: NewsletterSubscriber[]; total: number }> {
    const { search, status, locale, source, tag, limit = 20, offset = 0 } = filters;
    const qb = this.repo.createQueryBuilder('s');

    if (search) qb.andWhere('s.email ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('s.status = :status', { status });
    if (locale) qb.andWhere('s.locale = :locale', { locale });
    if (source) qb.andWhere('s.source = :source', { source });
    if (tag) qb.andWhere('s.tags && :tag::text[]', { tag: [tag] });

    qb.orderBy('s.createdAt', 'DESC').skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async createManual(dto: CreateSubscriberAdminDto): Promise<NewsletterSubscriber> {
    try {
      return await this.repo.save(
        this.repo.create({
          email: dto.email,
          locale: dto.locale ?? null,
          status: dto.status ?? NewsletterSubscriberStatus.SUBSCRIBED,
          source: dto.source ?? 'admin-manual',
          tags: dto.tags ?? [],
          unsubscribeToken: crypto.randomBytes(24).toString('hex'),
          lastActivityAt: new Date(),
        }),
      );
    } catch (err) {
      const driverError = (err as unknown as { driverError?: { code?: string } }).driverError;
      if (err instanceof QueryFailedError && driverError?.code === '23505') {
        throw new Error('A subscriber with this email already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateSubscriberDto): Promise<NewsletterSubscriber> {
    const subscriber = await this.repo.findOne({ where: { id } });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    if (dto.email !== undefined) subscriber.email = dto.email;
    if (dto.locale !== undefined) subscriber.locale = dto.locale;
    if (dto.source !== undefined) subscriber.source = dto.source;
    if (dto.tags !== undefined) subscriber.tags = dto.tags;
    if (dto.status !== undefined) {
      subscriber.status = dto.status;
      subscriber.unsubscribedAt = dto.status === NewsletterSubscriberStatus.UNSUBSCRIBED ? new Date() : null;
    }

    return this.repo.save(subscriber);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async bulkAction(dto: BulkSubscriberActionDto): Promise<{ affected: number }> {
    const { ids, action, tag } = dto;

    switch (action) {
      case 'unsubscribe': {
        const result = await this.repo.update(
          { id: In(ids) },
          { status: NewsletterSubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
        );
        return { affected: result.affected ?? 0 };
      }
      case 'resubscribe': {
        const result = await this.repo.update(
          { id: In(ids) },
          { status: NewsletterSubscriberStatus.SUBSCRIBED, unsubscribedAt: null },
        );
        return { affected: result.affected ?? 0 };
      }
      case 'delete': {
        const result = await this.repo.delete({ id: In(ids) });
        return { affected: result.affected ?? 0 };
      }
      case 'add_tag': {
        const result = await this.repo.createQueryBuilder()
          .update(NewsletterSubscriber)
          .set({ tags: () => 'array_append(tags, :tag)' })
          .where('id IN (:...ids)', { ids })
          .andWhere('NOT (tags @> ARRAY[:tag]::text[])')
          .setParameter('tag', tag)
          .execute();
        return { affected: result.affected ?? 0 };
      }
      case 'remove_tag': {
        const result = await this.repo.createQueryBuilder()
          .update(NewsletterSubscriber)
          .set({ tags: () => 'array_remove(tags, :tag)' })
          .where('id IN (:...ids)', { ids })
          .setParameter('tag', tag)
          .execute();
        return { affected: result.affected ?? 0 };
      }
      default:
        return { affected: 0 };
    }
  }

  async exportCsv(filters: Omit<AdminListFilters, 'limit' | 'offset'>): Promise<string> {
    const { search, status, locale, source, tag } = filters;
    const qb = this.repo.createQueryBuilder('s');

    if (search) qb.andWhere('s.email ILIKE :search', { search: `%${search}%` });
    if (status) qb.andWhere('s.status = :status', { status });
    if (locale) qb.andWhere('s.locale = :locale', { locale });
    if (source) qb.andWhere('s.source = :source', { source });
    if (tag) qb.andWhere('s.tags && :tag::text[]', { tag: [tag] });

    qb.orderBy('s.createdAt', 'DESC');
    const rows = await qb.getMany();

    const header = ['email', 'status', 'source', 'locale', 'tags', 'subscribedAt', 'lastActivityAt', 'unsubscribedAt'];
    const lines = [header.join(',')];

    for (const row of rows) {
      lines.push([
        row.email,
        row.status,
        row.source ?? '',
        row.locale ?? '',
        row.tags.join(';'),
        row.createdAt?.toISOString() ?? '',
        row.lastActivityAt?.toISOString() ?? '',
        row.unsubscribedAt?.toISOString() ?? '',
      ].map((field) => this.csvField(field)).join(','));
    }

    return lines.join('\n');
  }

  async unsubscribeByToken(token: string): Promise<NewsletterSubscriber | null> {
    const subscriber = await this.repo.findOne({ where: { unsubscribeToken: token } });
    if (!subscriber) return null;

    subscriber.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
    subscriber.unsubscribedAt = new Date();
    const saved = await this.repo.save(subscriber);

    await this.recipientRepo.createQueryBuilder()
      .update(NewsletterCampaignRecipient)
      .set({ unsubscribedAt: () => 'now()' })
      .where('LOWER(email) = LOWER(:email)', { email: saved.email })
      .andWhere('unsubscribedAt IS NULL')
      .execute();

    return saved;
  }

  /** Marks a recipient's tracking pixel as opened and bumps the subscriber's activity timestamp. */
  async recordOpen(token: string): Promise<void> {
    const recipient = await this.recipientRepo.findOne({ where: { trackingToken: token } });
    if (!recipient) return;

    if (!recipient.openedAt) {
      await this.recipientRepo.update(recipient.id, { openedAt: new Date() });
    }
    if (recipient.subscriberId) {
      await this.repo.update(recipient.subscriberId, { lastActivityAt: new Date() });
    }
  }

  /** Marks a recipient's tracked link as clicked and bumps the subscriber's activity timestamp. */
  async recordClick(token: string): Promise<void> {
    const recipient = await this.recipientRepo.findOne({ where: { trackingToken: token } });
    if (!recipient) return;

    if (!recipient.clickedAt) {
      await this.recipientRepo.update(recipient.id, { clickedAt: new Date() });
    }
    if (recipient.subscriberId) {
      await this.repo.update(recipient.subscriberId, { lastActivityAt: new Date() });
    }
  }

  private csvField(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
