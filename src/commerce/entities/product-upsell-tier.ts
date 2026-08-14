/**
 * A quantity-price tier for a product with upselling enabled — "buy N, pay
 * X each". Only takes effect while `Product.upsellingEnabled` is true; the
 * highest-quantity active tier whose threshold a cart line's quantity meets
 * or exceeds wins (see resolveUnitPriceForQuantity in ../pricing/variant-price).
 */
export interface ProductUpsellTier {
  id: string;
  /** Minimum quantity required for this tier's price to apply. */
  quantity: number;
  unitPriceCents: number;
  active: boolean;
  sortOrder: number;
}
