import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { ProductReview } from '../entities/product-review.entity';

export const CreateReviewSchema = z.object({
  productId:         z.string().uuid(),
  orderId:           z.string().uuid().nullish(),
  userId:            z.string().uuid().nullish(),
  authorName:        z.string().min(1).max(300),
  authorEmail:       z.string().email().max(300),
  rating:            z.number().int().min(1).max(5),
  title:             z.string().max(500).nullish(),
  body:              z.string().nullish(),
  isVerifiedPurchase: z.boolean().optional(),
});
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ProductReview) private readonly reviewRepo: Repository<ProductReview>,
  ) {}

  async create(dto: CreateReviewDto): Promise<ProductReview> {
    return this.reviewRepo.save(this.reviewRepo.create({
      productId:          dto.productId,
      orderId:            dto.orderId ?? null,
      userId:             dto.userId ?? null,
      authorName:         dto.authorName,
      authorEmail:        dto.authorEmail,
      rating:             dto.rating,
      title:              dto.title ?? null,
      body:               dto.body ?? null,
      status:             'pending',
      isVerifiedPurchase: dto.isVerifiedPurchase ?? false,
    }));
  }

  async moderate(id: string, status: 'published' | 'rejected'): Promise<ProductReview> {
    const review = await this.reviewRepo.findOneBy({ id });
    if (!review) throw new NotFoundException('Review not found');
    review.status = status;
    return this.reviewRepo.save(review);
  }

  async listForProduct(productId: string, status: 'published' | 'pending' = 'published'): Promise<ProductReview[]> {
    return this.reviewRepo.find({
      where:  { productId, status },
      order:  { createdAt: 'DESC' },
    });
  }

  async adminList(status?: string, limit = 20, offset = 0): Promise<{ items: ProductReview[]; total: number }> {
    const qb = this.reviewRepo.createQueryBuilder('r')
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (status) qb.andWhere('r.status = :status', { status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getStats(productId: string): Promise<{
    average: number;
    count: number;
    distribution: Record<number, number>;
  }> {
    const reviews = await this.reviewRepo.find({
      where: { productId, status: 'published' },
      select: ['rating'],
    });

    if (!reviews.length) return { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    for (const r of reviews) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      total += r.rating;
    }

    return {
      average:      Math.round((total / reviews.length) * 10) / 10,
      count:        reviews.length,
      distribution,
    };
  }
}
