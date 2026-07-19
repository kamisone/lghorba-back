import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BehaviorEventType,
  ShopBehaviorEvent,
} from '../entities/shop-behavior-event.entity';

interface RecordInput {
  cartToken?: string | null;
  shopCustomerId?: string | null;
  productId?: string | null;
  quantity?: number | null;
  searchQuery?: string | null;
  resultCount?: number | null;
  countryCode?: string | null;
}

@Injectable()
export class BehaviorTrackingService {
  private readonly logger = new Logger(BehaviorTrackingService.name);

  constructor(
    @InjectRepository(ShopBehaviorEvent)
    private readonly repo: Repository<ShopBehaviorEvent>,
  ) {}

  /** Fire-and-forget: never throws, never blocks the calling commerce flow. */
  async record(eventType: BehaviorEventType, data: RecordInput): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          eventType,
          cartToken: data.cartToken ?? null,
          shopCustomerId: data.shopCustomerId ?? null,
          productId: data.productId ?? null,
          quantity: data.quantity ?? null,
          searchQuery: data.searchQuery ?? null,
          resultCount: data.resultCount ?? null,
          countryCode: data.countryCode ?? null,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to record behavior event "${eventType}": ${(err as Error).message}`,
      );
    }
  }

  /** Retroactively attributes a guest's pre-checkout events to the customer created at checkout. */
  async backfillCustomerId(
    cartToken: string,
    shopCustomerId: string,
  ): Promise<void> {
    try {
      await this.repo
        .createQueryBuilder()
        .update(ShopBehaviorEvent)
        .set({ shopCustomerId })
        .where('cartToken = :cartToken', { cartToken })
        .andWhere('shopCustomerId IS NULL')
        .execute();
    } catch (err) {
      this.logger.error(
        `Failed to backfill shopCustomerId for cartToken ${cartToken}: ${(err as Error).message}`,
      );
    }
  }
}
