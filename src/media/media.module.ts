import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { MediaAsset } from './media-asset.entity';
import { MediaFolder } from './media-folder.entity';
import { MediaUsage } from './media-usage.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaAsset, MediaFolder, MediaUsage]),
    GcsModule,
    AssetUrlModule,
  ],
  controllers: [MediaController],
  providers:   [MediaService],
  exports:     [MediaService],
})
export class MediaModule {}
