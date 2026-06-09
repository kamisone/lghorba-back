import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DlqAwareWorker } from '../../dlq/dlq-aware.worker';
import { DlqService } from '../../dlq/dlq.service';
import { ShopReceiptService } from './shop-receipt.service';
import { ShopReceiptPdfService } from './shop-receipt-pdf.service';
import { ShopReceiptEmailService } from './shop-receipt-email.service';
import {
  SHOP_RECEIPT_QUEUE,
  ShopReceiptGenerateJob,
  ShopReceiptPdfJob,
  ShopReceiptEmailJob,
} from './shop-receipt.constants';

@Processor(SHOP_RECEIPT_QUEUE)
export class ShopReceiptProcessor extends DlqAwareWorker {
  protected readonly queueName = SHOP_RECEIPT_QUEUE;
  private readonly logger = new Logger(ShopReceiptProcessor.name);

  constructor(
    dlqService: DlqService,
    private readonly receiptService: ShopReceiptService,
    private readonly pdfService:     ShopReceiptPdfService,
    private readonly emailService:   ShopReceiptEmailService,
  ) {
    super(dlqService);
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'generate':   return this.handleGenerate(job as Job<ShopReceiptGenerateJob>);
      case 'render-pdf': return this.handleRenderPdf(job as Job<ShopReceiptPdfJob>);
      case 'send-email': return this.handleSendEmail(job as Job<ShopReceiptEmailJob>);
      default:
        this.logger.warn(`Unknown shop receipt job: ${job.name}`);
    }
  }

  private async handleGenerate(job: Job<ShopReceiptGenerateJob>): Promise<void> {
    const { orderId, paymentIntentId } = job.data;
    this.logger.log(`Generating receipt for order ${orderId}`);
    try {
      const receipt = await this.receiptService.generateReceipt(orderId, paymentIntentId);
      await this.receiptService.schedulePdfRendering(receipt.id);
    } catch (err) {
      this.logger.error(`Receipt generation failed for order ${orderId}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async handleRenderPdf(job: Job<ShopReceiptPdfJob>): Promise<void> {
    const { receiptId } = job.data;
    this.logger.log(`Rendering PDF for receipt ${receiptId}`);
    try {
      const receipt     = await this.receiptService.findOne(receiptId);
      const storagePath = await this.pdfService.generateAndUpload(receipt);
      await this.receiptService.markPdfGenerated(receiptId, storagePath);
    } catch (err) {
      this.logger.error(`PDF render failed for receipt ${receiptId}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async handleSendEmail(job: Job<ShopReceiptEmailJob>): Promise<void> {
    const { receiptId } = job.data;
    this.logger.log(`Sending receipt email for ${receiptId}`);
    try {
      const receipt     = await this.receiptService.findOne(receiptId);
      const downloadUrl = await this.receiptService.getDownloadUrl(receiptId);
      await this.emailService.sendReceipt(receipt, downloadUrl);
      await this.receiptService.markEmailSent(receiptId);
    } catch (err) {
      this.logger.error(`Receipt email failed for ${receiptId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
