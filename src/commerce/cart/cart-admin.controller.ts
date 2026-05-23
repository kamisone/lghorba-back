import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartStatus } from '../entities/cart.entity';

@Controller('admin/shop/carts')
export class CartAdminController {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
  ) {}

  @Get()
  async list(
    @Query('status') status?: CartStatus,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    const qb = this.cartRepo.createQueryBuilder('c')
      .orderBy('c.updatedAt', 'DESC')
      .take(Number(limit))
      .skip(Number(offset));
    if (status) qb.andWhere('c.status = :status', { status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const cart = await this.cartRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }
}
