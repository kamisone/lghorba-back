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
import { CartItem } from '../entities/cart-item.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';

const ALL_STATUSES: CartStatus[] = ['active', 'abandoned', 'completed', 'merged'];

@Controller('admin/shop/carts')
export class CartAdminController {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly itemRepo: Repository<CartItem>,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: CartStatus,
    @Query('productId') productId?: string,
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
    // EXISTS rather than a join — a join would need DISTINCT (a cart can hold
    // more than one variant of the same product) and duplicate rows here
    // would break the take()/skip() pagination above.
    if (productId) {
      idsQb.andWhere(
        'EXISTS (SELECT 1 FROM shop_cart_items ci WHERE ci."cartId" = c.id AND ci."productId" = :productId)',
        { productId },
      );
    }
    const [rows, total] = await idsQb.getManyAndCount();

    // Top-of-page KPIs describe the whole table, not just this filtered page —
    // fetched every call regardless of status/productId so the numbers stay
    // stable as the admin filters the list below them.
    const stats = await this.getStats();

    if (rows.length === 0) return { items: [], total, stats };

    const carts = await this.cartRepo.find({
      where: { id: In(rows.map((r) => r.id)) },
      relations: ['items'],
      order: { updatedAt: 'DESC' },
    });
    return { items: await this.withImageUrls(carts), total, stats };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const cart = await this.cartRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Cart not found');
    const [withUrls] = await this.withImageUrls([cart]);
    return withUrls;
  }

  /** Resolves each item's imageKeySnapshot to a displayable URL in one batch call. */
  private async withImageUrls(carts: Cart[]): Promise<any[]> {
    const keys = [
      ...new Set(
        carts.flatMap((c) => c.items.map((i) => i.imageKeySnapshot)).filter((k): k is string => !!k),
      ),
    ];
    const urlMap = keys.length ? await this.assetUrlService.resolveBatch(keys) : new Map<string, string>();
    return carts.map((c) => ({
      ...c,
      items: c.items.map((i) => ({
        ...i,
        imageUrl: i.imageKeySnapshot ? urlMap.get(i.imageKeySnapshot) ?? null : null,
      })),
    }));
  }

  /**
   * Cart counts per status (whole table) + total value sitting in abandoned
   * carts — the "revenue at risk" figure the page exists to surface.
   */
  private async getStats(): Promise<{
    byStatus: Record<CartStatus, number>;
    abandonedValueCents: number;
  }> {
    const counts = await this.cartRepo
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany<{ status: CartStatus; count: string }>();

    const byStatus = ALL_STATUSES.reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<CartStatus, number>,
    );
    for (const row of counts) byStatus[row.status] = Number(row.count);

    const { sum } = await this.itemRepo
      .createQueryBuilder('i')
      .innerJoin(Cart, 'c', '"c"."id" = "i"."cartId"')
      .select('COALESCE(SUM("i"."quantity" * "i"."unitPriceCents"), 0)', 'sum')
      .where('"c"."status" = :status', { status: 'abandoned' })
      .getRawOne<{ sum: string }>();

    return { byStatus, abandonedValueCents: Number(sum ?? 0) };
  }
}
