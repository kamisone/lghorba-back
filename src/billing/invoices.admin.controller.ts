import {
  Controller, Get, Param, Post, Query,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceStatus } from './invoice.entity';

/** All routes require admin JWT (the global JwtAuthGuard applies). */
@Controller('invoices')
export class InvoicesAdminController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  findAll(@Query('status') status?: InvoiceStatus) {
    return this.invoiceService.findAll(status ? { status } : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceService.findOne(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string) {
    const url = await this.invoiceService.getDownloadUrl(id);
    return { url };
  }

  @Post(':id/void')
  void(
    @Param('id') id: string,
    // Admin ID would come from the JWT payload in a production system.
    // For now we pass a placeholder; wire up via @Request() if needed.
  ) {
    return this.invoiceService.voidInvoice(id, 'admin');
  }

  /** Re-trigger PDF generation for an invoice (admin recovery). */
  @Post(':id/regenerate-pdf')
  async regeneratePdf(@Param('id') id: string) {
    await this.invoiceService.schedulePdfRendering(id);
    return { queued: true };
  }
}
