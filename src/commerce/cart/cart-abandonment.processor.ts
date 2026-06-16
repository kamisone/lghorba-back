import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Order } from '../entities/order.entity';
import { ShopEmailService } from '../email/shop-email.service';
import { CART_ABANDONMENT_QUEUE, CartAbandonmentJobData } from './cart-abandonment.constants';

@Processor(CART_ABANDONMENT_QUEUE)
export class CartAbandonmentProcessor extends DlqAwareWorker {
  protected readonly queueName = CART_ABANDONMENT_QUEUE;
  private readonly logger = new Logger(CartAbandonmentProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(Cart)     private readonly cartRepo:  Repository<Cart>,
    @InjectRepository(CartItem) private readonly itemRepo:  Repository<CartItem>,
    @InjectRepository(Order)    private readonly orderRepo: Repository<Order>,
    private readonly emailService: ShopEmailService,
  ) {
    super(dlqService);
  }

  async process(job: Job<CartAbandonmentJobData>): Promise<void> {
    const { cartToken, customerEmail: jobEmail, customerName: jobName, locale: jobLocale } = job.data;

    const cart = await this.cartRepo.findOne({
      where: { token: cartToken, status: 'active' },
    });

    if (!cart) {
      this.logger.log(`Cart ${cartToken} is no longer active — skipping abandonment email`);
      return;
    }

    const items = await this.itemRepo.findBy({ cartId: cart.id });
    if (!items.length) {
      this.logger.log(`Cart ${cartToken} has no items — skipping abandonment email`);
      return;
    }

    // Resolve customer email: prefer job data, fall back to any order for this cartToken.
    // The cart service enqueues abandonment jobs with only cartToken — the email is captured
    // later when the customer enters checkout and creates a draft order.
    let email  = jobEmail ?? null;
    let name   = jobName ?? null;
    let locale = jobLocale ?? null;
    if (!email) {
      const order = await this.orderRepo.findOne({
        where: { cartToken },
        order: { createdAt: 'DESC' },
      });
      if (order?.customerEmail) {
        email  = order.customerEmail;
        name   = name ?? order.customerName;
        locale = locale ?? order.customerLocale;
      }
    }

    if (!email || !email.includes('@')) {
      this.logger.log(`Cart ${cartToken} has no customer email — skipping`);
      return;
    }

    const cartUrl = `${process.env.APP_URL ?? 'https://localhost:3000'}/shop/cart?token=${cartToken}`;

    await this.emailService.sendAbandonedCart({
      cartToken,
      customerEmail: email,
      customerName:  name ?? 'Customer',
      cartUrl,
      locale:        locale ?? 'fr',
      items: items.map(i => ({
        title:          i.titleSnapshot,
        quantity:       i.quantity,
        unitPriceCents: i.unitPriceCents,
      })),
    });

    this.logger.log(`Abandoned cart email sent for cart ${cartToken}`);
  }
}
