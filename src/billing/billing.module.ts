import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { GcsModule } from '../gcs/gcs.module';
import { Booking } from '../bookings/booking.entity';
import { Invoice } from './invoice.entity';
import { InvoiceLine } from './invoice-line.entity';
import { TaxRate } from './tax-rate.entity';
import { InvoiceAuditLog } from './invoice-audit-log.entity';
import { InvoiceService, INVOICE_QUEUE } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceEmailService } from './invoice-email.service';
import { InvoiceJobsProcessor } from './invoice-jobs.processor';
import { InvoicesAdminController } from './invoices.admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceLine, TaxRate, InvoiceAuditLog, Booking]),
    BullModule.registerQueue({ name: INVOICE_QUEUE }),
    GcsModule,
  ],
  controllers: [InvoicesAdminController],
  providers: [
    InvoiceService,
    InvoicePdfService,
    InvoiceEmailService,
    InvoiceJobsProcessor,
  ],
  exports: [InvoiceService],
})
export class BillingModule {}
