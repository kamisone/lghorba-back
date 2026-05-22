import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpamLog } from './spam-log.entity';
import { AntiSpamService } from './anti-spam.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports:   [TypeOrmModule.forFeature([SpamLog])],
  providers: [AntiSpamService, TurnstileService],
  exports:   [AntiSpamService],
})
export class AntiSpamModule {}
