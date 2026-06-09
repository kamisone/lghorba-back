import { Injectable, Logger } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { GcsService } from '../../gcs/gcs.service';
import { ShopOrderReceipt } from './shop-order-receipt.entity';
import { ShopOrderReceiptLine } from './shop-order-receipt-line.entity';

type ReceiptWithLines = ShopOrderReceipt & { lines: ShopOrderReceiptLine[] };

// A4 layout (points)
const PAGE_W = 595.28;
const MARGIN  = 50;
const COL_W   = PAGE_W - 2 * MARGIN;

// Palette
const DARK  = '#0f172a';
const SLATE = '#334155';
const MUTED = '#64748b';
const LIGHT = '#94a3b8';
const RULE  = '#e2e8f0';
const STRIPE = '#f8fafc';
const BLUE_BAR = '#2563eb';
const BLUE_BG  = '#eff6ff';
const BLUE_FG  = '#1e40af';

@Injectable()
export class ShopReceiptPdfService {
  private readonly logger = new Logger(ShopReceiptPdfService.name);

  constructor(private readonly gcsService: GcsService) {}

  async generateAndUpload(receipt: ReceiptWithLines): Promise<string> {
    const pdf  = await this.buildPdf(receipt);
    const year = (receipt.issuedAt ?? new Date()).getUTCFullYear();
    const path = `shop-receipts/${year}/${receipt.id}.pdf`;
    await this.gcsService.upload(pdf, path, 'application/pdf');
    this.logger.log(`Receipt PDF uploaded: ${path}`);
    return path;
  }

