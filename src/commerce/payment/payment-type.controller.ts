import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentType } from '../entities/payment-type.entity';

@Controller('admin/shop/payment-types')
export class PaymentTypeAdminController {
  constructor(
    @InjectRepository(PaymentType)
    private readonly repo: Repository<PaymentType>,
  ) {}

  @Get()
  list() {
    return this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  @Post()
  create(@Body() dto: Partial<PaymentType>) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<PaymentType>) {
    await this.repo.update(id, dto);
    return this.repo.findOneByOrFail({ id });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.repo.delete(id);
  }
}
