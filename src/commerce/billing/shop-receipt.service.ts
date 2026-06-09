import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { ShopOrderReceipt } from './shop-order-receipt.entity';
import { ShopOrderReceiptLine } from './shop-order-receipt-line.entity';
import { SHOP_RECEIPT_QUEUE, ShopReceiptGenerateJob, ShopReceiptPdfJob, ShopReceiptEmailJob } from './shop-receipt.constants';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { AssetUrlService } from '../../asset-url/asset-url.service';

@Injectable()
export class ShopReceiptService {
  private readonly logger = new Logger(ShopReceiptService.name);

  constructor(
    @InjectRepository(ShopOrderReceipt)      private readonly receiptRepo: Repository<ShopOrderReceipt>,
    @InjectRepository(ShopOrderReceiptLine)  private readonly lineRepo:    Repository<ShopOrderReceiptLine>,
    @InjectRepository(Order)                 private readonly orderRepo:   Repository<Order>,
    @InjectRepository(OrderItem)             private readonly itemRepo:    Repository<OrderItem>,
    @InjectQueue(SHOP_RECEIPT_QUEUE)         private readonly queue:       Queue,
    private readonly assetUrlService: AssetUrlService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Enqueue generation (called after payment confirmed) ───────────────────

  async scheduleGeneration(orderId: string, paymentIntentId: string | null): Promise<void> {
    await this.queue.add(
      'generate',
      { orderId, paymentIntentId } satisfies ShopReceiptGenerateJob,
      { jobId: `receipt-generate-${orderId}`, attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
    );
    this.logger.log(`Receipt generation queued for order ${orderId}`);
  }

  // ── Create receipt record from order ──────────────────────────────────────

  async generateReceipt(orderId: string, paymentIntentId: string | null): Promise<ShopOrderReceipt> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const items = await this.itemRepo.findBy({ orderId });

    return this.dataSource.transaction(async (em) => {
      // Assign sequential receipt number atomically
      const [{ nextval }] = await em.query(`SELECT nextval('shop_receipt_seq') AS nextval`);
      const year          = new Date().getUTCFullYear();
      const receiptNumber = `REC-${year}-${String(nextval).padStart(6, '0')}`;

      const receipt = em.create(ShopOrderReceipt, {
        orderId,
        receiptNumber,
        paymentIntentId:  paymentIntentId ?? null,
        status:           'issued',
        issuedAt:         new Date(),

        customerEmail:  order.customerEmail,
        customerName:   order.customerName ?? null,
        customerLocale: 'fr',

        sellerName:       process.env.SELLER_NAME    ?? 'Shop',
        sellerAddress: {
          line1:   process.env.SELLER_ADDRESS_LINE1   ?? '',
          city:    process.env.SELLER_ADDRESS_CITY    ?? '',
          zip:     process.env.SELLER_ADDRESS_ZIP     ?? '',
          country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
        },
        sellerVatNumber: process.env.SELLER_VAT_NUMBER ?? null,
        sellerSiret:     process.env.SELLER_SIRET      ?? null,

        shippingAddress: order.shippingAddressSnapshot ?? null,

        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        discountCents: order.discountCents,
        taxCents:      order.taxCents,
        totalCents:    order.totalCents,
        couponCode:    order.couponCode ?? null,

        taxRatePct: 20,
        taxLabel:   'TVA 20%',
        taxCountry: 'FR',

        lines: items.map((item, i) => em.create(ShopOrderReceiptLine, {
          description:    item.titleSnapshot,
          sku:            item.skuSnapshot ?? null,
          quantity:       item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents:     item.totalCents,
          sortOrder:      i,
        })),
      });

      await em.save(ShopOrderReceipt, receipt);
      this.logger.log(`Receipt ${receiptNumber} created for order ${orderId}`);
      return receipt;
    });
  }

  // ── Schedule PDF rendering after record is created ────────────────────────

  async schedulePdfRendering(receiptId: string): Promise<void> {
    await this.queue.add(
      'render-pdf',
      { receiptId } satisfies ShopReceiptPdfJob,
      { jobId: `receipt-pdf-${receiptId}`, attempts: 3, backoff: { type: 'exponential', delay: 15_000 } },
    );
  }

  // ── Mark PDF done and schedule email ──────────────────────────────────────

  async markPdfGenerated(receiptId: string, storagePath: string): Promise<void> {
    await this.receiptRepo.update(receiptId, {
      pdfStoragePath: storagePath,
      pdfGeneratedAt: new Date(),
    });
    await this.queue.add(
      'send-email',
      { receiptId } satisfies ShopReceiptEmailJob,
      { jobId: `receipt-email-${receiptId}`, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }

  // ── Mark email sent ───────────────────────────────────────────────────────

  async markEmailSent(receiptId: string): Promise<void> {
    await this.receiptRepo.update(receiptId, { emailSentAt: new Date() });
  }

  // ── Fetch receipt with lines ───────────────────────────────────────────────

  async findOne(receiptId: string): Promise<ShopOrderReceipt & { lines: ShopOrderReceiptLine[] }> {
    const receipt = await this.receiptRepo.findOne({
      where: { id: receiptId },
      relations: ['lines'],
      order: { lines: { sortOrder: 'ASC' } } as any,
    });
    if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);
    return receipt as ShopOrderReceipt & { lines: ShopOrderReceiptLine[] };
  }

  // ── Get signed download URL ───────────────────────────────────────────────

  async getDownloadUrl(receiptId: string): Promise<string> {
    const receipt = await this.receiptRepo.findOneByOrFail({ id: receiptId });
    if (!receipt.pdfStoragePath) throw new Error('PDF not yet generated');
    return this.assetUrlService.resolve(receipt.pdfStoragePath);
  }
}
