import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { ShopCollection } from '../entities/shop-collection.entity';
import { ShopCollectionProduct } from '../entities/shop-collection-product.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_COLLECTION } from '../../common/entity-types';
import { slugify } from '../../common/utils/slug.util';

export const UpsertCollectionSchema = z.object({
  slug:           z.string().min(1).max(200).optional(),
  name:           z.string().min(1).max(500),
  description:    z.string().nullish(),
  imageKey:       z.string().max(1000).nullish(),
  seoTitle:       z.string().max(500).nullish(),
  seoDescription: z.string().nullish(),
  metaKeywords:   z.string().max(500).nullish(),
  heroCopy:       z.string().nullish(),
  bodyHtml:       z.string().nullish(),
  isActive:       z.boolean().optional(),
  isFeatured:     z.boolean().optional(),
  sortOrder:      z.number().int().optional(),
  publishedAt:    z.string().datetime().nullish(),
});
export type UpsertCollectionDto = z.infer<typeof UpsertCollectionSchema>;

@Injectable()
export class CollectionService {
  constructor(
    @InjectRepository(ShopCollection)        private readonly collectionRepo: Repository<ShopCollection>,
    @InjectRepository(ShopCollectionProduct) private readonly cpRepo:         Repository<ShopCollectionProduct>,
    private readonly assetUrlService:      AssetUrlService,
    private readonly translationsService:  TranslationsService,
  ) {}

  private async enrichCollection<T extends ShopCollection>(c: T): Promise<T & { imageUrl: string | null }> {
    const url = c.imageKey ? await this.assetUrlService.resolve(c.imageKey) : null;
    return Object.assign(c, { imageUrl: url });
  }

  async adminList(): Promise<any[]> {
    const collections = await this.collectionRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return Promise.all(collections.map(c => this.enrichCollection(c)));
  }

  async publicList(lang?: string): Promise<any[]> {
    const collections = await this.collectionRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    const enriched = await Promise.all(collections.map(c => this.enrichCollection(c))) as any[];
    return this.translationsService.maybeApply(enriched, ET_SHOP_COLLECTION, lang);
  }

  async featuredList(lang?: string): Promise<any[]> {
    const collections = await this.collectionRepo.find({
      where: { isActive: true, isFeatured: true },
      order: { sortOrder: 'ASC' },
    });
    const enriched = await Promise.all(collections.map(c => this.enrichCollection(c))) as any[];
    return this.translationsService.maybeApply(enriched, ET_SHOP_COLLECTION, lang);
  }

  async findBySlug(slug: string, withProducts = true, lang?: string): Promise<any> {
    const collection = await this.collectionRepo.findOneBy({ slug, isActive: true });
    if (!collection) throw new NotFoundException('Collection not found');

    let products: ShopCollectionProduct[] = [];
    if (withProducts) {
      products = await this.cpRepo.find({
        where: { collectionId: collection.id },
        order: { sortOrder: 'ASC' },
      });
    }

    const result: any = { ...(await this.enrichCollection(collection)), products };
    return this.translationsService.maybeApplyOne(result, ET_SHOP_COLLECTION, lang);
  }

  async findById(id: string): Promise<any> {
    const collection = await this.collectionRepo.findOneBy({ id });
    if (!collection) throw new NotFoundException('Collection not found');
    const products = await this.cpRepo.find({
      where: { collectionId: id },
      order: { sortOrder: 'ASC' },
    });
    return { ...(await this.enrichCollection(collection)), products };
  }

  async create(dto: UpsertCollectionDto): Promise<ShopCollection> {
    const slug = dto.slug ?? slugify(dto.name);
    const existing = await this.collectionRepo.findOneBy({ slug });
    if (existing) throw new ConflictException(`Slug "${slug}" already in use`);

    return this.collectionRepo.save(this.collectionRepo.create({
      slug,
      name:           dto.name,
      description:    dto.description ?? null,
      imageKey:       dto.imageKey ?? null,
      seoTitle:       dto.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? null,
      metaKeywords:   dto.metaKeywords ?? null,
      heroCopy:       dto.heroCopy ?? null,
      bodyHtml:       dto.bodyHtml ?? null,
      isActive:       dto.isActive ?? true,
      isFeatured:     dto.isFeatured ?? false,
      sortOrder:      dto.sortOrder ?? 0,
      publishedAt:    dto.publishedAt ? new Date(dto.publishedAt) : null,
    }));
  }

  async update(id: string, dto: Partial<UpsertCollectionDto>): Promise<ShopCollection> {
    const collection = await this.collectionRepo.findOneBy({ id });
    if (!collection) throw new NotFoundException('Collection not found');

    if (dto.slug && dto.slug !== collection.slug) {
      const conflict = await this.collectionRepo.findOneBy({ slug: dto.slug });
      if (conflict && conflict.id !== id) throw new ConflictException('Slug already in use');
      collection.slug = dto.slug;
    }

    Object.assign(collection, {
      name:           dto.name           ?? collection.name,
      description:    dto.description    !== undefined ? dto.description ?? null : collection.description,
      imageKey:       dto.imageKey       !== undefined ? dto.imageKey ?? null : collection.imageKey,
      seoTitle:       dto.seoTitle       !== undefined ? dto.seoTitle ?? null : collection.seoTitle,
      seoDescription: dto.seoDescription !== undefined ? dto.seoDescription ?? null : collection.seoDescription,
      metaKeywords:   dto.metaKeywords   !== undefined ? dto.metaKeywords ?? null : collection.metaKeywords,
      heroCopy:       dto.heroCopy       !== undefined ? dto.heroCopy ?? null : collection.heroCopy,
      bodyHtml:       dto.bodyHtml       !== undefined ? dto.bodyHtml ?? null : collection.bodyHtml,
      isActive:       dto.isActive       !== undefined ? dto.isActive : collection.isActive,
      isFeatured:     dto.isFeatured     !== undefined ? dto.isFeatured : collection.isFeatured,
      sortOrder:      dto.sortOrder      !== undefined ? dto.sortOrder : collection.sortOrder,
      publishedAt:    dto.publishedAt    !== undefined ? (dto.publishedAt ? new Date(dto.publishedAt) : null) : collection.publishedAt,
    });

    return this.collectionRepo.save(collection);
  }

  async delete(id: string): Promise<void> {
    await this.collectionRepo.delete(id);
  }

  async addProduct(collectionId: string, productId: string, sortOrder = 0): Promise<void> {
    const existing = await this.cpRepo.findOneBy({ collectionId, productId });
    if (existing) return;
    await this.cpRepo.save(this.cpRepo.create({ collectionId, productId, sortOrder }));
  }

  async removeProduct(collectionId: string, productId: string): Promise<void> {
    await this.cpRepo.delete({ collectionId, productId });
  }

  async reorderProducts(collectionId: string, orderedProductIds: string[]): Promise<void> {
    for (let i = 0; i < orderedProductIds.length; i++) {
      await this.cpRepo.update({ collectionId, productId: orderedProductIds[i] }, { sortOrder: i });
    }
  }
}
