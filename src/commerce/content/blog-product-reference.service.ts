import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogProductReference } from '../entities/blog-product-reference.entity';
import { Product } from '../entities/product.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';

export interface AttachProductDto {
  productId: string;
  label?: string | null;
  sortOrder?: number;
}

@Injectable()
export class BlogProductReferenceService {
  constructor(
    @InjectRepository(BlogProductReference)
    private readonly refRepo: Repository<BlogProductReference>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  async listForPost(postId: string): Promise<any[]> {
    const refs = await this.refRepo.find({
      where: { postId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    if (!refs.length) return [];

    const productIds = refs.map(r => r.productId);
    const products = await this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.variants', 'v', 'v.isDefault = true')
      .whereInIds(productIds)
      .getMany();

    const productMap = new Map(products.map(p => [p.id, p]));

    const imageKeys = products
      .map(p => p.featuredImageKey)
      .filter(Boolean) as string[];
    const urlMap = await this.assetUrlService.resolveBatch(imageKeys);

    return refs.map(ref => {
      const product = productMap.get(ref.productId);
      if (!product) return null;
      const defaultVariant = (product as any).variants?.[0] ?? null;
      return {
        referenceId: ref.id,
        label:       ref.label,
        sortOrder:   ref.sortOrder,
        product: {
          id:           product.id,
          slug:         product.slug,
          title:        product.title,
          imageUrl:     product.featuredImageKey
                          ? (urlMap.get(product.featuredImageKey) ?? null)
                          : null,
          priceCents:   defaultVariant?.priceCents ?? null,
          status:       product.status,
        },
      };
    }).filter(Boolean);
  }

  async attach(postId: string, dto: AttachProductDto): Promise<BlogProductReference> {
    const product = await this.productRepo.findOneBy({ id: dto.productId });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);

    const existing = await this.refRepo.findOneBy({ postId, productId: dto.productId });
    if (existing) {
      existing.label     = dto.label ?? existing.label;
      existing.sortOrder = dto.sortOrder ?? existing.sortOrder;
      return this.refRepo.save(existing);
    }

    return this.refRepo.save(this.refRepo.create({
      postId,
      productId:  dto.productId,
      label:      dto.label ?? null,
      sortOrder:  dto.sortOrder ?? 0,
    }));
  }

  async detach(postId: string, productId: string): Promise<void> {
    const ref = await this.refRepo.findOneBy({ postId, productId });
    if (!ref) throw new NotFoundException('Product reference not found');
    await this.refRepo.remove(ref);
  }

  async reorder(postId: string, orderedProductIds: string[]): Promise<void> {
    await Promise.all(
      orderedProductIds.map((productId, idx) =>
        this.refRepo.update({ postId, productId }, { sortOrder: idx }),
      ),
    );
  }
}
