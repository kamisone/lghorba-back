import { randomUUID } from 'crypto';
import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { In, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { InventoryItem } from '../entities/inventory-item.entity';
import { ShopPromotion } from '../entities/shop-promotion.entity';
import { VariationOptionValue } from '../entities/variation-option-value.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_VARIANT_ATTR, ET_SHOP_VARIATION_OPTION } from '../../common/entity-types';
import { CART_ABANDONMENT_QUEUE } from './cart-abandonment.constants';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)          private readonly cartRepo:      Repository<Cart>,
    @InjectRepository(CartItem)      private readonly itemRepo:      Repository<CartItem>,
    @InjectRepository(ProductVariant) private readonly variantRepo:  Repository<ProductVariant>,
    @InjectRepository(Product)       private readonly productRepo:   Repository<Product>,
    @InjectRepository(InventoryItem) private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ShopPromotion)        private readonly promoRepo:     Repository<ShopPromotion>,
    @InjectRepository(VariationOptionValue) private readonly ovRepo:        Repository<VariationOptionValue>,
    private readonly assetUrlService: AssetUrlService,
    private readonly translationsService: TranslationsService,
    @InjectQueue(CART_ABANDONMENT_QUEUE)
    private readonly abandonmentQueue: Queue,
  ) {}

  // ── Get or create cart by token ────────────────────────────────────────────

  async getOrCreate(token: string, userId?: string, lang?: string): Promise<any> {
    const existing = await this.cartRepo.findOne({
      where: { token },
      relations: ['items'],
    });

    // If the found cart is no longer active (completed / abandoned / merged),
    // create a fresh one with a new token so the frontend can reset its state.
    let cart: Cart;
    if (!existing || existing.status !== 'active') {
      cart = await this.cartRepo.save(this.cartRepo.create({
        token:  existing ? randomUUID() : token,
        userId: userId ?? null,
        status: 'active',
      }));
      (cart as any).items = [];
    } else {
      cart = existing;
      if (userId && !cart.userId) {
        cart.userId = userId;
        await this.cartRepo.save(cart);
      }
    }

    return this.enrichCart(cart, lang);
  }

  // ── Add item ───────────────────────────────────────────────────────────────

  async addItem(
    token: string,
    variantId: string,
    quantity: number,
    selectedOptionValueIds?: string[],
  ): Promise<any> {
    if (quantity < 1) throw new BadRequestException('Quantity must be at least 1');

    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: ['product'],
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if ((variant as any).product?.status !== 'active') throw new BadRequestException('Product is not available');

    const inventory = await this.inventoryRepo.findOneBy({ variantId });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    const cart = await this.ensureActiveCart(token);

    const existing = cart.items.find((i: CartItem) => i.variantId === variantId);
    if (existing) {
      const newQty = existing.quantity + quantity;
      if (inventory.available < newQty) throw new BadRequestException('Insufficient stock');
      existing.quantity = newQty;
      await this.itemRepo.save(existing);
    } else {
      const product = (variant as any).product as Product;

      // Build options snapshot from caller-supplied selection (user-chosen variation options)
      let optionsSnapshot: Array<{
        attributeId: string; attributeName: string;
        optionValueId: string | null; value: string; displayValue: string | null;
      }> | null = null;

      if (selectedOptionValueIds?.length) {
        const ovRows = await this.ovRepo.find({
          where: { id: (await import('typeorm')).In(selectedOptionValueIds) },
          relations: ['attribute'],
        });
        optionsSnapshot = ovRows.map(ov => ({
          attributeId:   ov.attributeId,
          attributeName: ov.attribute?.name ?? '',
          optionValueId: ov.id,
          value:         ov.value,
          displayValue:  ov.displayValue,
        }));
      }

      await this.itemRepo.save(this.itemRepo.create({
        cartId:          cart.id,
        productId:       product.id,
        variantId:       variant.id,
        quantity,
        unitPriceCents:  variant.priceCents,
        titleSnapshot:   product.title,
        skuSnapshot:     variant.sku,
        imageKeySnapshot:            (variant as any).featuredMediaKey ?? product.featuredImageKey ?? null,
        optionsSnapshot,
        compareAtPriceCentsSnapshot: variant.compareAtPriceCents ?? null,
      }));
    }

    // Schedule abandonment email — delay 1h, jobId ensures only one pending per cart
    await this.abandonmentQueue.add(
      'abandon',
      { cartToken: token },
      { delay: 60 * 60 * 1000, jobId: `cart-abandon.${token}`, removeOnComplete: true },
    );

    return this.getOrCreate(token);
  }

  // ── Update item quantity ───────────────────────────────────────────────────

  async updateItem(token: string, itemId: string, quantity: number): Promise<any> {
    if (quantity < 1) return this.removeItem(token, itemId);

    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i: CartItem) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');

    const inventory = await this.inventoryRepo.findOneBy({ variantId: item.variantId });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    item.quantity = quantity;
    await this.itemRepo.save(item);
    return this.getOrCreate(token);
  }

  // ── Remove item ────────────────────────────────────────────────────────────

  async removeItem(token: string, itemId: string): Promise<any> {
    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i: CartItem) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.itemRepo.remove(item);
    return this.getOrCreate(token);
  }

  // ── Validate coupon ────────────────────────────────────────────────────────

  async validateCoupon(code: string, subtotalCents: number): Promise<{
    valid: boolean;
    discountCents: number;
    type: string;
    message?: string;
  }> {
    const promo = await this.promoRepo.findOneBy({ code, isActive: true });
    if (!promo) return { valid: false, discountCents: 0, type: '', message: 'Invalid coupon code' };

    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) return { valid: false, discountCents: 0, type: '', message: 'Coupon not yet active' };
    if (promo.expiresAt && promo.expiresAt < now) return { valid: false, discountCents: 0, type: '', message: 'Coupon has expired' };
    if (promo.maxUsesTotal !== null && promo.usesCount >= promo.maxUsesTotal) {
      return { valid: false, discountCents: 0, type: '', message: 'Coupon usage limit reached' };
    }
    if (promo.minOrderCents !== null && subtotalCents < promo.minOrderCents) {
      return { valid: false, discountCents: 0, type: promo.discountType, message: `Minimum order amount not met` };
    }

    let discountCents = 0;
    if (promo.discountType === 'percentage') {
      discountCents = Math.floor(subtotalCents * promo.discountValue / 100);
    } else if (promo.discountType === 'fixed_amount') {
      discountCents = Math.min(promo.discountValue, subtotalCents);
    }

    return { valid: true, discountCents, type: promo.discountType };
  }

  // ── Mark completed (called when order is created) ─────────────────────────

  async markCompleted(token: string): Promise<void> {
    await this.cartRepo.update({ token }, { status: 'completed' });
    // Cancel pending abandonment job — cart is no longer abandoned
    const job = await this.abandonmentQueue.getJob(`cart-abandon.${token}`);
    if (job) await job.remove();
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async ensureActiveCart(token: string): Promise<Cart & { items: CartItem[] }> {
    const cart = await this.cartRepo.findOne({
      where: { token, status: 'active' },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    return cart as Cart & { items: CartItem[] };
  }

  private async enrichCart(cart: Cart, lang?: string): Promise<any> {
    const items = (cart.items ?? []) as CartItem[];
    const imageKeys = items.map(i => i.imageKeySnapshot).filter(Boolean) as string[];
    const urlMap = await this.assetUrlService.resolveBatch(imageKeys);

    const productIds = [...new Set(items.map(i => i.productId))];
    const products = productIds.length
      ? await this.productRepo.find({ where: { id: In(productIds) } })
      : [];
    const slugMap = new Map(products.map(p => [p.id, p.slug]));

    let enrichedItems = items.map(item => ({
      ...item,
      imageUrl: item.imageKeySnapshot ? (urlMap.get(item.imageKeySnapshot) ?? null) : null,
      lineTotalCents: item.quantity * item.unitPriceCents,
      productSlug: slugMap.get(item.productId) ?? null,
    }));

    // Translate optionsSnapshot attribute names and display values for non-FR locales
    if (lang) {
      const uniqueAttrIds   = [...new Set(
        enrichedItems.flatMap(i => (i.optionsSnapshot ?? []).map((o: any) => o.attributeId).filter(Boolean)),
      )] as string[];
      const uniqueOptionIds = [...new Set(
        enrichedItems.flatMap(i => (i.optionsSnapshot ?? []).map((o: any) => o.optionValueId).filter(Boolean)),
      )] as string[];

      const [attrTranslated, optionTranslated] = await Promise.all([
        uniqueAttrIds.length
          ? this.translationsService.applyToEntities(
              uniqueAttrIds.map(id => ({ id })) as any[], ET_SHOP_VARIANT_ATTR, lang,
            )
          : Promise.resolve([]),
        uniqueOptionIds.length
          ? this.translationsService.applyToEntities(
              uniqueOptionIds.map(id => ({ id })) as any[], ET_SHOP_VARIATION_OPTION, lang,
            )
          : Promise.resolve([]),
      ]);

      const attrMap   = new Map((attrTranslated   as any[]).map(r => [r.id, r]));
      const optionMap = new Map((optionTranslated as any[]).map(r => [r.id, r]));

      enrichedItems = enrichedItems.map(item => ({
        ...item,
        optionsSnapshot: (item.optionsSnapshot ?? []).map((o: any) => ({
          ...o,
          attributeName: (attrMap.get(o.attributeId) as any)?.name           ?? o.attributeName,
          displayValue:  o.optionValueId
            ? ((optionMap.get(o.optionValueId) as any)?.displayValue ?? o.displayValue)
            : o.displayValue,
        })),
      }));
    }

    const subtotalCents = enrichedItems.reduce((sum, i) => sum + i.lineTotalCents, 0);

    return {
      ...cart,
      items: enrichedItems,
      subtotalCents,
      itemCount: enrichedItems.reduce((sum, i) => sum + i.quantity, 0),
    };
  }
}
