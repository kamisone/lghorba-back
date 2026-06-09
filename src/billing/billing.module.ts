import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/booking.entity';
import { TaxRate } from './tax-rate.entity';
import { InvoiceAuditLog } from './invoice-audit-log.entity';
import { InvoiceDataBuilderService } from './invoice-data-builder.service';
import { InvoicesAdminController } from './invoices.admin.controller';
import { BillingBookingListener } from './billing-booking.listener';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaxRate, InvoiceAuditLog, Booking]),
    DocumentsModule,
  ],
  controllers: [InvoicesAdminController],
  providers: [InvoiceDataBuilderService, BillingBookingListener],
})
export class BillingModule {}
