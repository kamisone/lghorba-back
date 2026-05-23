import {
  Body, Controller, Delete, Get, HttpCode,
  NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatusRef } from '../entities/order-status-ref.entity';

interface UpsertStatusRefDto {
  code:         string;
  label:        string;
  description?: string | null;
  color?:       string | null;
  sortOrder?:   number;
  isActive?:    boolean;
}

@Controller('admin/shop/order-status-refs')
export class OrderStatusRefAdminController {
  constructor(
    @InjectRepository(OrderStatusRef)
    private readonly repo: Repository<OrderStatusRef>,
  ) {}

  @Get()
  list() {
    return this.repo.find({ order: { sortOrder: 'ASC', code: 'ASC' } });
  }

  @Post()
  create(@Body() dto: UpsertStatusRefDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<UpsertStatusRefDto>) {
    const ref = await this.repo.findOneBy({ id });
    if (!ref) throw new NotFoundException('Order status ref not found');
    Object.assign(ref, dto);
    return this.repo.save(ref);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    const ref = await this.repo.findOneBy({ id });
    if (!ref) throw new NotFoundException('Order status ref not found');
    await this.repo.remove(ref);
  }
}