  private buildPdf(receipt: ReceiptWithLines): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data',  c => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks as Uint8Array[])));
      doc.on('error', reject);
      this.render(doc, receipt);
      doc.end();
    });
  }

  private render(doc: PDFKit.PDFDocument, receipt: ReceiptWithLines): void {
    const addr   = receipt.sellerAddress as Record<string, string>;
    const ship   = receipt.shippingAddress as Record<string, string> | null;
    const fmt    = (cents: number) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
    const fmtD   = (d: Date | null) =>
      d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '—';

    let y = MARGIN;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, COL_W, 4).fill(BLUE_BAR);
    y += 16;

    // Title + receipt number
    doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK)
       .text('REÇU', MARGIN, y);

    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
       .text(`N° ${receipt.receiptNumber ?? '—'}`, PAGE_W - MARGIN - 140, y + 6, { width: 140, align: 'right' });

    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
       .text(`Date : ${fmtD(receipt.issuedAt)}`, PAGE_W - MARGIN - 140, y + 20, { width: 140, align: 'right' });

    y += 50;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 14;

    // ── Seller / Customer columns ────────────────────────────────────────────
    const colHalf = (COL_W - 20) / 2;

    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
       .text('VENDEUR', MARGIN, y).text('CLIENT', MARGIN + colHalf + 20, y);
    y += 14;

    // Seller block
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(receipt.sellerName, MARGIN, y, { width: colHalf });
    doc.font('Helvetica').fontSize(9).fillColor(SLATE);
    if (addr.line1) doc.text(addr.line1,    MARGIN, y + 14, { width: colHalf });
    const cityZip = [addr.zip, addr.city].filter(Boolean).join(' ');
    if (cityZip)   doc.text(cityZip,          MARGIN, y + 26, { width: colHalf });
    if (addr.country) doc.text(addr.country,  MARGIN, y + 38, { width: colHalf });
    if (receipt.sellerVatNumber) doc.text(`TVA : ${receipt.sellerVatNumber}`, MARGIN, y + 50, { width: colHalf });
    if (receipt.sellerSiret)     doc.text(`SIRET : ${receipt.sellerSiret}`,   MARGIN, y + 62, { width: colHalf });

    // Customer block
    const cx = MARGIN + colHalf + 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(receipt.customerName ?? receipt.customerEmail, cx, y, { width: colHalf });
    doc.font('Helvetica').fontSize(9).fillColor(SLATE)
       .text(receipt.customerEmail, cx, y + 14, { width: colHalf });
    if (ship) {
      if (ship.line1) doc.text(ship.line1,  cx, y + 26, { width: colHalf });
      const sz = [ship.zip, ship.city].filter(Boolean).join(' ');
      if (sz)         doc.text(sz,           cx, y + 38, { width: colHalf });
      if (ship.country) doc.text(ship.country, cx, y + 50, { width: colHalf });
    }

    y += 80;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 16;

    // ── Order reference ──────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(`Commande : `, MARGIN, y, { continued: true })
       .font('Helvetica-Bold').fillColor(DARK)
       .text(receipt.orderId);
    y += 24;

    // ── Items table header ───────────────────────────────────────────────────
    const C = {
      desc:  { x: MARGIN,       w: COL_W * 0.50 },
      sku:   { x: MARGIN + COL_W * 0.50, w: COL_W * 0.15 },
      qty:   { x: MARGIN + COL_W * 0.65, w: COL_W * 0.12 },
      unit:  { x: MARGIN + COL_W * 0.77, w: COL_W * 0.11 },
      total: { x: MARGIN + COL_W * 0.88, w: COL_W * 0.12 },
    };

    doc.rect(MARGIN, y, COL_W, 20).fill(DARK);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    doc.text('ARTICLE',     C.desc.x  + 4, y + 6, { width: C.desc.w  - 8 });
    doc.text('SKU',         C.sku.x   + 4, y + 6, { width: C.sku.w   - 8 });
    doc.text('QTÉ',         C.qty.x   + 4, y + 6, { width: C.qty.w   - 8, align: 'center' });
    doc.text('PRIX UNIT.',  C.unit.x  + 4, y + 6, { width: C.unit.w  - 8, align: 'right' });
    doc.text('TOTAL TTC',   C.total.x + 4, y + 6, { width: C.total.w - 8, align: 'right' });
    y += 20;

    // Item rows
    const lines = [...receipt.lines].sort((a, b) => a.sortOrder - b.sortOrder);
    lines.forEach((line, idx) => {
      const rowH = 22;
      if (idx % 2 === 0) doc.rect(MARGIN, y, COL_W, rowH).fill(STRIPE);

      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      doc.text(line.description,              C.desc.x  + 4, y + 6, { width: C.desc.w  - 8, ellipsis: true });
      doc.text(line.sku ?? '—',               C.sku.x   + 4, y + 6, { width: C.sku.w   - 8, ellipsis: true });
      doc.text(String(line.quantity),          C.qty.x   + 4, y + 6, { width: C.qty.w   - 8, align: 'center' });
      doc.text(fmt(line.unitPriceCents),       C.unit.x  + 4, y + 6, { width: C.unit.w  - 8, align: 'right' });
      doc.fillColor(SLATE)
         .text(fmt(line.totalCents),           C.total.x + 4, y + 6, { width: C.total.w - 8, align: 'right' });
      y += rowH;
    });

    y += 8;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 12;

    // ── Totals block ─────────────────────────────────────────────────────────
    const totX = MARGIN + COL_W * 0.55;
    const totW = COL_W * 0.45;

    const totLine = (label: string, cents: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .fillColor(bold ? DARK : SLATE)
         .text(label, totX, y, { width: totW * 0.55 })
         .text(fmt(cents), totX + totW * 0.55, y, { width: totW * 0.45, align: 'right' });
      y += 16;
    };

    totLine('Sous-total HT', receipt.subtotalCents - receipt.taxCents);
    if (receipt.shippingCents) totLine('Livraison',    receipt.shippingCents);
    if (receipt.discountCents) totLine(`Remise${receipt.couponCode ? ` (${receipt.couponCode})` : ''}`, -receipt.discountCents);
    totLine(`${receipt.taxLabel ?? 'TVA'} (${receipt.taxRatePct}%)`, receipt.taxCents);

    y += 2;
    doc.rect(totX, y, totW, 24).fill(BLUE_BG);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE_FG)
       .text('TOTAL TTC', totX + 8, y + 6, { width: totW * 0.55 })
       .text(fmt(receipt.totalCents), totX + totW * 0.55, y + 6, { width: totW * 0.45 - 8, align: 'right' });
    y += 36;

    // ── Payment notice ────────────────────────────────────────────────────────
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
       .text('Paiement reçu par carte bancaire via Stripe. Ce reçu est acquitté.', MARGIN, y);
    y += 24;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(RULE).lineWidth(0.5).stroke();
    y += 10;
    doc.font('Helvetica').fontSize(7).fillColor(LIGHT)
       .text(
         `${receipt.sellerName}${receipt.sellerVatNumber ? ' · TVA ' + receipt.sellerVatNumber : ''}${receipt.sellerSiret ? ' · SIRET ' + receipt.sellerSiret : ''}`,
         MARGIN, y, { width: COL_W, align: 'center' },
       );
  }
}
