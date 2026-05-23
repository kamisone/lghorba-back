import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe = require('stripe');
import { STRIPE_CLIENT } from '../../payments/stripe.provider';
import { ShopVendor } from '../entities/shop-vendor.entity';
import { ShopVendorPayout } from '../entities/shop-vendor-payout.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { VendorService } from './vendor.service';
import { COMMERCE_EVENTS, PaymentSucceededEvent } from '../events/commerce-events';

@Injectable()
export class VendorConnectService {
  private readonly logger = new Logger(VendorConnectService.name);

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe.Stripe,
    @InjectRepository(ShopVendor)      private readonly vendorRepo:  Repository<ShopVendor>,
    @InjectRepository(ShopVendorPayout) private readonly payoutRepo: Repository<ShopVendorPayout>,
    @InjectRepository(Order)           private readonly orderRepo:   Repository<Order>,
    @InjectRepository(OrderItem)       private readonly itemRepo:    Repository<OrderItem>,
    private readonly vendorService: VendorService,
  ) {}

  // ── Domain event listener ──────────────────────────────────────────────────

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    await this.transferForOrder(event.orderId).catch(err =>
      this.logger.warn(`Vendor payout failed for order ${event.orderId}: ${(err as Error).message}`),
    );
  }

  // ── Create Stripe Express account ─────────────────────────────────────────

  async createAccount(vendorId: string): Promise<string> {
    const vendor = await this.vendorService.findById(vendorId);
    if (vendor.stripeConnectId) return vendor.stripeConnectId;

    const account = await this.stripe.accounts.create({
      type:  'express',
      email: vendor.email,
      metadata: { vendorId },
      capabilities: { transfers: { requested: true } },
    });

    await this.vendorService.updateStripeConnect(vendorId, account.id, 'pending');
    return account.id;
  }

  // ── Generate onboarding link ───────────────────────────────────────────────

  async createAccountLink(vendorId: string): Promise<string> {
    const vendor = await this.vendorService.findById(vendorId);
    let stripeConnectId = vendor.stripeConnectId;
    if (!stripeConnectId) stripeConnectId = await this.createAccount(vendorId);

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const link = await this.stripe.accountLinks.create({
      account:     stripeConnectId,
      refresh_url: `${frontendUrl}/vendor/onboarding`,
      return_url:  `${frontendUrl}/vendor/onboarding/complete`,
      type:        'account_onboarding',
    });

    return link.url;
  }

  // ── Sync account status from Stripe webhook ────────────────────────────────

  async handleAccountUpdated(stripeConnectId: string): Promise<void> {
    const vendor = await this.vendorRepo.findOneBy({ stripeConnectId });
    if (!vendor) return;

    const account = await this.stripe.accounts.retrieve(stripeConnectId);
    const payoutsStatus = account.charges_enabled ? 'enabled' : 'pending';
    await this.vendorService.updateStripeConnect(vendor.id, stripeConnectId, payoutsStatus);
  }

  // ── Transfer vendor earnings after successful payment ──────────────────────

  async transferForOrder(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) return;

    const items = await this.itemRepo.find({ where: { orderId } });
    const vendorItems = items.filter(i => i.vendorId != null);
    if (!vendorItems.length) return;

    await Promise.allSettled(
      vendorItems.map(item => this.transferForItem(order, item)),
    );
  }

  private async transferForItem(order: Order, item: OrderItem): Promise<void> {
    const vendor = await this.vendorRepo.findOneBy({ id: item.vendorId! });
    if (!vendor?.stripeConnectId || vendor.payoutsStatus !== 'enabled') {
      this.logger.warn(`Vendor ${item.vendorId} not ready for payouts — skipping transfer`);
      return;
    }

    // Deduplicate: one payout record per order item
    const existing = await this.payoutRepo.findOneBy({ orderId: order.id, orderItemId: item.id });
    if (existing) return;

    const grossCents       = item.totalCents;
    const platformFeeCents = Math.round(grossCents * order.platformFeeBps / 10000);
    const netCents         = grossCents - platformFeeCents;

    if (netCents <= 0) return;

    const payout = this.payoutRepo.create({
      vendorId:       vendor.id,
      orderId:        order.id,
      orderItemId:    item.id,
      grossCents,
      platformFeeCents,
      netCents,
      status:         'pending',
    });
    const saved = await this.payoutRepo.save(payout);

    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount:      netCents,
          currency:    'eur',
          destination: vendor.stripeConnectId,
          metadata:    { orderId: order.id, orderItemId: item.id, payoutId: saved.id },
        },
        { idempotencyKey: `vendor-payout-${saved.id}` },
      );
      await this.payoutRepo.update(saved.id, {
        status:           'transferred',
        stripeTransferId: transfer.id,
      });
    } catch (err) {
      await this.payoutRepo.update(saved.id, {
        status:        'failed',
        failureReason: (err as Error).message,
      });
      this.logger.error(`Payout transfer failed for item ${item.id}: ${(err as Error).message}`);
    }
  }

  // ── Payout history for admin / vendor ─────────────────────────────────────

  async listPayouts(opts: {
    vendorId?: string;
    orderId?:  string;
    limit?:    number;
    offset?:   number;
  } = {}): Promise<{ items: ShopVendorPayout[]; total: number }> {
    const { vendorId, orderId, limit = 20, offset = 0 } = opts;
    const qb = this.payoutRepo.createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (vendorId) qb.andWhere('p.vendorId = :vendorId', { vendorId });
    if (orderId)  qb.andWhere('p.orderId = :orderId',   { orderId });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
