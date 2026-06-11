import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { MediaModule } from '../media/media.module';
import { PaymentsModule } from '../payments/payments.module';
import { DlqModule } from '../dlq/dlq.module';
import { TranslationsModule } from '../translations/translations.module';

// Entities
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { ProductTag } from './entities/product-tag.entity';
import { VariantAttribute } from './entities/variant-attribute.entity';
import { VariantOption } from './entities/variant-option.entity';
import { VariationOptionValue } from './entities/variation-option-value.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { ShippingZone } from './entities/shipping-zone.entity';
import { ShippingMethod } from './entities/shipping-method.entity';
import { Shipment } from './entities/shipment.entity';
import { ProductReview } from './entities/product-review.entity';
import { ShopPromotion } from './entities/shop-promotion.entity';
import { ShopCustomer } from './entities/shop-customer.entity';
import { ShopCustomerAddress } from './entities/shop-customer-address.entity';
import { Address } from './entities/address.entity';
import { Country } from './entities/country.entity';
import { UserPaymentMethod } from './entities/user-payment-method.entity';
import { PaymentType } from './entities/payment-type.entity';
import { ShopCollection } from './entities/shop-collection.entity';
import { ShopCollectionProduct } from './entities/shop-collection-product.entity';
import { ShopWishlistItem } from './entities/shop-wishlist-item.entity';
import { ShopPriceRule } from './entities/shop-price-rule.entity';
import { BlogProductReference } from './entities/blog-product-reference.entity';
import { CommerceEventLog } from './events/commerce-event-log.entity';
import { PromotionCategory } from './entities/promotion-category.entity';
import { PromotionProduct } from './entities/promotion-product.entity';
import { OrderStatusRef } from './entities/order-status-ref.entity';
import { ShopCustomerGroup } from './entities/shop-customer-group.entity';
import { ProductVariantAttribute } from './entities/product-variant-attribute.entity';
import { ProductOptionValueImage } from './entities/product-option-value-image.entity';

// Services
import { ProductService } from './catalog/product.service';
import { InventoryService } from './inventory/inventory.service';
import { CartService } from './cart/cart.service';
import { OrdersService } from './orders/orders.service';
import { CustomerService } from './customer/customer.service';
import { CollectionService } from './merchandising/collection.service';
import { ShopPaymentService } from './payment/shop-payment.service';
import { ShippingService } from './shipping/shipping.service';
import { ReviewsService } from './reviews/reviews.service';
import { ShopAnalyticsService } from './analytics/shop-analytics.service';
import { WishlistService } from './wishlist/wishlist.service';
import { PriceRuleService } from './pricing/price-rule.service';
import { ShopEmailService } from './email/shop-email.service';
import { ShopOrderEventsListener } from './orders/shop-order-events.listener';
import { DocumentsModule } from '../documents/documents.module';
import { CartAbandonmentProcessor } from './cart/cart-abandonment.processor';
import { BlogProductReferenceService } from './content/blog-product-reference.service';
import { CART_ABANDONMENT_QUEUE } from './cart/cart-abandonment.constants';
import { CheckoutService } from './checkout/checkout.service';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutReservationProcessor } from './checkout/checkout-reservation.processor';
import { CHECKOUT_RESERVATION_QUEUE } from './checkout/checkout-reservation.constants';
import { ProductSearchService } from './catalog/product-search.service';
import { RecommendationService } from './catalog/recommendation.service';
import { ShopAnalyticsAggregatorService } from './analytics/shop-analytics-aggregator.service';
import { StockAlertService } from './inventory/stock-alert.service';
import { CommerceEventBus } from './events/commerce-event-bus.service';
import { ShopPromotionService } from './pricing/shop-promotion.service';
import { PricingEngineService } from './pricing/pricing-engine.service';
import { CategoryAdminController } from './catalog/category-admin.controller';
import { CartAdminController } from './cart/cart-admin.controller';
import { ShopPromotionAdminController } from './pricing/shop-promotion.controller';
import { PromotionPublicController } from './pricing/promotion-public.controller';
import { CountryService } from './catalog/country.service';
import { CountryPublicController, CountryAdminController } from './catalog/country.controller';
import { PaymentTypeAdminController } from './payment/payment-type.controller';
import { VariantAttributeAdminController, VariantAttributePublicController } from './catalog/variant-attribute.controller';
import { UserPaymentMethodAdminController } from './payment/user-payment-method.controller';
import { OrderStatusRefAdminController } from './orders/order-status-ref.controller';
import { PaymentTransactionAdminController } from './payment/payment-transaction.controller';
import { ShipmentAdminController } from './shipping/shipment.controller';
import { CustomerGroupAdminController } from './customer/customer-group.controller';
import { CommerceEventLogAdminController } from './events/commerce-event-log.controller';

