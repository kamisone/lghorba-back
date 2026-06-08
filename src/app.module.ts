import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module';
import { Admin } from './admins/admin.entity';
import { AdminsModule } from './admins/admins.module';
import { AuthModule } from './auth/auth.module';
import { Contact } from './contacts/contact.entity';
import { ContactsModule } from './contacts/contacts.module';
import { Translation } from './translations/translation.entity';
import { TranslationsModule } from './translations/translations.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CarDeliveryLocation } from './cars/car-delivery-location.entity';
import { CarPhoto } from './cars/car-photo.entity';
import { Car } from './cars/car.entity';
import { CarPricing } from './cars/car-pricing.entity';
import { Booking } from './bookings/booking.entity';
import { BookingsModule } from './bookings/bookings.module';
import { BookingExpirationModule } from './bookings/booking-expiration.module';
import { PaymentsModule } from './payments/payments.module';
import { CarsModule } from './cars/cars.module';
import { RedisModule } from './redis/redis.module';
import { AssetUrlModule } from './asset-url/asset-url.module';
import { DlqModule } from './dlq/dlq.module';
import { RentPosition } from './rent-sessions/rent-position.entity';
import { RentSession } from './rent-sessions/rent-session.entity';
import { RentSessionsModule } from './rent-sessions/rent-sessions.module';
import { SmsMessage } from './sms/sms-message.entity';
import { SmsController } from './sms/sms.controller';
import { SmsModule } from './sms/sms.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { BillingModule } from './billing/billing.module';
import { Invoice } from './billing/invoice.entity';
import { InvoiceLine } from './billing/invoice-line.entity';
import { TaxRate } from './billing/tax-rate.entity';
import { InvoiceAuditLog } from './billing/invoice-audit-log.entity';
import { GuestAccessModule } from './guest-access/guest-access.module';
import { GuestToken } from './guest-access/entities/guest-token.entity';
import { GuestTokenAuditLog } from './guest-access/entities/guest-token-audit.entity';
import { PageContent } from './page-content/page-content.entity';
import { PageContentModule } from './page-content/page-content.module';
import { VehicleAvailability } from './vehicle-availability/vehicle-availability.entity';
import { VehicleAvailabilityModule } from './vehicle-availability/vehicle-availability.module';
import { IngestedEmail } from './email-ingestion/entities/ingested-email.entity';
import { EmailIngestionModule } from './email-ingestion/email-ingestion.module';
import { VehicleHealthRecord } from './vehicle-health/entities/vehicle-health-record.entity';
import { VehicleHealthModule } from './vehicle-health/vehicle-health.module';
import { MaintenanceRecord } from './maintenance/entities/maintenance-record.entity';
import { MaintenanceType } from './maintenance/entities/maintenance-type.entity';
import { MaintenanceSupplier } from './maintenance/entities/maintenance-supplier.entity';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { OdometerReading } from './odometer/entities/odometer-reading.entity';
import { OdometerModule } from './odometer/odometer.module';
import { Inspection } from './inspections/entities/inspection.entity';
import { InspectionChecklistItem } from './inspections/entities/inspection-checklist-item.entity';
import { InspectionPhoto } from './inspections/entities/inspection-photo.entity';
import { InspectionsModule } from './inspections/inspections.module';
import { Incident } from './incidents/entities/incident.entity';
import { IncidentPhoto } from './incidents/entities/incident-photo.entity';
import { IncidentsModule } from './incidents/incidents.module';
import { FleetAnalyticsModule } from './fleet-analytics/fleet-analytics.module';
import { MaintenanceJobsModule } from './maintenance-jobs/maintenance-jobs.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { Promotion } from './promotions/promotion.entity';
import { PromotionUsage } from './promotions/promotion-usage.entity';
import { PromotionsModule } from './promotions/promotions.module';
import { NotificationSettings } from './booking-reminders/notification-settings.entity';
import { ReminderLog } from './booking-reminders/reminder-log.entity';
import { BookingRemindersModule } from './booking-reminders/booking-reminders.module';
import { PlatformSettings } from './platform-settings/platform-settings.entity';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { DateTimeModule } from './date-time/date-time.module';
import { ErrorCollectorModule } from './common/error-collector/error-collector.module';
import { SupportModule } from './support/support.module';
import { SupportConversation } from './support/entities/support-conversation.entity';
import { SupportMessage } from './support/entities/support-message.entity';
import { SupportNotificationLog } from './support/entities/support-notification-log.entity';
import { SupportAuditLog } from './support/entities/support-audit-log.entity';
import { VehicleFaq } from './vehicle-faqs/vehicle-faq.entity';
import { VehicleFaqsModule } from './vehicle-faqs/vehicle-faqs.module';
import { SpamLog } from './common/anti-spam/spam-log.entity';
import { Parking } from './parkings/parking.entity';
import { ParkingOwnerPhone } from './parkings/parking-owner-phone.entity';
import { ParkingDocument } from './parkings/parking-document.entity';
import { ParkingModule } from './parkings/parking.module';
import { BlogPost } from './blog/entities/blog-post.entity';
import { BlogCategory } from './blog/entities/blog-category.entity';
import { BlogTag } from './blog/entities/blog-tag.entity';
import { BlogModule } from './blog/blog.module';
import { CommerceModule } from './commerce/commerce.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { Product } from './commerce/entities/product.entity';
import { ProductVariant } from './commerce/entities/product-variant.entity';
import { ProductCategory } from './commerce/entities/product-category.entity';
import { ProductTag } from './commerce/entities/product-tag.entity';
import { VariantAttribute } from './commerce/entities/variant-attribute.entity';
import { VariantOption } from './commerce/entities/variant-option.entity';
import { ProductVariantAttribute } from './commerce/entities/product-variant-attribute.entity';
import { InventoryItem } from './commerce/entities/inventory-item.entity';
import { InventoryMovement } from './commerce/entities/inventory-movement.entity';
import { Cart } from './commerce/entities/cart.entity';
import { CartItem } from './commerce/entities/cart-item.entity';
import { Order } from './commerce/entities/order.entity';
import { OrderItem } from './commerce/entities/order-item.entity';
import { OrderStatusHistory } from './commerce/entities/order-status-history.entity';
import { PaymentTransaction } from './commerce/entities/payment-transaction.entity';
import { ShippingZone } from './commerce/entities/shipping-zone.entity';
import { ShippingMethod } from './commerce/entities/shipping-method.entity';
import { Shipment } from './commerce/entities/shipment.entity';
import { ProductReview } from './commerce/entities/product-review.entity';
import { ShopPromotion } from './commerce/entities/shop-promotion.entity';
import { ShopCustomer } from './commerce/entities/shop-customer.entity';
import { ShopCustomerAddress } from './commerce/entities/shop-customer-address.entity';
import { ShopCollection } from './commerce/entities/shop-collection.entity';
import { ShopCollectionProduct } from './commerce/entities/shop-collection-product.entity';
import { ShopWishlistItem } from './commerce/entities/shop-wishlist-item.entity';
import { ShopPriceRule } from './commerce/entities/shop-price-rule.entity';
import { BlogProductReference } from './commerce/entities/blog-product-reference.entity';
import { ShopVendor } from './commerce/entities/shop-vendor.entity';
import { ShopVendorPayout } from './commerce/entities/shop-vendor-payout.entity';
import { CommerceEventLog } from './commerce/events/commerce-event-log.entity';
import { VariationOptionValue } from './commerce/entities/variation-option-value.entity';
import { Address } from './commerce/entities/address.entity';
import { Country } from './commerce/entities/country.entity';
import { PaymentType } from './commerce/entities/payment-type.entity';
import { UserPaymentMethod } from './commerce/entities/user-payment-method.entity';
import { PromotionCategory } from './commerce/entities/promotion-category.entity';
import { PromotionProduct } from './commerce/entities/promotion-product.entity';
import { OrderStatusRef } from './commerce/entities/order-status-ref.entity';
import { ShopCustomerGroup } from './commerce/entities/shop-customer-group.entity';
import { MediaAsset } from './media/media-asset.entity';
import { MediaUsage } from './media/media-usage.entity';
import { MediaModule } from './media/media.module';
import { VendorModule } from './commerce/vendor/vendor.module';
import { MeilisearchModule } from './meilisearch/meilisearch.module';

