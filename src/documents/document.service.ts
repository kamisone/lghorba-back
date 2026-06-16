import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Document, DocumentType, EntityType } from './document.entity';
import { DocumentLine } from './document-line.entity';
import { AssetUrlService } from '../asset-url/asset-url.service';

export const DOCUMENTS_QUEUE = 'documents';

export interface DocumentLineInput {
  description:    string;
  sku?:           string | null;
  quantity:       number;
  unitPriceCents: number;
  totalCents:     number;
  periodStart?:   string | null;
  periodEnd?:     string | null;
  sortOrder?:     number;
}

export interface DocumentInput {
  entityType:      EntityType;
  entityId:        string;
  documentType:    DocumentType;
  paymentIntentId: string | null;
  customer:   { email: string; name: string | null; companyName?: string | null; locale?: string };
  seller:     { name: string; address: Record<string, string>; vatNumber?: string | null; siret?: string | null };
  financial:  { subtotalCents: number; deliveryCents: number; discountCents: number; taxCents: number; totalCents: number; couponCode?: string | null };
  tax:        { ratePct: number; label?: string | null; country?: string };
  deliveryAddress?: Record<string, string> | null;
  contextSnapshot?: Record<string, unknown> | null;
  lines: DocumentLineInput[];
}

export interface DocumentCreateJob { input: DocumentInput }
export interface DocumentPdfJob    { documentId: string }
export interface DocumentEmailJob  { documentId: string }

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(Document)     private readonly docRepo:  Repository<Document>,
    @InjectRepository(DocumentLine) private readonly lineRepo: Repository<DocumentLine>,
    @InjectQueue(DOCUMENTS_QUEUE)   private readonly queue:    Queue,
    private readonly assetUrlService: AssetUrlService,
    private readonly dataSource:      DataSource,
  ) {}

  // ── Entry point: enqueue document creation ────────────────────────────────

  async scheduleCreation(input: DocumentInput): Promise<void> {
    const jobId = `doc-create-${input.entityType}-${input.entityId}`;
    await this.queue.add(
      'create',
      { input } satisfies DocumentCreateJob,
      { jobId, attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
    );
    this.logger.log(`Document creation queued for ${input.entityType} ${input.entityId}`);
  }

  // ── Create document record ────────────────────────────────────────────────

  async createDocument(input: DocumentInput): Promise<Document> {
    // Idempotency: if a document already exists for this entity, return it
    const existing = await this.docRepo.findOne({
      where: { entityType: input.entityType, entityId: input.entityId },
    });
    if (existing) {
      this.logger.debug(`Document already exists for ${input.entityType} ${input.entityId} — skipping`);
      return existing;
    }

    return this.dataSource.transaction(async (em) => {
      const seq      = input.documentType === 'invoice' ? 'invoice_number_seq' : 'shop_receipt_seq';
      const prefix   = input.documentType === 'invoice' ? 'INV' : 'REC';
      const [{ nextval }] = await em.query(`SELECT nextval('${seq}') AS nextval`);
      const year     = new Date().getUTCFullYear();
      const docNumber = `${prefix}-${year}-${String(nextval).padStart(6, '0')}`;

      const doc = em.create(Document, {
        documentType:    input.documentType,
        entityType:      input.entityType,
        entityId:        input.entityId,
        documentNumber:  docNumber,
        paymentIntentId: input.paymentIntentId,
        status:          'issued',
        issuedAt:        new Date(),

        customerEmail:       input.customer.email,
        customerName:        input.customer.name        ?? null,
        customerCompanyName: input.customer.companyName ?? null,
        customerLocale:      input.customer.locale      ?? 'fr',

        sellerName:       input.seller.name,
        sellerAddress:    input.seller.address,
        sellerVatNumber:  input.seller.vatNumber ?? null,
        sellerSiret:      input.seller.siret     ?? null,

        deliveryAddress:  input.deliveryAddress  ?? null,
        contextSnapshot:  input.contextSnapshot  ?? null,

        subtotalCents: input.financial.subtotalCents,
        deliveryCents: input.financial.deliveryCents,
        discountCents: input.financial.discountCents,
        taxCents:      input.financial.taxCents,
        totalCents:    input.financial.totalCents,
        couponCode:    input.financial.couponCode ?? null,

        taxRatePct: input.tax.ratePct,
        taxLabel:   input.tax.label   ?? null,
        taxCountry: input.tax.country ?? 'FR',

        lines: input.lines.map((l, i) => em.create(DocumentLine, {
          description:    l.description,
          sku:            l.sku           ?? null,
          quantity:       l.quantity,
          unitPriceCents: l.unitPriceCents,
          totalCents:     l.totalCents,
          periodStart:    l.periodStart   ?? null,
          periodEnd:      l.periodEnd     ?? null,
          sortOrder:      l.sortOrder     ?? i,
        })),
      });

      await em.save(Document, doc);
      this.logger.log(`Document ${docNumber} created (id=${doc.id})`);
      return doc;
    });
  }

  // ── Schedule PDF rendering after record is created ────────────────────────

  async schedulePdfRendering(documentId: string): Promise<void> {
    await this.queue.add(
      'render-pdf',
      { documentId } satisfies DocumentPdfJob,
      { jobId: `doc-pdf-${documentId}`, attempts: 3, backoff: { type: 'exponential', delay: 15_000 } },
    );
  }

  async markPdfGenerated(documentId: string, storagePath: string): Promise<void> {
    await this.docRepo.update(documentId, { pdfStoragePath: storagePath, pdfGeneratedAt: new Date() });
    await this.queue.add(
      'send-email',
      { documentId } satisfies DocumentEmailJob,
      { jobId: `doc-email-${documentId}`, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  }

  async markEmailSent(documentId: string): Promise<void> {
    await this.docRepo.update(documentId, { emailSentAt: new Date() });
  }

  // ── Void ──────────────────────────────────────────────────────────────────

  async voidDocument(documentId: string): Promise<Document> {
    const doc = await this.docRepo.findOneByOrFail({ id: documentId });
    if (doc.status === 'void') return doc;
    await this.docRepo.update(documentId, { status: 'void' });
    return { ...doc, status: 'void' };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findOne(documentId: string): Promise<Document & { lines: DocumentLine[] }> {
    const doc = await this.docRepo.findOne({
      where: { id: documentId },
      relations: ['lines'],
      order: { lines: { sortOrder: 'ASC' } } as any,
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return doc as Document & { lines: DocumentLine[] };
  }

  async findAll(filter: { entityType?: EntityType; status?: string; limit?: number; offset?: number } = {}): Promise<Document[]> {
    const qb = this.docRepo.createQueryBuilder('d').orderBy('d.createdAt', 'DESC');
    if (filter.entityType) qb.andWhere('d.entityType = :t', { t: filter.entityType });
    if (filter.status)     qb.andWhere('d.status = :s',    { s: filter.status });
    if (filter.limit)      qb.take(filter.limit);
    if (filter.offset)     qb.skip(filter.offset);
    return qb.getMany();
  }

  async getDownloadUrl(documentId: string): Promise<string> {
    const doc = await this.docRepo.findOneByOrFail({ id: documentId });
    if (!doc.pdfStoragePath) throw new Error('PDF not yet generated');
    return this.assetUrlService.resolve(doc.pdfStoragePath);
  }

  async regeneratePdf(documentId: string): Promise<void> {
    await this.schedulePdfRendering(documentId);
  }
}
