import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { DlqModule } from '../dlq/dlq.module';
import { MediaAsset } from './media-asset.entity';
import { MediaFolder } from './media-folder.entity';
import { MediaUsage } from './media-usage.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { VideoTranscodeProcessor } from './video-transcode.processor';
import { VIDEO_TRANSCODE_QUEUE } from './video-transcode.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaAsset, MediaFolder, MediaUsage]),
    BullModule.registerQueue({ name: VIDEO_TRANSCODE_QUEUE }),
    GcsModule,
    AssetUrlModule,
    DlqModule,
  ],
  controllers: [MediaController],
  providers:   [MediaService, VideoTranscodeProcessor],
  exports:     [MediaService],
})
export class MediaModule {}
