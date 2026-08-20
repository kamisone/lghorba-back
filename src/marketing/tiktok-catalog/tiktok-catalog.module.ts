import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetUrlModule } from '../../asset-url/asset-url.module';
import { Product } from '../../commerce/entities/product.entity';
import { InventoryItem } from '../../commerce/entities/inventory-item.entity';
import { TikTokCatalogService } from './tiktok-catalog.service';
import { TikTokCatalogController } from './tiktok-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product, InventoryItem]), AssetUrlModule],
  controllers: [TikTokCatalogController],
  providers: [TikTokCatalogService],
})
export class TikTokCatalogModule {}
