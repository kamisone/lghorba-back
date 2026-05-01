import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { GcsService } from '../gcs/gcs.service';
import { Invoice } from './invoice.entity';
import { InvoiceLine } from './invoice-line.entity';

type InvoiceWithLines = Invoice & { lines: InvoiceLine[] };

// A4 layout constants (points)
const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const MARGIN  = 50;
const COL_W   = PAGE_W - 2 * MARGIN; // 495.28

// Palette
const DARK      = '#0f172a';
const SLATE     = '#334155';
const MUTED     = '#64748b';
const LIGHT     = '#94a3b8';
const RULE      = '#e2e8f0';
const STRIPE    = '#f8fafc';
const GREEN_BAR = '#22c55e';
const GREEN_BG  = '#f0fdf4';
const GREEN_FG  = '#166534';

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly gcsService: GcsService) {}

  async generateAndUpload(invoice: InvoiceWithLines): Promise<string> {
    const pdf  = await this.buildPdf(invoice);
    const year = (invoice.issuedAt ?? new Date()).getUTCFullYear();
    const path = `invoices/${year}/${invoice.id}.pdf`;
    await this.gcsService.upload(pdf, path, 'application/pdf');
    this.logger.log(`PDF uploaded: ${path}`);
    return path;
  }

  private buildPdf(invoice: InvoiceWithLines): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc    = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data',  c => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.render(doc, invoice);
      doc.end();
    });
  }

  private render(doc: PDFKit.PDFDocument, invoice: InvoiceWithLines): void {
    const addr   = invoice.sellerAddress as Record<string, string>;
    const fmtEur = (n: number) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
    const fmtD = (d: Date | null) =>
      d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '—';
    const vatPct = Math.round(Number(invoice.taxRateSnapshot) * 100);
    const isVoid = invoice.status === 'void';

    let y = MARGIN;

    // ── Seller block (left) ──────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).fillColor(DARK)
       .text(invoice.sellerName, MARGIN, y, { lineBreak: false });
    y += 24;

    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    const addrLine = [addr.line1, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim()].filter(Boolean).join(' – ');
    doc.text(addrLine, MARGIN, y, { lineBreak: false });
    y += 13;
    if (invoice.sellerSiret) {
      doc.text(`SIRET : ${invoice.sellerSiret}`, MARGIN, y, { lineBreak: false });
      y += 13;
    }
    if (invoice.sellerVatNumber) {
      doc.text(`TVA intracommunautaire : ${invoice.sellerVatNumber}`, MARGIN, y, { lineBreak: false });
      y += 13;
    }

    // ── Invoice meta (right) ─────────────────────────────────────────────────
    const rightX = PAGE_W - MARGIN - 180;
    doc.font('Helvetica-Bold').fontSize(26).fillColor(DARK)
       .text('FACTURE', rightX, MARGIN, { width: 180, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
       .text(invoice.invoiceNumber ?? '', rightX, MARGIN + 36, { width: 180, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(`Émise le ${fmtD(invoice.issuedAt)}`, rightX, MARGIN + 52, { width: 180, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8)
       .fillColor(isVoid ? '#b91c1c' : '#15803d')
       .text(isVoid ? '▪ ANNULÉE' : '▪ PAYÉE', rightX, MARGIN + 68, { width: 180, align: 'right', lineBreak: false });

    y = Math.max(y, MARGIN + 90);

    // ── Rule ─────────────────────────────────────────────────────────────────
    y += 8;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(RULE).stroke();
    y += 18;

    // ── Parties ──────────────────────────────────────────────────────────────
    const halfW   = (COL_W - 20) / 2;
    const clientX = MARGIN + halfW + 20;
    const pY      = y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT).text('PRESTATAIRE', MARGIN, pY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(invoice.sellerName, MARGIN, pY + 12, { width: halfW });
    doc.font('Helvetica').fontSize(9).fillColor(SLATE)
       .text([addr.line1, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim()].filter(Boolean).join('\n'),
             MARGIN, pY + 26, { width: halfW });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT).text('CLIENT', clientX, pY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(invoice.customerName ?? 'Client', clientX, pY + 12, { width: halfW });
    if (invoice.customerEmail) {
      doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(invoice.customerEmail, clientX, pY + 26, { width: halfW });
    }

    y = pY + 58;

    // ── Line items table ─────────────────────────────────────────────────────
    const COL_DESC  = 248;
    const COL_QTY   = 52;
    const COL_UNIT  = 100;
    const COL_TOTAL = COL_W - COL_DESC - COL_QTY - COL_UNIT;
    const HDR_H     = 24;
    const ROW_H     = 22;

    // Header
    doc.rect(MARGIN, y, COL_W, HDR_H).fillColor(DARK).fill();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.text('DESCRIPTION',         MARGIN + 6,                               y + 8, { width: COL_DESC - 8,  lineBreak: false });
    doc.text('QTÉ (j)',              MARGIN + COL_DESC,                        y + 8, { width: COL_QTY,        align: 'center', lineBreak: false });
    doc.text('PRIX UNIT. TTC',      MARGIN + COL_DESC + COL_QTY,             y + 8, { width: COL_UNIT,       align: 'right',  lineBreak: false });
    doc.text('TOTAL TTC',           MARGIN + COL_DESC + COL_QTY + COL_UNIT,  y + 8, { width: COL_TOTAL,      align: 'right',  lineBreak: false });
    y += HDR_H;

    const sortedLines = [...(invoice.lines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    sortedLines.forEach((line, i) => {
      if (i % 2 === 1) doc.rect(MARGIN, y, COL_W, ROW_H).fillColor(STRIPE).fill();
      doc.font('Helvetica').fontSize(9).fillColor(SLATE);
      doc.text(line.description,                   MARGIN + 6,                               y + 6, { width: COL_DESC - 8, lineBreak: false });
      doc.text(String(Number(line.quantity)),       MARGIN + COL_DESC,                        y + 6, { width: COL_QTY,       align: 'center', lineBreak: false });
      doc.text(fmtEur(Number(line.unitPrice)),      MARGIN + COL_DESC + COL_QTY,             y + 6, { width: COL_UNIT,      align: 'right',  lineBreak: false });
      doc.text(fmtEur(Number(line.subtotal)),       MARGIN + COL_DESC + COL_QTY + COL_UNIT,  y + 6, { width: COL_TOTAL,     align: 'right',  lineBreak: false });
      y += ROW_H;
    });

    doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.5).strokeColor(RULE).stroke();
    y += 22;

    // ── Summary ───────────────────────────────────────────────────────────────
    const SUM_X    = MARGIN + COL_W - 250;
    const SUM_LBLW = 150;
    const SUM_VALW = 100;

    const summaryRow = (label: string, value: string, bold = false, gap = 18) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(DARK)
         .text(label, SUM_X, y, { width: SUM_LBLW, lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(DARK)
         .text(value, SUM_X + SUM_LBLW, y, { width: SUM_VALW, align: 'right', lineBreak: false });
      y += gap;
    };

    summaryRow('Montant HT', fmtEur(Number(invoice.subtotalAmount)));
    summaryRow(`${invoice.taxRateLabel} (${vatPct}%)`, fmtEur(Number(invoice.taxAmount)));
    doc.moveTo(SUM_X, y).lineTo(MARGIN + COL_W, y).lineWidth(1.5).strokeColor(DARK).stroke();
    y += 6;
    summaryRow('Total TTC', fmtEur(Number(invoice.totalAmount)), true, 14);
    y += 20;

    // ── Payment notice ────────────────────────────────────────────────────────
    if (!isVoid) {
      const piLine = invoice.paymentIntentId ? `  Réf. Stripe : ${invoice.paymentIntentId}` : '';
      const lines  = [`Paiement reçu par carte bancaire via Stripe.${piLine}`, 'Cette facture est acquittée.'];
      const noticeH = lines.length * 14 + 16;
      doc.rect(MARGIN, y, 3, noticeH).fillColor(GREEN_BAR).fill();
      doc.rect(MARGIN + 3, y, COL_W - 3, noticeH).fillColor(GREEN_BG).fill();
      doc.font('Helvetica').fontSize(9).fillColor(GREEN_FG)
         .text(lines[0], MARGIN + 10, y + 8, { width: COL_W - 20, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN_FG)
         .text(lines[1], MARGIN + 10, y + 22, { width: COL_W - 20, lineBreak: false });
      y += noticeH + 16;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = PAGE_H - MARGIN - 36;
    doc.moveTo(MARGIN, footerY).lineTo(MARGIN + COL_W, footerY).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(LIGHT);
    const parts = [invoice.sellerName, addr.line1, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim()].filter(Boolean);
    if (invoice.sellerSiret)     parts.push(`SIRET ${invoice.sellerSiret}`);
    if (invoice.sellerVatNumber) parts.push(`N° TVA ${invoice.sellerVatNumber}`);
    doc.text(parts.join('  ·  '), MARGIN, footerY + 8, { width: COL_W, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(LIGHT)
       .text(`Facture émise le ${fmtD(invoice.issuedAt)} — ${invoice.invoiceNumber ?? ''}`,
             MARGIN, footerY + 20, { width: COL_W, align: 'center', lineBreak: false });
  }
}
