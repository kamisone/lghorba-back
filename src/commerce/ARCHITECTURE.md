# Commerce Domain Architecture

## Assessment: existing vs requested

The existing system is already a production-grade multi-vendor ecommerce platform.
Most requested entities already exist under domain-appropriate names.
The changes below close the genuine gaps without rewriting working code.

---

## Domain Map & Entity Ownership

```
┌─────────────────────────────────────────────────────────────────────┐
│  CATALOG domain                                                     │
│  Product             → shop_products                                │
│  ProductVariant      → shop_product_variants   (= product_item)     │
│  ProductCategory     → shop_product_categories                      │
│  ProductTag          → shop_product_tags                            │
│  VariantAttribute    → shop_variant_attributes (= variation)        │
│  VariantOption       → shop_variant_options    (= product_config)   │
│  VariationOptionValue→ shop_variation_option_values (NEW)           │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  INVENTORY domain                                                   │
│  InventoryItem       → shop_inventory_items                         │
│  InventoryMovement   → shop_inventory_movements                     │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  CART domain                                                        │
│  Cart                → shop_carts              (= shopping_cart)    │
│  CartItem            → shop_cart_items         (= shopping_cart_item)│
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  ORDERS domain                                                      │
│  Order               → shop_orders             (= shop_order)       │
│  OrderItem           → shop_order_items        (= order_line)       │
│  OrderStatusHistory  → shop_order_status_history (= order_status)   │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  PAYMENTS domain                                                    │
│  PaymentTransaction  → shop_payment_transactions                    │
│  PaymentType         → shop_payment_types      (NEW)               │
│  UserPaymentMethod   → shop_user_payment_methods (NEW)             │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMERS domain                                                   │
│  ShopCustomer        → shop_customers          (= site_user)        │
│  ShopCustomerAddress → shop_customer_addresses (= user_address)     │
│  Address             → shop_addresses          (NEW, = address)     │
│  Country             → shop_countries          (NEW)               │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  PROMOTIONS domain                                                  │
│  ShopPromotion       → shop_promotions         (= promotion)        │
│  PromotionCategory   → shop_promotion_categories (NEW)             │
│  ShopPriceRule       → shop_price_rules                             │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  SHIPPING domain                                                    │
│  ShippingZone        → shop_shipping_zones                          │
│  ShippingMethod      → shop_shipping_methods   (= shipping_method)  │
│  Shipment            → shop_shipments                               │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  REVIEWS domain                                                     │
│  ProductReview       → shop_product_reviews    (= user_review)      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Entity Relationship Map

```
Country ←── ShippingZone.countryCodes (string array, denormalized for now)
         └─ ShopCustomerAddress.country (ISO code, FK-upgradeable)
         └─ Address.countryCode (ISO code, joins Country)

Address ←── ShopCustomerAddress.addressId (nullable FK, backward compat)
        └── UserPaymentMethod.billingAddressId

PaymentType ←── UserPaymentMethod.paymentTypeId

PromotionCategory ←── ShopPromotion.promotionCategoryId

VariantAttribute ──→ VariationOptionValue[] (controlled vocabulary)
                         ↑
VariantOption.optionValueId ──┘  (product_configuration link)
ProductVariant ──→ VariantOption[] (one per variation dimension)

Product ──→ ProductVariant[] (product_item)
         └─ ProductCategory (m2m + primary FK)
         └─ InventoryItem (via variant)

Cart ──→ CartItem[] (snapshots: title, sku, imageKey, unitPrice)
Order ──→ OrderItem[] (snapshots: title, sku, imageKey, unitPrice, tax)
       └─ OrderStatusHistory[]
       └─ PaymentTransaction[]
       └─ Shipment[]

ShopCustomer ──→ ShopCustomerAddress[]
              └─ UserPaymentMethod[]
