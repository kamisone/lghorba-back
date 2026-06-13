import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AudienceDefinition } from './newsletter-campaign.entity';
import { NewsletterSubscriber, NewsletterSubscriberStatus } from './newsletter-subscriber.entity';

const ITERATE_BATCH_SIZE = 200;

@Injectable()
export class NewsletterSegmentationService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  private buildQuery(audience: AudienceDefinition): SelectQueryBuilder<NewsletterSubscriber> {
    const qb = this.subscriberRepo.createQueryBuilder('s')
      .where('s.status = :status', { status: NewsletterSubscriberStatus.SUBSCRIBED });

    switch (audience.segment) {
      case 'fr':
      case 'en':
        qb.andWhere('s.locale = :locale', { locale: audience.segment });
        break;
      case 'customers':
        qb.innerJoin('shop_customers', 'c', 'LOWER(c.email) = LOWER(s.email)');
        break;
      case 'non_customers':
        qb.leftJoin('shop_customers', 'c', 'LOWER(c.email) = LOWER(s.email)')
          .andWhere('c.id IS NULL');
        break;
      case 'purchasers':
        qb.innerJoin('shop_customers', 'c', 'LOWER(c.email) = LOWER(s.email)')
          .andWhere('c."totalOrders" > 0');
        break;
      case 'newsletter_only':
        qb.leftJoin('shop_customers', 'c', 'LOWER(c.email) = LOWER(s.email) AND c."totalOrders" > 0')
          .andWhere('c.id IS NULL');
        break;
      case 'tags':
        qb.andWhere('s.tags && :tags::text[]', { tags: audience.tags ?? [] });
        break;
      case 'all':
      default:
        break;
    }

    return qb;
  }

  count(audience: AudienceDefinition): Promise<number> {
    return this.buildQuery(audience).getCount();
  }

  async *iterateSubscribers(
    audience: AudienceDefinition,
    batchSize = ITERATE_BATCH_SIZE,
  ): AsyncGenerator<NewsletterSubscriber[]> {
    let offset = 0;
    for (;;) {
      const batch = await this.buildQuery(audience)
        .orderBy('s.id')
        .skip(offset)
        .take(batchSize)
        .getMany();

      if (batch.length === 0) return;
      yield batch;
      offset += batch.length;
    }
  }
}
