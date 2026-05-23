import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopCustomerGroup } from '../entities/shop-customer-group.entity';

@Controller('admin/shop/customers/groups')
export class CustomerGroupAdminController {
  constructor(
    @InjectRepository(ShopCustomerGroup) private readonly repo: Repository<ShopCustomerGroup>,
  ) {}

  @Get()
  async list(
    @Query('limit')  limit = '50',
    @Query('offset') offset = '0',
  ) {
    const [items, total] = await this.repo.findAndCount({
      order: { name: 'ASC' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });
    return { items, total };
  }

  @Post()
  async create(@Body() body: Partial<ShopCustomerGroup>) {
    const group = this.repo.create(body);
    return this.repo.save(group);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<ShopCustomerGroup>) {
    await this.repo.update(id, body);
    return this.repo.findOneBy({ id });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.repo.delete(id);
  }
}
