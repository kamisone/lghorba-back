import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShopWishlistItem } from '../entities/shop-wishlist-item.entity';
import { Product } from '../entities/product.entity';
import { ShopEmailService } from '../email/shop-email.service';
import { COMMERCE_EVENTS, InventoryRestockedEvent } from '../events/commerce-events';

@Injectable()
export class StockAlertService {
  private readonly logger = new Logger(StockAlertService.name);

  constructor(
    @InjectRepository(ShopWishlistItem) private readonly wishlistRepo: Repository<ShopWishlistItem>,
    @InjectRepository(Product)          private readonly productRepo:  Repository<Product>,
    @InjectDataSource()                 private readonly dataSource:   DataSource,
    private readonly emailService: ShopEmailService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.INVENTORY_RESTOCKED)
  async handleInventoryRestocked(event: InventoryRestockedEvent): Promise<void> {
    await this.notifyRestocked(event.productId).catch(err =>
      this.logger.warn(`Stock alert failed for product ${event.productId}: ${(err as Error).message}`),
    );
  }

  async notifyRestocked(productId: string): Promise<void> {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product || product.status !== 'active') return;

    // Find authenticated users who wishlisted this product
    const wishlistItems = await this.wishlistRepo.find({
      where:  { productId },
      select: ['userId'],
    });

    const userIds = [...new Set(
      wishlistItems.map(w => w.userId).filter(Boolean) as string[],
    )];

    if (!userIds.length) return;

    // Raw query to get emails — avoids importing User entity into CommerceModule
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows: Array<{ id: string; email: string | null }> = await this.dataSource.query(
      `SELECT id, email FROM users WHERE id IN (${placeholders}) AND email IS NOT NULL`,
      userIds,
    );

    const shopUrl = process.env.FRONTEND_URL ?? 'https://localhost:3000';
    const productUrl = `${shopUrl}/shop/${product.slug}`;

    let sent = 0;
    for (const user of rows) {
      if (!user.email) continue;
      try {
        await this.emailService.sendStockAlert({
          customerEmail: user.email,
          productTitle:  product.title,
          productUrl,
        });
        sent++;
      } catch (err) {
        this.logger.warn(`Failed to send stock alert to ${user.email}: ${(err as Error).message}`);
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} stock alert(s) for product ${product.title} (${productId})`);
    }
  }
}
