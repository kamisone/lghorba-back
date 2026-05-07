import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Booking } from '../bookings/booking.entity';
import { GcsService } from '../gcs/gcs.service';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { InvoiceLine } from './invoice-line.entity';
import { TaxRate } from './tax-rate.entity';
import { InvoiceAuditLog, AuditAction } from './invoice-audit-log.entity';

export const INVOICE_QUEUE = 'invoice';

export interface InvoiceJobData {
  bookingId: string;
  paymentIntentId: string | null;
}

export interface PdfJobData {
  invoiceId: string;
}

export interface EmailJobData {
  invoiceId: string;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLine)
    private readonly lineRepo: Repository<InvoiceLine>,
    @InjectRepository(TaxRate)
    private readonly taxRateRepo: Repository<TaxRate>,
    @InjectRepository(InvoiceAuditLog)
    private readonly auditRepo: Repository<InvoiceAuditLog>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectQueue(INVOICE_QUEUE)
    private readonly invoiceQueue: Queue,
    private readonly gcsService: GcsService,
  ) {}

  // ── Queue entry point ────────────────────────────────────────────────────

  async scheduleInvoiceGeneration(
    bookingId: string,
    paymentIntentId: string | null,
  ): Promise<void> {
    await this.invoiceQueue.add(
      'generate',
      { bookingId, paymentIntentId } satisfies InvoiceJobData,
      {
        jobId:    `invoice.${bookingId}`,
        attempts: 5,
        backoff:  { type: 'exponential', delay: 10_000 },
        removeOnComplete: 50,
        removeOnFail:     50,
      },
    );
  }

  // ── Core generation ──────────────────────────────────────────────────────

  /** Idempotent: if an invoice already exists for this booking, returns it. */
  async generateInvoice(
    bookingId: string,
    paymentIntentId: string | null,
  ): Promise<Invoice> {
    const existing = await this.invoiceRepo.findOne({ where: { bookingId } });
    if (existing && existing.status !== InvoiceStatus.DRAFT) return existing;

    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['car', 'user'],
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    const taxRate = await this.getActiveTaxRate('FR', 'car_rental');
    const totalTtc = Math.round(Number(booking.totalPrice) * 100) / 100;
    const rate = Number(taxRate.rate);
    const subtotalHt = Math.round((totalTtc / (1 + rate)) * 100) / 100;
    const taxAmount  = Math.round((totalTtc - subtotalHt) * 100) / 100;

    const car = booking.car;
    const carLabel = [car?.brand, car?.model, car?.modelYear].filter(Boolean).join(' ') || car?.name || 'Vehicle';

    const startDate = booking.startDateTime.toISOString().slice(0, 10);
    const endDate   = booking.endDateTime.toISOString().slice(0, 10);
    const days = Math.max(1, Math.ceil(
      (booking.endDateTime.getTime() - booking.startDateTime.getTime()) / 86_400_000,
    ));

    const deliveryFee     = booking.deliveryRequested && booking.deliveryFee != null
      ? Math.round(Number(booking.deliveryFee) * 100) / 100
      : 0;
    const deliveryAddress = booking.deliveryAddress ?? null;
    const rentalTtc       = Math.round((totalTtc - deliveryFee) * 100) / 100;

    const sellerName    = process.env.SELLER_NAME      ?? '';
    const sellerAddress = {
      line1:   process.env.SELLER_ADDRESS_LINE1   ?? '',
      city:    process.env.SELLER_ADDRESS_CITY    ?? '',
      zip:     process.env.SELLER_ADDRESS_ZIP     ?? '',
      country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
    };

    return this.dataSource.transaction(async manager => {
      const invRepo   = manager.getRepository(Invoice);
      const lineRepo  = manager.getRepository(InvoiceLine);
      const auditRepo = manager.getRepository(InvoiceAuditLog);

      // Assign invoice number atomically inside transaction
      const [{ nextval }] = await manager.query(
        `SELECT nextval('invoice_number_seq')`,
      );
      const year          = new Date().getUTCFullYear();
      const invoiceNumber = `INV-${year}-${String(nextval).padStart(6, '0')}`;
      const now           = new Date();

      const invoice = invRepo.create({
        invoiceNumber,
        bookingId,
        paymentIntentId: paymentIntentId ?? null,
        status:          InvoiceStatus.PAID,
        subtotalAmount:  subtotalHt,
        taxAmount,
        totalAmount:     totalTtc,
        currency:        'EUR',
        taxRateSnapshot: rate,
        taxRateLabel:    taxRate.label,
        taxCountry:      'FR',
        customerName:    booking.user?.name ?? null,
        customerEmail:   booking.user?.email ?? null,
        customerLocale:  'fr',
        sellerName,
        sellerAddress,
        sellerVatNumber: process.env.SELLER_VAT_NUMBER ?? null,
        sellerSiret:     process.env.SELLER_SIRET      ?? null,
        issuedAt:        now,
        paidAt:          now,
      });

      const saved = await invRepo.save(invoice);

      const lines = [
        lineRepo.create({
          invoiceId:   saved.id,
          description: `Location ${carLabel} – du ${startDate} au ${endDate}`,
          quantity:    days,
          unitPrice:   Math.round((rentalTtc / days) * 100) / 100,
          subtotal:    rentalTtc,
          startDate,
          endDate,
          sortOrder:   0,
        }),
      ];

      if (deliveryFee > 0) {
        const deliveryDesc = deliveryAddress
          ? `Livraison – ${deliveryAddress}`
          : 'Livraison';
        lines.push(lineRepo.create({
          invoiceId:   saved.id,
          description: deliveryDesc,
          quantity:    1,
          unitPrice:   deliveryFee,
          subtotal:    deliveryFee,
          startDate,
          endDate,
          sortOrder:   1,
        }));
      }

      await lineRepo.save(lines);

      await auditRepo.save([
        this.buildAudit(saved.id, 'created_draft'),
        this.buildAudit(saved.id, 'issued'),
        this.buildAudit(saved.id, 'paid'),
      ]);

      return invRepo.findOne({ where: { id: saved.id }, relations: ['lines'] });
    });
  }

  // ── PDF dispatch ──────────────────────────────────────────────────────────

  async schedulePdfRendering(invoiceId: string): Promise<void> {
    await this.invoiceQueue.add(
      'render-pdf',
      { invoiceId } satisfies PdfJobData,
      {
        jobId:    `pdf.${invoiceId}`,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 15_000 },
        removeOnComplete: 50,
        removeOnFail:     50,
      },
    );
  }

  async scheduleEmailDelivery(invoiceId: string): Promise<void> {
    await this.invoiceQueue.add(
      'send-email',
      { invoiceId } satisfies EmailJobData,
      {
        jobId:    `email.${invoiceId}`,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail:     50,
      },
    );
  }

  // ── PDF storage path update ───────────────────────────────────────────────

  async markPdfGenerated(invoiceId: string, storagePath: string): Promise<void> {
    await this.invoiceRepo.update(invoiceId, {
      pdfStoragePath: storagePath,
      pdfGeneratedAt: new Date(),
    });
    await this.audit(invoiceId, 'pdf_generated', { storagePath });
  }

  async markEmailSent(invoiceId: string): Promise<void> {
    await this.invoiceRepo.update(invoiceId, { emailSentAt: new Date() });
    await this.audit(invoiceId, 'email_sent');
  }

  // ── Void ─────────────────────────────────────────────────────────────────

  async voidInvoice(invoiceId: string, adminId: string): Promise<Invoice> {
    const invoice = await this.findOne(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) return invoice;
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new ForbiddenException('Cannot void a draft invoice');
    }

    await this.invoiceRepo.update(invoiceId, {
      status:    InvoiceStatus.VOID,
      voidedAt:  new Date(),
    });
    await this.audit(invoiceId, 'voided', { adminId }, 'admin', adminId);

    return this.findOne(invoiceId);
  }

  // ── Download ──────────────────────────────────────────────────────────────

  async getDownloadUrl(invoiceId: string): Promise<string> {
    const invoice = await this.findOne(invoiceId);
    if (!invoice.pdfStoragePath) {
      throw new ConflictException('PDF not yet generated for this invoice');
    }
    return this.gcsService.signedUrl(invoice.pdfStoragePath);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Invoice> {
    const inv = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['lines', 'booking'],
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    return inv;
  }

  async findByBookingId(bookingId: string): Promise<Invoice | null> {
    return this.invoiceRepo.findOne({
      where: { bookingId },
      relations: ['lines'],
    });
  }

  async findAll(filters?: { status?: InvoiceStatus }): Promise<Invoice[]> {
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.booking', 'booking')
      .orderBy('inv.createdAt', 'DESC');

    if (filters?.status) {
      qb.where('inv.status = :status', { status: filters.status });
    }
    return qb.getMany();
  }

  async auditFailure(invoiceId: string, error: string): Promise<void> {
    await this.audit(invoiceId, 'generation_failed', { error });
  }

  // ── Tax resolution ────────────────────────────────────────────────────────

  private async getActiveTaxRate(
    countryCode: string,
    serviceType: string,
  ): Promise<TaxRate> {
    const today = new Date().toISOString().slice(0, 10);
    const rate = await this.taxRateRepo
      .createQueryBuilder('tr')
      .where('tr.countryCode = :cc', { cc: countryCode })
      .andWhere('tr.serviceType = :st', { st: serviceType })
      .andWhere('tr.validFrom <= :today', { today })
      .andWhere('(tr.validTo IS NULL OR tr.validTo >= :today)', { today })
      .getOne();

    if (!rate) throw new NotFoundException(`No active tax rate for ${countryCode}/${serviceType}`);
    return rate;
  }

  // ── Audit helpers ─────────────────────────────────────────────────────────

  private buildAudit(
    invoiceId: string,
    action: AuditAction,
    metadata: Record<string, unknown> | null = null,
    actorType: 'system' | 'admin' = 'system',
    actorId: string | null = null,
  ): InvoiceAuditLog {
    return this.auditRepo.create({ invoiceId, action, actorType, actorId, metadata });
  }

  private async audit(
    invoiceId: string,
    action: AuditAction,
    metadata: Record<string, unknown> | null = null,
    actorType: 'system' | 'admin' = 'system',
    actorId: string | null = null,
  ): Promise<void> {
    await this.auditRepo.save(
      this.buildAudit(invoiceId, action, metadata, actorType, actorId),
    );
  }
}
