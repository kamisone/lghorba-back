import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import { ProductOptionValueImage } from '../entities/product-option-value-image.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';
import { TranslationsService } from '../../translations/translations.service';
import {
  ET_SHOP_VARIANT_ATTR,
  ET_SHOP_VARIATION_OPTION,
} from '../../common/entity-types';
import { CART_ABANDONMENT_QUEUE } from './cart-abandonment.constants';
import {
  resolveVariantPrice,
  sumOptionAdjustments,
} from '../pricing/variant-price';
import { MetaCapiService } from '../../marketing/meta-capi/meta-capi.service';
import { BehaviorTrackingService } from '../behavior/behavior-tracking.service';
import { GeoIpService } from '../behavior/geo-ip.service';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly itemRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(ShopPromotion)
    private readonly promoRepo: Repository<ShopPromotion>,
    @InjectRepository(VariationOptionValue)
    private readonly ovRepo: Repository<VariationOptionValue>,
    @InjectRepository(ProductOptionValueImage)
    private readonly optionImageRepo: Repository<ProductOptionValueImage>,
    private readonly assetUrlService: AssetUrlService,
    private readonly translationsService: TranslationsService,
    @InjectQueue(CART_ABANDONMENT_QUEUE)
    private readonly abandonmentQueue: Queue,
    // Direct call, not event-driven: unlike checkout/payment there's no domain
    // event for "item added to cart" to react to, and adding one just for this
    // analytics side effect would be overkill.
    private readonly metaCapi: MetaCapiService,
    private readonly behaviorTracking: BehaviorTrackingService,
    private readonly geoIp: GeoIpService,
  ) {}

  // ── Get or create cart by token ────────────────────────────────────────────
  // Read-only: never persists a row. A visitor merely loading the shop (every
  // page view calls this) must not create DB rows — a real Cart row is only
  // ever written the first time an item is actually added, in
  // getOrCreatePersistedCart() below.

  async getOrCreate(
    token: string,
    userId?: string,
    lang?: string,
  ): Promise<any> {
    const existing = await this.cartRepo.findOne({
      where: { token },
      relations: ['items'],
    });

    if (existing && existing.status === 'active') {
      if (userId && !existing.userId) {
        existing.userId = userId;
        await this.cartRepo.save(existing);
      }
      return this.enrichCart(existing, lang);
    }

    // No active cart persisted for this token yet — either it never existed,
    // or the existing one is no longer active (completed / abandoned /
    // merged) and needs a fresh token so the frontend can reset its state.
    // Return a virtual, unsaved empty cart rather than writing a row.
    const virtualCart = {
      id: null,
      token: existing ? randomUUID() : token,
      userId: userId ?? null,
      status: 'active',
      items: [],
    } as unknown as Cart;

    return this.enrichCart(virtualCart, lang);
  }

  // ── Add item ───────────────────────────────────────────────────────────────

  async addItem(
    token: string,
    variantId: string,
    quantity: number,
    selectedOptionValueIds?: string[],
    requestMeta?: { ip: string | null; userAgent: string | null },
  ): Promise<any> {
    if (quantity < 1)
      throw new BadRequestException('Quantity must be at least 1');

    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: [
        'product',
        'options',
        'options.attribute',
        'options.optionValue',
      ],
    });
    if (!variant) throw new NotFoundException('Variant not found');
    if ((variant as any).product?.status !== 'active')
      throw new BadRequestException('Product is not available');
    const productId = (variant as any).product?.id as string | undefined;

    const inventory = await this.inventoryRepo.findOneBy({ variantId });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        available: inventory?.available ?? 0,
      });
    }

    const cart = await this.getOrCreatePersistedCart(token);
    const metaEventId = randomUUID();

    const existing = cart.items.find(
      (i: CartItem) => i.variantId === variantId,
    );
    let trackUnitPriceCents: number;
    if (existing) {
      const newQty = existing.quantity + quantity;
      if (inventory.available < newQty) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          available: inventory.available,
        });
      }
      existing.quantity = newQty;
      await this.itemRepo.save(existing);
      trackUnitPriceCents = existing.unitPriceCents;
    } else {
      const product = (variant as any).product as Product;

      // Build options snapshot.
      // Priority: caller-supplied IDs (user manually picked options) → variant's own
      // option relations (default variant added directly from listing/default selection).
      // This ensures the cart always shows which options were chosen, even when the
      // client didn't pass selectedOptionValueIds (e.g. "Add to cart" on listing page).
      let optionsSnapshot: Array<{
        attributeId: string;
        attributeName: string;
        optionValueId: string | null;
        value: string;
        displayValue: string | null;
      }> | null = null;

      if (selectedOptionValueIds?.length) {
        const ovRows = await this.ovRepo.find({
          where: { id: In(selectedOptionValueIds) },
          relations: ['attribute'],
        });
        optionsSnapshot = ovRows.map((ov) => ({
          attributeId: ov.attributeId,
          attributeName: ov.attribute?.name ?? '',
          optionValueId: ov.id,
          value: ov.value,
          displayValue: ov.displayValue,
        }));
      } else {
        const variantOptions = (variant as any).options as
          | Array<{
              attributeId: string;
              optionValueId: string | null;
              value: string;
              attribute?: { name: string };
              optionValue?: { displayValue: string | null } | null;
            }>
          | undefined;

        if (variantOptions?.length) {
          optionsSnapshot = variantOptions
            .filter((o) => o.attribute)
            .map((o) => ({
              attributeId: o.attributeId,
              attributeName: o.attribute?.name ?? '',
              optionValueId: o.optionValueId,
              value: o.value,
              displayValue: o.optionValue?.displayValue ?? null,
            }));
        }
      }

      // Resolve effective unit price using the three-tier model:
      // variant override → product base + option adjustments
      const unitPriceCents = resolveVariantPrice({
        variantPriceCents: variant.priceCents,
        basePriceCents: (product as any).basePriceCents ?? null,
        optionAdjustmentCents: sumOptionAdjustments(
          (variant as any).options ?? [],
        ),
      });

      // Image priority mirrors the PDP hero (ShopProductDetail.tsx): the variant's own
      // featured media, then the picked option value's per-product image override
      // (e.g. Color=Red's photo), then the product's generic featured image.
      let imageKeySnapshot: string | null =
        (variant as any).featuredMediaKey ?? null;
      if (!imageKeySnapshot && optionsSnapshot?.length) {
        const optionValueIds = optionsSnapshot
          .map((o) => o.optionValueId)
          .filter(Boolean) as string[];
        if (optionValueIds.length) {
          const optionImage = await this.optionImageRepo.findOne({
            where: { productId: product.id, optionValueId: In(optionValueIds) },
          });
          imageKeySnapshot = optionImage?.mediaKey ?? null;
        }
      }
      imageKeySnapshot = imageKeySnapshot ?? product.featuredImageKey ?? null;

      await this.itemRepo.save(
        this.itemRepo.create({
          cartId: cart.id,
          productId: product.id,
          variantId: variant.id,
          quantity,
          unitPriceCents,
          titleSnapshot: product.title,
          skuSnapshot: variant.sku,
          imageKeySnapshot,
          optionsSnapshot,
          compareAtPriceCentsSnapshot: variant.compareAtPriceCents ?? null,
        }),
      );
      trackUnitPriceCents = unitPriceCents;
    }

    // Meta Pixel: value/currency/ids only — never customer PII. Value reflects
    // what was just added (unit price × quantity added), not the cart's total
    // line value, matching Meta's "AddToCart" convention.
    await this.metaCapi.sendEvent({
      eventName: 'AddToCart',
      eventId: metaEventId,
      eventSourceUrl: `${process.env.APP_URL ?? ''}/shop`,
      customData: {
        content_type: 'product',
        content_ids: [variantId],
        value: (trackUnitPriceCents * quantity) / 100,
        currency: 'EUR',
        num_items: quantity,
      },
      clientIpAddress: requestMeta?.ip ?? null,
      clientUserAgent: requestMeta?.userAgent ?? null,
    });

    await this.behaviorTracking.record('add_to_cart', {
      cartToken: token,
      productId: productId ?? null,
      quantity,
      countryCode: this.geoIp.countryFromIp(requestMeta?.ip),
    });

    // Schedule abandonment email — delay 1h, jobId ensures only one pending per cart
    await this.abandonmentQueue.add(
      'abandon',
      { cartToken: token },
      {
        delay: 60 * 60 * 1000,
        jobId: `cart-abandon.${token}`,
        removeOnComplete: true,
      },
    );

    const cartData = await this.getOrCreate(token);
    // Shared with the CAPI call above so the frontend's browser-side fbq()
    // AddToCart call can use the same eventID for Meta's dedup.
    return { ...cartData, metaAddToCartEventId: metaEventId };
  }

  // ── Update item quantity ───────────────────────────────────────────────────

  async updateItem(
    token: string,
    itemId: string,
    quantity: number,
    clientIp?: string | null,
  ): Promise<any> {
    if (quantity < 1) return this.removeItem(token, itemId, clientIp);

    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i: CartItem) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');

    const inventory = await this.inventoryRepo.findOneBy({
      variantId: item.variantId,
    });
    if (!inventory || inventory.available < quantity) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        available: inventory?.available ?? 0,
      });
    }

    item.quantity = quantity;
    await this.itemRepo.save(item);
    await this.behaviorTracking.record('update_cart_item', {
      cartToken: token,
      productId: item.productId,
      quantity,
      countryCode: this.geoIp.countryFromIp(clientIp),
    });
    return this.getOrCreate(token);
  }

  // ── Remove item ────────────────────────────────────────────────────────────

  async removeItem(token: string, itemId: string, clientIp?: string | null): Promise<any> {
    const cart = await this.ensureActiveCart(token);
    const item = cart.items.find((i: CartItem) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    await this.itemRepo.remove(item);
    await this.behaviorTracking.record('remove_from_cart', {
      cartToken: token,
      productId: item.productId,
      quantity: item.quantity,
      countryCode: this.geoIp.countryFromIp(clientIp),
    });
    return this.getOrCreate(token);
  }

  // ── Validate coupon ────────────────────────────────────────────────────────

  async validateCoupon(
    code: string,
    subtotalCents: number,
  ): Promise<{
    valid: boolean;
    discountCents: number;
    type: string;
    message?: string;
  }> {
    const promo = await this.promoRepo.findOneBy({ code, isActive: true });
    if (!promo)
      return {
        valid: false,
        discountCents: 0,
        type: '',
        message: 'Invalid coupon code',
      };

    const now = new Date();
    if (promo.startsAt && promo.startsAt > now)
      return {
        valid: false,
        discountCents: 0,
        type: '',
        message: 'Coupon not yet active',
      };
    if (promo.expiresAt && promo.expiresAt < now)
      return {
        valid: false,
        discountCents: 0,
        type: '',
        message: 'Coupon has expired',
      };
    if (promo.maxUsesTotal !== null && promo.usesCount >= promo.maxUsesTotal) {
      return {
        valid: false,
        discountCents: 0,
        type: '',
        message: 'Coupon usage limit reached',
      };
    }
    if (promo.minOrderCents !== null && subtotalCents < promo.minOrderCents) {
      return {
        valid: false,
        discountCents: 0,
        type: promo.discountType,
        message: `Minimum order amount not met`,
      };
    }

    let discountCents = 0;
    if (promo.discountType === 'percentage') {
      discountCents = Math.floor((subtotalCents * promo.discountValue) / 100);
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

  private async ensureActiveCart(
    token: string,
  ): Promise<Cart & { items: CartItem[] }> {
    const cart = await this.cartRepo.findOne({
      where: { token, status: 'active' },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    return cart as Cart & { items: CartItem[] };
  }

  // The one place a Cart row is ever persisted — the first real mutation
  // (adding an item) for a given token, not a bare page-view GET.
  private async getOrCreatePersistedCart(
    token: string,
  ): Promise<Cart & { items: CartItem[] }> {
    const existing = await this.cartRepo.findOne({
      where: { token },
      relations: ['items'],
    });

    if (existing) {
      // Same behavior as ensureActiveCart() for a non-active row at this
      // token: the frontend must fetch a fresh token via GET first (its
      // unique index means we can't silently reuse this token for a new row).
      if (existing.status !== 'active') {
        throw new NotFoundException('Active cart not found');
      }
      return existing as Cart & { items: CartItem[] };
    }

    const cart = await this.cartRepo.save(
      this.cartRepo.create({ token, status: 'active' }),
    );
    return { ...cart, items: [] } as Cart & { items: CartItem[] };
  }

  private async enrichCart(cart: Cart, lang?: string): Promise<any> {
    const items = (cart.items ?? []) as CartItem[];
    const imageKeys = items
      .map((i) => i.imageKeySnapshot)
      .filter(Boolean) as string[];
    const urlMap = await this.assetUrlService.resolveBatch(imageKeys);

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
      ? await this.productRepo.find({ where: { id: In(productIds) } })
      : [];
    const slugMap = new Map(products.map((p) => [p.id, p.slug]));

    let enrichedItems = items.map((item) => ({
      ...item,
      imageUrl: item.imageKeySnapshot
        ? urlMap.get(item.imageKeySnapshot) ?? null
        : null,
      lineTotalCents: item.quantity * item.unitPriceCents,
      productSlug: slugMap.get(item.productId) ?? null,
    }));

    // Translate optionsSnapshot attribute names and display values for non-FR locales
    if (lang) {
      const uniqueAttrIds = [
        ...new Set(
          enrichedItems.flatMap((i) =>
            (i.optionsSnapshot ?? [])
              .map((o: any) => o.attributeId)
              .filter(Boolean),
          ),
        ),
      ] as string[];
      const uniqueOptionIds = [
        ...new Set(
          enrichedItems.flatMap((i) =>
            (i.optionsSnapshot ?? [])
              .map((o: any) => o.optionValueId)
              .filter(Boolean),
          ),
        ),
      ] as string[];

      const [attrTranslated, optionTranslated] = await Promise.all([
        uniqueAttrIds.length
          ? this.translationsService.applyToEntities(
              uniqueAttrIds.map((id) => ({ id })) as any[],
              ET_SHOP_VARIANT_ATTR,
              lang,
            )
          : Promise.resolve([]),
        uniqueOptionIds.length
          ? this.translationsService.applyToEntities(
              uniqueOptionIds.map((id) => ({ id })) as any[],
              ET_SHOP_VARIATION_OPTION,
              lang,
            )
          : Promise.resolve([]),
      ]);

      const attrMap = new Map((attrTranslated as any[]).map((r) => [r.id, r]));
      const optionMap = new Map(
        (optionTranslated as any[]).map((r) => [r.id, r]),
      );

      enrichedItems = enrichedItems.map((item) => ({
        ...item,
        optionsSnapshot: (item.optionsSnapshot ?? []).map((o: any) => ({
          ...o,
          attributeName:
            (attrMap.get(o.attributeId) as any)?.name ?? o.attributeName,
          displayValue: o.optionValueId
            ? (optionMap.get(o.optionValueId) as any)?.displayValue ??
              o.displayValue
            : o.displayValue,
        })),
      }));
    }

    const subtotalCents = enrichedItems.reduce(
      (sum, i) => sum + i.lineTotalCents,
      0,
    );

    return {
      ...cart,
      items: enrichedItems,
      subtotalCents,
      itemCount: enrichedItems.reduce((sum, i) => sum + i.quantity, 0),
    };
  }
}
