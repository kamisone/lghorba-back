import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from '../entities/shipment.entity';

@Controller('admin/shop/shipments')
export class ShipmentAdminController {
  constructor(
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
  ) {}

  @Get()
  async list(
    @Query('orderId') orderId?: string,
    @Query('status')  status?: string,
    @Query('limit')   limit = '50',
    @Query('offset')  offset = '0',
  ) {
    const qb = this.repo.createQueryBuilder('s').orderBy('s.createdAt', 'DESC');

    if (orderId) qb.andWhere('s.orderId = :orderId', { orderId });
    if (status)  qb.andWhere('s.status = :status',   { status });

    qb.limit(parseInt(limit, 10)).offset(parseInt(offset, 10));

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  @Post()
  async create(@Body() body: Partial<Shipment>) {
    const shipment = this.repo.create(body);
    return this.repo.save(shipment);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<Shipment>) {
    await this.repo.update(id, body);
    return this.repo.findOneBy({ id });
  }
}
