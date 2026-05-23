import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTransaction } from '../entities/payment-transaction.entity';

@Controller('admin/shop/transactions')
export class PaymentTransactionAdminController {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly repo: Repository<PaymentTransaction>,
  ) {}

  @Get()
  async list(
    @Query('type')     type?: string,
    @Query('status')   status?: string,
    @Query('orderId')  orderId?: string,
    @Query('limit')    limit = '50',
    @Query('offset')   offset = '0',
  ) {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (type)    qb.andWhere('t.type = :type',       { type });
    if (status)  qb.andWhere('t.status = :status',   { status });
    if (orderId) qb.andWhere('t.orderId = :orderId', { orderId });

    qb.limit(parseInt(limit, 10)).offset(parseInt(offset, 10));

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  @Get('stripe-events')
  async stripeEvents(
    @Query('limit')  limit = '50',
    @Query('offset') offset = '0',
  ) {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.webhookEventId', 'webhookEventId')
      .addSelect('MAX(t.createdAt)', 'createdAt')
      .addSelect('COUNT(t.id)', 'count')
      .addSelect('t.orderId', 'orderId')
      .addSelect('t.status', 'status')
      .where('t.webhookEventId IS NOT NULL')
      .groupBy('t.webhookEventId')
      .addGroupBy('t.orderId')
      .addGroupBy('t.status')
      .orderBy('MAX(t.createdAt)', 'DESC')
      .limit(parseInt(limit, 10))
      .offset(parseInt(offset, 10))
      .getRawMany();

    return { items: rows };
  }
}
