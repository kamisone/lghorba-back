import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ShopVendor } from '../entities/shop-vendor.entity';
import { ShopVendorPayout } from '../entities/shop-vendor-payout.entity';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { VendorService } from './vendor.service';
import { VendorAuthService } from './vendor-auth.service';
import { VendorJwtStrategy } from './vendor-jwt.strategy';
import { VendorConnectService } from './vendor-connect.service';
import { VendorPortalService } from './vendor-portal.service';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorAdminController } from './vendor-admin.controller';
import { VendorPortalController } from './vendor-portal.controller';
import { PayoutsAdminController } from './payouts-admin.controller';
import { PaymentsModule } from '../../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShopVendor, ShopVendorPayout, Product, Order, OrderItem]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '24h' },
      }),
    }),
    PaymentsModule,
  ],
  controllers: [
    VendorAuthController,
    VendorAdminController,
    VendorPortalController,
    PayoutsAdminController,
  ],
  providers: [
    VendorService,
    VendorAuthService,
    VendorJwtStrategy,
    VendorConnectService,
    VendorPortalService,
  ],
  exports: [VendorService, VendorConnectService],
})
export class VendorModule {}
