import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuickReply } from './quick-reply.entity';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';

@Module({
  imports:     [TypeOrmModule.forFeature([QuickReply])],
  controllers: [QuickRepliesController],
  providers:   [QuickRepliesService],
  exports:     [QuickRepliesService],
})
export class QuickRepliesModule {}
