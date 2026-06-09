import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Document } from './document.entity';
import { DocumentLine } from './document-line.entity';
import { DocumentService, DOCUMENTS_QUEUE } from './document.service';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentEmailService } from './document-email.service';
import { DocumentProcessor } from './document.processor';
import { GcsModule } from '../gcs/gcs.module';
import { AssetUrlModule } from '../asset-url/asset-url.module';
import { DlqModule } from '../dlq/dlq.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentLine]),
    BullModule.registerQueue({ name: DOCUMENTS_QUEUE }),
    GcsModule,
    AssetUrlModule,
    DlqModule,
  ],
  providers: [DocumentService, DocumentPdfService, DocumentEmailService, DocumentProcessor],
  exports:   [DocumentService],
})
export class DocumentsModule {}
