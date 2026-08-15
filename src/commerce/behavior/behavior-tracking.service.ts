import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
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
  visitorHash?: string | null;
  /**
   * Caller's address. Tested against the admin exclusion list and, if the
   * event isn't dropped, persisted as-is so an admin reviewing event details
   * can add an unwanted/bot source to that same list.
   */
  clientIp?: string | null;
  /** Tested against the admin bot-UA pattern list. Never persisted. */
  userAgent?: string | null;
  /** 'mobile' | 'desktop', classified from a User-Agent by the caller. */
  device?: 'mobile' | 'desktop' | null;
}

@Injectable()
export class BehaviorTrackingService {
  private readonly logger = new Logger(BehaviorTrackingService.name);

  constructor(
    @InjectRepository(ShopBehaviorEvent)
    private readonly repo: Repository<ShopBehaviorEvent>,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Fire-and-forget: never throws, never blocks the calling commerce flow. */
  async record(eventType: BehaviorEventType, data: RecordInput): Promise<void> {
    try {
      // Staff browsing their own shop would register as real demand and skew the
      // very numbers used to decide what to stock. Checked here rather than at
      // each call site so every event type is covered by one rule.
      if (this.platformSettings.isAnalyticsExcluded(data.clientIp)) {
        this.logger.debug(
          `Skipped "${eventType}" — client IP is in the analytics exclusion list`,
        );
        return;
      }

      // Same idea, for traffic that was never a person: known crawlers/bots
      // and scripted clients would otherwise register as product demand.
      //
      // Only checked when a caller actually supplies a User-Agent — that's
      // the public tracking endpoint (product_view/search), which always
      // passes the request's header (even as ''). Server-authoritative call
      // sites (cart/checkout flows) don't have a request UA to check and
      // simply omit this field; `undefined` here means "not applicable", not
      // "missing", so it must NOT be treated as bot-like or every
      // add-to-cart/checkout event would be silently dropped.
      if (data.userAgent !== undefined && this.platformSettings.isBotUserAgent(data.userAgent)) {
        this.logger.debug(`Skipped "${eventType}" — bot/crawler User-Agent`);
        return;
      }

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
          visitorHash: data.visitorHash ?? null,
          clientIp: data.clientIp ?? null,
          device: data.device ?? null,
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
