import {
  Controller, Delete, Get, HttpCode, Param, Patch, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPaymentMethod } from '../entities/user-payment-method.entity';

@Controller('admin/shop/payment-methods')
export class UserPaymentMethodAdminController {
  constructor(
    @InjectRepository(UserPaymentMethod)
    private readonly repo: Repository<UserPaymentMethod>,
  ) {}

  @Get()
  list(
    @Query('customerId') customerId?: string,
    @Query('status')     status?: string,
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.customer', 'c')
      .leftJoinAndSelect('m.paymentType', 'pt')
      .orderBy('m.createdAt', 'DESC')
      .take(limit  ? parseInt(limit,  10) : 20)
      .skip(offset ? parseInt(offset, 10) : 0);

    if (customerId) qb.andWhere('m.customerId = :customerId', { customerId });
    if (status)     qb.andWhere('m.status = :status', { status });

    return qb.getManyAndCount().then(([items, total]) => ({ items, total }));
  }

  @Get('customer/:customerId')
  listByCustomer(@Param('customerId') customerId: string) {
    return this.repo.find({
      where: { customerId },
      relations: ['paymentType', 'billingAddress'],
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Query('value') status: string) {
    await this.repo.update(id, { status: status as any });
    return this.repo.findOneByOrFail({ id });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.repo.delete(id);
  }
}
