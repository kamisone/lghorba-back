import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestedEmail } from './entities/ingested-email.entity';
import { Car } from '../cars/car.entity';
import { BookingsModule } from '../bookings/bookings.module';
import { EmailIngestionService, EMAIL_INGESTION_QUEUE } from './email-ingestion.service';
import { EmailIngestionProcessor } from './email-ingestion.processor';
import { EmailIngestionAdminController } from './email-ingestion-admin.controller';
import { ImapPollerService } from './imap-poller.service';
import { TuroEmailParser } from './parsers/turo-email-parser';
import { GetaroundEmailParser } from './parsers/getaround-email-parser';

@Module({
  imports: [
    TypeOrmModule.forFeature([IngestedEmail, Car]),
    BullModule.registerQueue({ name: EMAIL_INGESTION_QUEUE }),
    BookingsModule,
  ],
  controllers: [EmailIngestionAdminController],
  providers: [
    EmailIngestionService,
    EmailIngestionProcessor,
    ImapPollerService,
    TuroEmailParser,
    GetaroundEmailParser,
  ],
  exports: [EmailIngestionService],
})
export class EmailIngestionModule {}
