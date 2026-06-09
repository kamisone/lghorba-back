import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { Order } from '../entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { CHECKOUT_RESERVATION_QUEUE, ReservationExpiryJobData } from './checkout-reservation.constants';

// Statuses that still hold reserved inventory and can be timed out.
const CANCELLABLE_STATUSES = new Set(['draft', 'awaiting_payment']);

@Processor(CHECKOUT_RESERVATION_QUEUE)
export class CheckoutReservationProcessor extends DlqAwareWorker {
  protected readonly queueName = CHECKOUT_RESERVATION_QUEUE;
  private readonly logger = new Logger(CheckoutReservationProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
  ) {
    super(dlqService);
  }

  async process(job: Job<ReservationExpiryJobData>): Promise<void> {
    const { orderId } = job.data;

    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) return;

    if (!CANCELLABLE_STATUSES.has(order.status)) {
      this.logger.log(`Order ${orderId} is "${order.status}" — no expiry action needed`);
      return;
    }

    const now = new Date();
    if (order.reservationExpiresAt && order.reservationExpiresAt > now) {
      this.logger.log(`Order ${orderId} reservation not yet expired — skipping`);
      return;
    }

    this.logger.log(`Reservation timeout: cancelling ${order.status} order ${orderId}`);

    // transition() handles inventory release + status history in one transaction.
    await this.ordersService.transition(orderId, 'cancelled', 'Reservation expired — payment timeout');

    this.logger.log(`Order ${orderId} cancelled and inventory released`);
  }
}