```

---

## New Entities (Phase 1 — implemented)

| Entity | Table | Purpose |
|--------|-------|---------|
| Country | shop_countries | ISO 3166-1 reference; drives checkout country pickers, tax zones, shipping availability |
| Address | shop_addresses | Reusable, immutable-after-reference address records |
| PaymentType | shop_payment_types | Payment method type reference (card, PayPal, SEPA…) |
| UserPaymentMethod | shop_user_payment_methods | Stripe PM tokens per customer; never raw card data |
| PromotionCategory | shop_promotion_categories | Campaign grouping for analytics + admin UX |
| VariationOptionValue | shop_variation_option_values | Predefined vocabulary per variation axis |

---

## Updated Entities (backward-compatible changes)

| Entity | Change |
|--------|--------|
| ShopCustomerAddress | +`addressId` FK (nullable, legacy rows unaffected) |
| ShopPromotion | +`promotionCategoryId` FK (nullable) |
| VariantAttribute | +`displayType`, `sortOrder`, `isActive`, `optionValues` relation |
| VariantOption | +`optionValueId` FK (nullable), keeps free-text `value` for compat |

---

## Migration Strategy

### Phase 1 — New tables (zero disruption, this PR)
- Create 6 new entity tables via TypeORM `synchronize` or migration
- All new FKs are nullable → zero impact on existing data
- Seed `shop_countries` with `COUNTRY_SEED` data
- Seed `shop_payment_types` with initial set (card, paypal, apple_pay, google_pay)

### Phase 2 — Address normalization
```sql
-- For each ShopCustomerAddress, create an Address row and backfill addressId
INSERT INTO shop_addresses (id, "fullName", line1, line2, city, "postalCode", "countryCode", "isLocked", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, line1, line2, city, zip, country, false, now(), now()
FROM shop_customer_addresses;

UPDATE shop_customer_addresses sca
SET "addressId" = a.id
FROM shop_addresses a
WHERE a."fullName" = sca.name
  AND a.line1 = sca.line1
  AND a.city = sca.city
  AND a.zip = sca."postalCode"
  AND a."countryCode" = sca.country;
```
After validation: enforce NOT NULL on `addressId`, deprecate inline fields.

### Phase 3 — Variation vocabulary migration
```sql
-- Seed VariationOptionValues from distinct existing values
INSERT INTO shop_variation_option_values (id, "attributeId", value, "displayValue", "sortOrder", "isActive")
SELECT gen_random_uuid(), "attributeId", value, value, ROW_NUMBER() OVER (PARTITION BY "attributeId" ORDER BY value), true
FROM (SELECT DISTINCT "attributeId", value FROM shop_variant_options) AS distinct_values
ON CONFLICT ("attributeId", value) DO NOTHING;

-- Backfill optionValueId on VariantOption
UPDATE shop_variant_options vo
SET "optionValueId" = ov.id
FROM shop_variation_option_values ov
WHERE ov."attributeId" = vo."attributeId"
  AND ov.value = vo.value;
```
After validation: enforce NOT NULL on `optionValueId`, deprecate free-text `value`.

### Phase 4 — UserPaymentMethod population
- Wire Stripe webhook `customer.updated` to sync payment methods
- On successful payment, if customer opts in: create `UserPaymentMethod` row
- Update checkout flow to offer saved payment method selection

---

## Domain Boundaries: What Owns What

| Concern | Owner | Rule |
|---------|-------|------|
| Inventory reservation | InventoryService | Exclusive write access; pessimistic lock |
| Price computation | PriceRuleService + CheckoutService | No price logic outside these two |
| Order state transitions | OrdersService | ALLOWED_TRANSITIONS state machine |
| Cart lifecycle | CartService | Owns token, expiry, abandonment |
| Payment secrets | ShopPaymentService | Only service that calls Stripe SDK |
| Address immutability | Address.isLocked | Set on order creation; never mutated after |
| Coupon validation | CartService.validateCoupon | Single source of truth |
| Promotion analytics | PromotionCategory | Segmentation key for revenue attribution |

---

## Event-Driven Integration (existing + extensions)

```
cart.updated         → CartService     → abandonment queue (1h delay)
order.created        → CheckoutService → inventory.reserved, email.order_confirmation
order.status_changed → OrdersService   → email.shipping_update, analytics.order
payment.succeeded    → Stripe webhook  → order.confirmPayment, inventory.confirmSale
inventory.restocked  → InventoryService→ wishlist.notify (future), stockAlert
review.submitted     → ReviewsService → moderation queue (future)
promotion.applied    → CheckoutService → analytics.promotion_impact (future)
```

---

## Scalability Notes

1. **Marketplace**: `vendorId` on Product and OrderItem already in place.
   Vendor payouts (ShopVendorPayout) track split per order line.

2. **Internationalization**: Translation.entity.ts pattern supports all
   customer-facing labels. Country entity provides locale/currency mapping.
   ShippingMethod names, VariantAttribute labels, PromotionCategory names
   can all be translated via the existing translation infrastructure.

3. **Search**: ProductSearchService (Meilisearch) already indexes products.
   VariationOptionValue.value is now structured → enables faceted variation
   filtering in search (color:black, size:L).

4. **Analytics**: CommerceEventLog captures all domain events with entityId
   + payload. PromotionCategory.id on ShopPromotion enables revenue-by-campaign
   queries without joining raw promotion tables.

5. **Guest → Auth merge**: Cart (token-based) + Wishlist (sessionToken) both
   support merge-on-login patterns. UserPaymentMethod links to ShopCustomer
   which in turn links to platform userId.
