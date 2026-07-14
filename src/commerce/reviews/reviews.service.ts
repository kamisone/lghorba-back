import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { z } from 'zod';
import { ProductReview, ReviewStatus } from '../entities/product-review.entity';
import { Product } from '../entities/product.entity';
import {
  ReviewMediaItem,
  ResolvedReviewMediaItem,
} from '../entities/review-media-item';
import { OrdersService } from '../orders/orders.service';
import { GcsService } from '../../gcs/gcs.service';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { AntiSpamService } from '../../common/anti-spam/anti-spam.service';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const VerifyOrderSchema = z.object({
  orderNumber: z.string().min(1).max(50),
  productId: z.string().uuid(),
  email: z.string().email().max(300).nullish(),
  token: z.string().uuid().nullish(),
});
export type VerifyOrderDto = z.infer<typeof VerifyOrderSchema>;

// multipart/form-data delivers every field as a string — rating needs coercion.
export const SubmitReviewSchema = z.object({
  orderNumber: z.string().min(1).max(50),
  productId: z.string().uuid(),
  email: z.string().email().max(300).nullish(),
  token: z.string().uuid().nullish(),
  authorName: z.string().min(1).max(300),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  /** JSON-stringified array of existing media keys to retain (edit flow). */
  keepMediaKeys: z.string().max(4000).nullish(),
  // ── Anti-spam metadata (evaluated then discarded, never stored) ──
  _hp: z.string().max(500).optional(),
  _t: z.coerce.number().int().positive().optional(),
  _token: z.string().max(2500).optional(),
});
export type SubmitReviewDto = z.infer<typeof SubmitReviewSchema>;

export const ModerateReviewSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'hidden']),
  rejectionReason: z.string().max(500).nullish(),
});
export type ModerateReviewDto = z.infer<typeof ModerateReviewSchema>;

export const AdminUpdateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
});
export type AdminUpdateReviewDto = z.infer<typeof AdminUpdateReviewSchema>;

// ── Upload limits ────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB — also the multer-level FilesInterceptor cap
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_MEDIA_FILES = 5;