// Controllers
import { ProductAdminController } from './catalog/product-admin.controller';
import { ProductPublicController } from './catalog/product-public.controller';
import { VariantStockController } from './catalog/variant-stock.controller';
import { InventoryAdminController } from './inventory/inventory.controller';
import { CartController } from './cart/cart.controller';
import { OrdersAdminController } from './orders/orders-admin.controller';
import { OrdersPublicController } from './orders/orders-public.controller';
import { CustomerAdminController } from './customer/customer.controller';
import { CollectionAdminController, CollectionPublicController } from './merchandising/collection.controller';
import { ShopPaymentController } from './payment/shop-payment.controller';
import { ShippingAdminController, ShippingPublicController } from './shipping/shipping.controller';
import { ReviewsAdminController, ReviewsPublicController } from './reviews/reviews.controller';
import { ShopAnalyticsController } from './analytics/shop-analytics.controller';
import { WishlistController } from './wishlist/wishlist.controller';
import { PriceRuleAdminController } from './pricing/price-rule.controller';
import { BlogProductReferenceAdminController, BlogProductReferencePublicController } from './content/blog-product-reference.controller';
import { ProductSearchPublicController, ProductSearchAdminController } from './catalog/product-search.controller';

const ENTITIES = [
  // Catalog
  Product, ProductVariant, ProductCategory, ProductTag,
  // Variations (product_configuration domain)
  VariantAttribute, VariantOption, VariationOptionValue, ProductVariantAttribute, ProductOptionValueImage,
  // Inventory
  InventoryItem, InventoryMovement,
  // Cart (shopping_cart domain)
  Cart, CartItem,
  // Orders (shop_order domain)
  Order, OrderItem, OrderStatusHistory,
  // Payments (payment domain)
  PaymentTransaction, PaymentType, UserPaymentMethod,
  // Shipping
  ShippingZone, ShippingMethod, Shipment,
  // Reviews
  ProductReview,
  // Promotions
  ShopPromotion,
  // Customers + Address domain
  ShopCustomer, ShopCustomerAddress, Address, Country,
  // Merchandising
  ShopCollection, ShopCollectionProduct,
  // Wishlist
  ShopWishlistItem,
  // Pricing rules
  ShopPriceRule,
  // Content
  BlogProductReference,
  // Events
  CommerceEventLog,
  // Promotion scope junction tables
  PromotionCategory, PromotionProduct,
  // Order status reference table
  OrderStatusRef,
  // Customer groups
  ShopCustomerGroup,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    BullModule.registerQueue({ name: CART_ABANDONMENT_QUEUE }),
    BullModule.registerQueue({ name: CHECKOUT_RESERVATION_QUEUE }),
    DocumentsModule,
    GcsModule,
    AssetUrlModule,
    MediaModule,
    PaymentsModule,
    DlqModule,
    TranslationsModule,
  ],
  controllers: [
    ProductAdminController, ProductPublicController, VariantStockController,
    InventoryAdminController,
    CartController,
    OrdersAdminController, OrdersPublicController,
    CustomerAdminController,
    CollectionAdminController, CollectionPublicController,
    ShopPaymentController,
    ShippingAdminController, ShippingPublicController,
    ReviewsAdminController, ReviewsPublicController,
    ShopAnalyticsController,
    WishlistController,
    PriceRuleAdminController,
    BlogProductReferenceAdminController, BlogProductReferencePublicController,
    ProductSearchPublicController, ProductSearchAdminController,
    CategoryAdminController,
    CartAdminController,
    ShopPromotionAdminController,
    PromotionPublicController,
    CheckoutController,
    CountryPublicController,
    CountryAdminController,
    PaymentTypeAdminController,
    VariantAttributeAdminController,
    VariantAttributePublicController,
    UserPaymentMethodAdminController,
    OrderStatusRefAdminController,
    PaymentTransactionAdminController,
    ShipmentAdminController,
    CustomerGroupAdminController,
    CommerceEventLogAdminController,
  ],
  providers: [
    ProductService, InventoryService, CartService, OrdersService,
    CustomerService, CollectionService, ShopPaymentService, CountryService,
    ShippingService, ReviewsService, ShopAnalyticsService, WishlistService,
    PriceRuleService, ShopEmailService, ShopOrderEventsListener,
    CartAbandonmentProcessor, BlogProductReferenceService,
    ProductSearchService, RecommendationService,
    ShopAnalyticsAggregatorService,
    StockAlertService,
    CommerceEventBus,
    ShopPromotionService,
    PricingEngineService,
    CheckoutService,
    CheckoutReservationProcessor,
  ],
  exports: [
    ProductService, InventoryService, CartService, OrdersService,
    CustomerService, CollectionService, ReviewsService,
    PriceRuleService, ShopEmailService, BlogProductReferenceService,
    ProductSearchService, RecommendationService, ShopAnalyticsAggregatorService,
    CommerceEventBus, ShopPaymentService,
  ],
})
export class CommerceModule {}
