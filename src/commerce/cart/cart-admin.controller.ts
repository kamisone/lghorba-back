import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cart, CartStatus } from '../entities/cart.entity';

@Controller('admin/shop/carts')
export class CartAdminController {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
  ) {}

  @Get()
  async list(
    @Query('status') status?: CartStatus,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    // Two-step pagination: page over bare Cart rows first (no join), then
    // hydrate items for just that page. Joining `items` directly into a
    // take()/skip() query would apply LIMIT/OFFSET to the flattened
    // cart-x-item row set instead of distinct carts, breaking pagination —
    // `items` is `eager: true` on the entity, but eager loading only kicks
    // in for repo.find()/findOne(), never for a hand-built QueryBuilder query.
    const idsQb = this.cartRepo
      .createQueryBuilder('c')
      .select('c.id')
      .orderBy('c.updatedAt', 'DESC')
      .take(Number(limit))
      .skip(Number(offset));
    if (status) idsQb.andWhere('c.status = :status', { status });
    const [rows, total] = await idsQb.getManyAndCount();

    if (rows.length === 0) return { items: [], total };

    const items = await this.cartRepo.find({
      where: { id: In(rows.map((r) => r.id)) },
      relations: ['items'],
      order: { updatedAt: 'DESC' },
    });
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
