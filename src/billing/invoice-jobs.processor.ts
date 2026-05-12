import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { InvoiceService, INVOICE_QUEUE, InvoiceJobData, PdfJobData, EmailJobData } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceEmailService } from './invoice-email.service';

@Processor(INVOICE_QUEUE)
export class InvoiceJobsProcessor extends DlqAwareWorker {
  protected readonly queueName = INVOICE_QUEUE;
  private readonly logger = new Logger(InvoiceJobsProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: InvoicePdfService,
    private readonly emailService: InvoiceEmailService,
  ) {
    super(dlqService);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'generate':   return this.handleGenerate(job as Job<InvoiceJobData>);
      case 'render-pdf': return this.handleRenderPdf(job as Job<PdfJobData>);
      case 'send-email': return this.handleSendEmail(job as Job<EmailJobData>);
      default:
        this.logger.warn(`Unknown invoice job: ${job.name}`);
    }
  }

  private async handleGenerate(job: Job<InvoiceJobData>): Promise<void> {
    const { bookingId, paymentIntentId } = job.data;
    this.logger.log(`Generating invoice for booking ${bookingId}`);

    try {
      const invoice = await this.invoiceService.generateInvoice(bookingId, paymentIntentId);
      this.logger.log(`Invoice ${invoice.invoiceNumber} created (id=${invoice.id})`);
      await this.invoiceService.schedulePdfRendering(invoice.id);
    } catch (err) {
      this.logger.error(`Invoice generation failed for booking ${bookingId}: ${(err as Error).message}`);
      throw err; // BullMQ will retry
    }
  }

  private async handleRenderPdf(job: Job<PdfJobData>): Promise<void> {
    const { invoiceId } = job.data;
    this.logger.log(`Rendering PDF for invoice ${invoiceId}`);

    try {
      const invoice = await this.invoiceService.findOne(invoiceId);
      const storagePath = await this.pdfService.generateAndUpload(invoice as any);
      await this.invoiceService.markPdfGenerated(invoiceId, storagePath);
      await this.invoiceService.scheduleEmailDelivery(invoiceId);
    } catch (err) {
      this.logger.error(`PDF rendering failed for invoice ${invoiceId}: ${(err as Error).message}`);
      await this.invoiceService.auditFailure(invoiceId, (err as Error).message).catch(() => {});
      throw err;
    }
  }

  private async handleSendEmail(job: Job<EmailJobData>): Promise<void> {
    const { invoiceId } = job.data;
    this.logger.log(`Sending invoice email for ${invoiceId}`);

    try {
      const invoice = await this.invoiceService.findOne(invoiceId);
      if (!invoice.customerEmail) {
        this.logger.warn(`No email on invoice ${invoiceId}, skipping delivery`);
        return;
      }
      const downloadUrl = await this.invoiceService.getDownloadUrl(invoiceId);
      await this.emailService.sendInvoice(invoice, downloadUrl);
      await this.invoiceService.markEmailSent(invoiceId);
    } catch (err) {
      this.logger.error(`Email delivery failed for invoice ${invoiceId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
