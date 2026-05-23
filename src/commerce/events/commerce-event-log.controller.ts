import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceEventLog } from './commerce-event-log.entity';

@Controller('admin/shop/customers/activity')
export class CommerceEventLogAdminController {
  constructor(
    @InjectRepository(CommerceEventLog) private readonly repo: Repository<CommerceEventLog>,
  ) {}

  @Get()
  async list(
    @Query('entityId')   entityId?: string,
    @Query('eventName')  eventName?: string,
    @Query('status')     status?: string,
    @Query('limit')      limit = '50',
    @Query('offset')     offset = '0',
  ) {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC');

    if (entityId)  qb.andWhere('e.entityId = :entityId',   { entityId });
    if (eventName) qb.andWhere('e.eventName = :eventName', { eventName });
    if (status)    qb.andWhere('e.status = :status',       { status });

    qb.limit(parseInt(limit, 10)).offset(parseInt(offset, 10));

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
