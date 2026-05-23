import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CHECKOUT_RESERVATION_QUEUE, ReservationExpiryJobData } from './checkout-reservation.constants';

@Processor(CHECKOUT_RESERVATION_QUEUE)
export class CheckoutReservationProcessor extends DlqAwareWorker {
  protected readonly queueName = CHECKOUT_RESERVATION_QUEUE;
  private readonly logger = new Logger(CheckoutReservationProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(Order)      private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)  private readonly itemRepo:  Repository<OrderItem>,
    private readonly inventoryService: InventoryService,
  ) {
    super(dlqService);
  }

  async process(job: Job<ReservationExpiryJobData>): Promise<void> {
    const { orderId } = job.data;

    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) return;

    // Only release if still in draft (not yet paid or cancelled)
    if (order.status !== 'draft') {
      this.logger.log(`Order ${orderId} is "${order.status}" — skipping reservation expiry`);
      return;
    }

    const now = new Date();
    if (order.reservationExpiresAt && order.reservationExpiresAt > now) {
      this.logger.log(`Order ${orderId} reservation not yet expired — skipping`);
      return;
    }

    this.logger.log(`Expiring reservation for draft order ${orderId}`);

    // Cancel the order
    order.status = 'cancelled';
    await this.orderRepo.save(order);

    // Release inventory for each item
    const items = await this.itemRepo.findBy({ orderId });
    for (const item of items) {
      if (item.variantId) {
        await this.inventoryService.releaseForOrder(item.variantId, item.quantity, orderId);
      }
    }

    this.logger.log(`Reservation expired and inventory released for order ${orderId}`);
  }
}
