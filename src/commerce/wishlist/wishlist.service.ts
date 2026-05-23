import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopWishlistItem } from '../entities/shop-wishlist-item.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(ShopWishlistItem) private readonly repo: Repository<ShopWishlistItem>,
  ) {}

  async list(sessionToken: string | null, userId: string | null): Promise<ShopWishlistItem[]> {
    if (userId) {
      return this.repo.find({ where: { userId }, order: { addedAt: 'DESC' } });
    }
    if (sessionToken) {
      return this.repo.find({ where: { sessionToken }, order: { addedAt: 'DESC' } });
    }
    return [];
  }

  async add(sessionToken: string | null, userId: string | null, productId: string, variantId?: string): Promise<ShopWishlistItem> {
    // Check if already in wishlist
    const condition = userId
      ? { userId, productId }
      : { sessionToken, productId };

    const existing = await this.repo.findOne({ where: condition as any });
    if (existing) return existing;

    return this.repo.save(this.repo.create({
      sessionToken: userId ? null : sessionToken,
      userId:       userId ?? null,
      productId,
      variantId:    variantId ?? null,
    }));
  }

  async remove(sessionToken: string | null, userId: string | null, productId: string): Promise<void> {
    if (userId) {
      await this.repo.delete({ userId, productId });
    } else if (sessionToken) {
      await this.repo.delete({ sessionToken, productId });
    }
  }

  async isWishlisted(sessionToken: string | null, userId: string | null, productId: string): Promise<boolean> {
    const condition = userId
      ? { userId, productId }
      : { sessionToken, productId };
    const existing = await this.repo.findOne({ where: condition as any });
    return !!existing;
  }

  // Merge guest wishlist into user wishlist on login
  async mergeGuestToUser(sessionToken: string, userId: string): Promise<void> {
    const guestItems = await this.repo.find({ where: { sessionToken } });
    for (const item of guestItems) {
      await this.add(null, userId, item.productId, item.variantId ?? undefined);
    }
    await this.repo.delete({ sessionToken });
  }
}