const EMPTY_DISTRIBUTION = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(ProductReview)
    private readonly reviewRepo: Repository<ProductReview>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly orders: OrdersService,
    private readonly gcs: GcsService,
    private readonly assetUrls: AssetUrlService,
    private readonly antiSpam: AntiSpamService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Verification ─────────────────────────────────────────────────────────

  /**
   * Never leaks *why* verification failed (order not found, wrong email/token,
   * unpaid order, wrong product) — every failure collapses to the same
   * `{verified:false}` shape so the endpoint can't be used to enumerate orders.
   */
  async verifyOrder(dto: VerifyOrderDto): Promise<{
    verified: boolean;
    alreadyReviewed: boolean;
    existing?: {
      authorName: string;
      rating: number;
      title: string | null;
      body: string | null;
      media: ResolvedReviewMediaItem[];
      status: ReviewStatus;
    };
  }> {
    const result = await this.orders.verifyOrderForReview(
      dto.orderNumber,
      dto.productId,
      {
        token: dto.token ?? undefined,
        email: dto.email ?? undefined,
      },
    );
    if (!result) return { verified: false, alreadyReviewed: false };

    const existing = await this.reviewRepo.findOne({
      where: { orderId: result.order.id, productId: dto.productId },
    });
    if (!existing) return { verified: true, alreadyReviewed: false };

    return {
      verified: true,
      alreadyReviewed: true,
      existing: {
        authorName: existing.authorName,
        rating: existing.rating,
        title: existing.title,
        body: existing.body,
        media: await this.resolveMedia(existing.media),
        status: existing.status,
      },
    };
  }

  // ── Submission (create or edit — same verified, upsert path) ────────────────

  async submit(
    dto: SubmitReviewDto,
    files: Express.Multer.File[],
    meta: { ip: string | null; userAgent?: string },
  ): Promise<{ ok: true }> {
    // 1. Anti-spam first — reject obvious bots before any file/DB work.
    const spam = await this.antiSpam.evaluate({
      honeypot: dto._hp,
      renderedAt: dto._t,
      turnstileToken: dto._token,
      name: dto.authorName,
      contact: dto.orderNumber,
      subject: dto.title ?? '',
      message: dto.body ?? '',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // Blocked submissions look identical to success — never reveal the filter.
    if (spam.decision === 'block') return { ok: true };

    // 2. Re-verify server-side — never trust a prior client "verified" flag.
    const result = await this.orders.verifyOrderForReview(
      dto.orderNumber,
      dto.productId,
      {
        token: dto.token ?? undefined,
        email: dto.email ?? undefined,
      },
    );
    if (!result)
      throw new BadRequestException(
        'Unable to verify this order for this product',
      );
    const { order, orderItem } = result;

    const mediaFiles = this.validateFiles(files ?? []);

    const existing = await this.reviewRepo.findOne({
      where: { orderId: order.id, productId: dto.productId },
    });
    const id = existing?.id ?? randomUUID();

    const keepKeys: string[] = dto.keepMediaKeys
      ? this.parseKeepKeys(dto.keepMediaKeys)
      : [];
    const keptMedia = (existing?.media ?? []).filter((m) =>
      keepKeys.includes(m.key),
    );
    const removedMedia = (existing?.media ?? []).filter(
      (m) => !keepKeys.includes(m.key),
    );
    const uploadedMedia = await this.uploadMedia(id, mediaFiles);
    const media = [...keptMedia, ...uploadedMedia];

    // 3. Atomic upsert keyed on (orderId, productId) — avoids a find-then-save
    //    race between two concurrent submits for the same order+product.
    await this.dataSource.query(
      `INSERT INTO shop_product_reviews
         (id, "productId", "orderId", "orderItemId", "authorName", "authorEmail",
          rating, title, body, media, status, "isVerifiedPurchase",
          "rejectionReason", "moderatedAt", "moderatedBy", "createdAt", "updatedAt")
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',true,NULL,NULL,NULL,now(),now())
       ON CONFLICT ("orderId","productId") WHERE "orderId" IS NOT NULL
       DO UPDATE SET
         "authorName"  = EXCLUDED."authorName",
         "authorEmail" = EXCLUDED."authorEmail",
         rating        = EXCLUDED.rating,
         title         = EXCLUDED.title,
         body          = EXCLUDED.body,
         media         = EXCLUDED.media,
         status        = 'pending',
         "isVerifiedPurchase" = true,
         "rejectionReason" = NULL,
         "moderatedAt"      = NULL,
         "moderatedBy"      = NULL,
         "orderItemId"      = EXCLUDED."orderItemId",
         "updatedAt"        = now()`,
      [
        id,
        dto.productId,
        order.id,
        orderItem.id,
        dto.authorName,
        order.customerEmail,
        dto.rating,
        dto.title ?? null,
        dto.body ?? null,
        JSON.stringify(media),
      ],
    );

    await Promise.allSettled(removedMedia.map((m) => this.gcs.delete(m.key)));
    await this.recomputeProductStats(dto.productId);
    return { ok: true };
  }

  // ── Moderation (admin) ───────────────────────────────────────────────────

  async moderate(
    id: string,
    dto: ModerateReviewDto,
    moderatedBy: string,
  ): Promise<ProductReview> {
    const review = await this.reviewRepo.findOneBy({ id });
    if (!review) throw new NotFoundException('Review not found');

    review.status = dto.status;
    review.moderatedAt = new Date();
    review.moderatedBy = moderatedBy;
    review.rejectionReason =
      dto.status === 'rejected' ? dto.rejectionReason ?? null : null;

    const saved = await this.reviewRepo.save(review);
    await this.recomputeProductStats(saved.productId);
    return saved;
  }

  async adminUpdate(
    id: string,
    dto: AdminUpdateReviewDto,
  ): Promise<ProductReview> {
    const review = await this.reviewRepo.findOneBy({ id });
    if (!review) throw new NotFoundException('Review not found');

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.body !== undefined) review.body = dto.body;

    const saved = await this.reviewRepo.save(review);
    if (saved.status === 'approved')
      await this.recomputeProductStats(saved.productId);
    return saved;
  }

  async adminDelete(id: string): Promise<void> {
    const review = await this.reviewRepo.findOneBy({ id });
    if (!review) throw new NotFoundException('Review not found');

    await Promise.allSettled(
      (review.media ?? []).map((m) => this.gcs.delete(m.key)),
    );
    await this.reviewRepo.delete(id);
    await this.recomputeProductStats(review.productId);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** Public listing — never exposes authorEmail or moderation/audit fields. */
  async listForProduct(
    productId: string,
    limit = 20,
    offset = 0,
  ): Promise<{
    items: Array<{
      id: string;
      authorName: string;
      rating: number;
      title: string | null;
      body: string | null;
      media: ResolvedReviewMediaItem[];
      isVerifiedPurchase: boolean;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const [rows, total] = await this.reviewRepo.findAndCount({
      where: { productId, status: 'approved' },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        authorName: r.authorName,
        rating: r.rating,
        title: r.title,
        body: r.body,
        media: await this.resolveMedia(r.media),
        isVerifiedPurchase: r.isVerifiedPurchase,
        createdAt: r.createdAt,
      })),
    );

    return { items, total };
  }

  async adminList(
    status?: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: unknown[]; total: number }> {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.product', 'product')
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (status) qb.andWhere('r.status = :status', { status });

    const [rows, total] = await qb.getManyAndCount();

    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        productId: r.productId,
        productTitle: r.product?.title ?? null,
        authorName: r.authorName,
        authorEmail: r.authorEmail,
        rating: r.rating,
        title: r.title,
        body: r.body,
        media: await this.resolveMedia(r.media),
        status: r.status,
        isVerifiedPurchase: r.isVerifiedPurchase,
        rejectionReason: r.rejectionReason,
        moderatedAt: r.moderatedAt,
        moderatedBy: r.moderatedBy,
        createdAt: r.createdAt,
      })),
    );

    return { items, total };
  }

  /** Cached on Product — O(1) read, recomputed after every moderation-affecting write. */
  async getStats(productId: string): Promise<{
    average: number;
    count: number;
    distribution: Record<string, number>;
  }> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      select: ['ratingAverage', 'reviewCount', 'ratingDistribution'],
    });
    if (!product)
      return { average: 0, count: 0, distribution: EMPTY_DISTRIBUTION };
    return {
      average: Number(product.ratingAverage),
      count: product.reviewCount,
      distribution: product.ratingDistribution ?? EMPTY_DISTRIBUTION,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async recomputeProductStats(productId: string): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT
         ROUND(AVG(rating)::numeric, 2) AS avg_rating,
         COUNT(*)::int AS review_count,
         jsonb_build_object(
           '1', COUNT(*) FILTER (WHERE rating = 1),
           '2', COUNT(*) FILTER (WHERE rating = 2),
           '3', COUNT(*) FILTER (WHERE rating = 3),
           '4', COUNT(*) FILTER (WHERE rating = 4),
           '5', COUNT(*) FILTER (WHERE rating = 5)
         ) AS distribution
       FROM shop_product_reviews
       WHERE "productId" = $1 AND status = 'approved'`,
      [productId],
    );

    await this.productRepo.update(productId, {
      ratingAverage: Number(row?.avg_rating ?? 0),
      reviewCount: Number(row?.review_count ?? 0),
      ratingDistribution: row?.distribution ?? EMPTY_DISTRIBUTION,
    });
  }

  private parseKeepKeys(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private validateFiles(files: Express.Multer.File[]): Express.Multer.File[] {
    if (files.length > MAX_MEDIA_FILES) {
      throw new BadRequestException(
        `No more than ${MAX_MEDIA_FILES} files per review`,
      );
    }
    for (const file of files) {
      const isImage = ALLOWED_IMAGE_MIMES.includes(file.mimetype);
      const isVideo = ALLOWED_VIDEO_MIMES.includes(file.mimetype);
      if (!isImage && !isVideo)
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}`,
        );
      const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > max)
        throw new BadRequestException(`File too large: ${file.originalname}`);
    }
    return files;
  }

  private async uploadMedia(
    reviewId: string,
    files: Express.Multer.File[],
  ): Promise<ReviewMediaItem[]> {
    const items: ReviewMediaItem[] = [];
    for (const file of files) {
      const isVideo = file.mimetype.startsWith('video/');
      const ext = file.originalname.includes('.')
        ? file.originalname.split('.').pop()
        : isVideo
          ? 'mp4'
          : 'jpg';
      const key = `media/reviews/${reviewId}/${randomUUID()}.${ext}`;
      await this.gcs.upload(file.buffer, key, file.mimetype, 'publicRead');
      items.push({ key, type: isVideo ? 'video' : 'image' });
    }
    return items;
  }

  private async resolveMedia(
    media: ReviewMediaItem[],
  ): Promise<ResolvedReviewMediaItem[]> {
    if (!media?.length) return [];
    const urlMap = await this.assetUrls.resolveBatch(media.map((m) => m.key));
    return media.map((m) => ({ ...m, url: urlMap.get(m.key) ?? '' }));
  }
}
