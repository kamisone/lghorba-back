import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../commerce/entities/product.entity';
import { ProductVariant } from '../../commerce/entities/product-variant.entity';
import { InventoryItem } from '../../commerce/entities/inventory-item.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';

/**
 * Builds the TikTok Catalog product feed (Google Shopping XML format — one of
 * the formats TikTok's own Catalog Manager accepts for a "Data feed / URL"
 * catalog source). Scoped to TikTok only, not shared with Meta/Google: this
 * app has no other feed to reuse.
 *
 * Item `g:id` is always the variant ID, matching the `content_id` every
 * TikTok Pixel/Events API call already sends (see tiktok-events.constants.ts
 * callers) — that shared ID is what lets TikTok match Purchase/AddToCart
 * events back to a catalog entry ("product-to-event matching").
 */
@Injectable()
export class TikTokCatalogService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  async generateFeedXml(): Promise<string> {
    const products = await this.productRepo.find({
      where: { status: 'active', isTestProduct: false },
      relations: ['variants'],
    });

    const variants = products.flatMap(
      (p) => p.variants ?? [],
    ) as ProductVariant[];
    const variantIds = variants.map((v) => v.id);

    const stockByVariant = new Map<string, number>();
    if (variantIds.length) {
      const rows = await this.inventoryRepo.find({
        where: { variantId: In(variantIds) },
      });
      for (const row of rows) stockByVariant.set(row.variantId, row.available);
    }

    const imageKeys = new Set<string>();
    for (const p of products)
      if (p.featuredImageKey) imageKeys.add(p.featuredImageKey);
    for (const v of variants) {
      if (v.featuredMediaKey) imageKeys.add(v.featuredMediaKey);
      for (const k of v.mediaKeys ?? []) imageKeys.add(k);
    }
    const urlMap = await this.assetUrlService.resolveBatch([...imageKeys]);

    const appUrl = process.env.APP_URL ?? '';
    const sellerName = process.env.SELLER_NAME ?? 'vitecamion';

    const items: string[] = [];
    for (const product of products) {
      const productVariants = (product.variants ?? []) as ProductVariant[];
      if (!productVariants.length) continue;

      const link = `${appUrl}/fr/shop/${product.slug}`;
      const description = this.plainTextDescription(
        product.shortDescription ?? product.description ?? product.title,
      );
      const brand = product.brand ?? sellerName;
      const productImageUrl = product.featuredImageKey
        ? urlMap.get(product.featuredImageKey)
        : undefined;

      for (const variant of productVariants) {
        const priceCents = variant.priceCents ?? product.basePriceCents ?? 0;
        const available = stockByVariant.has(variant.id)
          ? stockByVariant.get(variant.id)!
          : null;
        const inStock = available === null || available > 0;
        const imageUrl =
          (variant.featuredMediaKey && urlMap.get(variant.featuredMediaKey)) ||
          (variant.mediaKeys ?? []).map((k) => urlMap.get(k)).find(Boolean) ||
          productImageUrl;
        if (!imageUrl) continue; // TikTok requires image_link — skip items with no resolvable image

        const title =
          productVariants.length > 1
            ? `${product.title} — ${variant.title}`
            : product.title;

        items.push(
          [
            '<item>',
            `<g:id>${this.esc(variant.id)}</g:id>`,
            `<g:item_group_id>${this.esc(product.id)}</g:item_group_id>`,
            `<title>${this.esc(title)}</title>`,
            `<description>${this.esc(description)}</description>`,
            `<link>${this.esc(link)}</link>`,
            `<g:image_link>${this.esc(imageUrl)}</g:image_link>`,
            `<g:availability>${inStock ? 'in stock' : 'out of stock'}</g:availability>`,
            `<g:price>${(priceCents / 100).toFixed(2)} EUR</g:price>`,
            `<g:brand>${this.esc(brand)}</g:brand>`,
            `<g:condition>new</g:condition>`,
            '</item>',
          ].join(''),
        );
      }
    }

    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
      `<title>${this.esc(sellerName)}</title>` +
      `<link>${this.esc(appUrl)}</link>` +
      `<description>${this.esc(sellerName)} product catalog</description>` +
      items.join('') +
      '</channel></rss>'
    );
  }

  private plainTextDescription(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  private esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