import { config } from 'dotenv';

config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.TYPEORM_HOST || 'localhost',
      port: parseInt(process.env.TYPEORM_PORT) || 5432,
      username: process.env.TYPEORM_USERNAME || 'postgres',
      password: process.env.TYPEORM_PASSWORD || '',
      database: process.env.TYPEORM_DATABASE || 'lghorba',
      entities: [SmsMessage, Car, CarPhoto, CarPricing, CarDeliveryLocation, RentSession, RentPosition, User, Admin, Contact, Translation, Booking, Invoice, InvoiceLine, TaxRate, InvoiceAuditLog, GuestToken, GuestTokenAuditLog, PageContent, VehicleAvailability, IngestedEmail, VehicleHealthRecord, MaintenanceRecord, MaintenanceType, MaintenanceSupplier, OdometerReading, Inspection, InspectionChecklistItem, InspectionPhoto, Incident, IncidentPhoto, Promotion, PromotionUsage, NotificationSettings, ReminderLog, PlatformSettings, SupportConversation, SupportMessage, SupportNotificationLog, SupportAuditLog, VehicleFaq, SpamLog, Parking, ParkingOwnerPhone, ParkingDocument, BlogPost, BlogCategory, BlogTag, Product, ProductVariant, ProductCategory, ProductTag, VariantAttribute, VariantOption, ProductVariantAttribute, InventoryItem, InventoryMovement, Cart, CartItem, Order, OrderItem, OrderStatusHistory, PaymentTransaction, ShippingZone, ShippingMethod, Shipment, ProductReview, ShopPromotion, ShopCustomer, ShopCustomerAddress, Address, Country, ShopCollection, ShopCollectionProduct, ShopWishlistItem, ShopPriceRule, BlogProductReference, ShopVendor, ShopVendorPayout, CommerceEventLog, VariationOptionValue, PaymentType, UserPaymentMethod, PromotionCategory, PromotionProduct, OrderStatusRef, ShopCustomerGroup, MediaAsset, MediaUsage],
      migrations: [__dirname + '/migrations/*.{ts,js}'],
      migrationsRun: true,
      migrationsTransactionMode: 'each',
      // TypeORM 0.3 serializes Date objects using local getHours() — forcing the
      // PostgreSQL session to UTC ensures the server and DB always agree on time,
      // regardless of the OS timezone of the Node.js process.
      extra: { options: '-c TimeZone=UTC' },
    }),
    ThrottlerModule.forRoot([
      { name: 'auth',    ttl: 15 * 60 * 1000, limit: 10 },
      { name: 'contact', ttl: 15 * 60 * 1000, limit: 5  },
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    // 3.6 — BullMQ uses its own Redis connection (BULLMQ_REDIS_*).
    // For minimal separation, set BULLMQ_REDIS_DB=1 (different logical DB from the
    // cache/idempotency Redis at DB 0). For full isolation, point BULLMQ_REDIS_HOST
    // to a dedicated Redis instance with maxmemory-policy noeviction.
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host:     process.env.BULLMQ_REDIS_HOST     ?? process.env.REDIS_HOST     ?? 'localhost',
          port:     Number(process.env.BULLMQ_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379),
          password: process.env.BULLMQ_REDIS_PASSWORD ?? process.env.REDIS_PASSWORD ?? undefined,
          db:       Number(process.env.BULLMQ_REDIS_DB  ?? 1),
        },
      }),
    }),
    RedisModule,
    AssetUrlModule,
    DlqModule,
    SmsModule,
    AuthModule,
    AdminsModule,
    UsersModule,
    CarsModule,
    RentSessionsModule,
    ContactsModule,
    TranslationsModule,
    BookingsModule,
    BookingExpirationModule,
    PaymentsModule,
    BillingModule,
    GuestAccessModule,
    PageContentModule,
    VehicleAvailabilityModule,
    EmailIngestionModule,
    VehicleHealthModule,
    MaintenanceModule,
    OdometerModule,
    InspectionsModule,
    IncidentsModule,
    FleetAnalyticsModule,
    MaintenanceJobsModule,
    AnalyticsModule,
    PromotionsModule,
    BookingRemindersModule,
    PlatformSettingsModule,
    DateTimeModule,
    ErrorCollectorModule,
    SupportModule,
    VehicleFaqsModule,
    ParkingModule,
    BlogModule,
    MeilisearchModule,
    CommerceModule,
    WebhooksModule,
    MediaModule,
    VendorModule,
    HealthModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level:     process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
        redact:    ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
  controllers: [SmsController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
