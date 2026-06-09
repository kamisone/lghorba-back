import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DocumentService } from '../documents/document.service';

/** All routes require admin JWT (the global JwtAuthGuard applies). */
@Controller('invoices')
export class InvoicesAdminController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.documentService.findAll({ entityType: 'booking', status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentService.findOne(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string) {
    const url = await this.documentService.getDownloadUrl(id);
    return { url };
  }

  @Post(':id/void')
  void(@Param('id') id: string) {
    return this.documentService.voidDocument(id);
  }

  @Post(':id/regenerate-pdf')
  async regeneratePdf(@Param('id') id: string) {
    await this.documentService.regeneratePdf(id);
    return { queued: true };
  }
}
