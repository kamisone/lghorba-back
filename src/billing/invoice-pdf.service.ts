import { Injectable, Logger } from '@nestjs/common';
import { GcsService } from '../gcs/gcs.service';
import { Invoice } from './invoice.entity';

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly gcsService: GcsService) {}

  async generateAndUpload(invoice: Invoice & { lines: import('./invoice-line.entity').InvoiceLine[] }): Promise<string> {
    const html  = this.renderHtml(invoice);
    const pdf   = await this.htmlToPdf(html);
    const year  = (invoice.issuedAt ?? new Date()).getUTCFullYear();
    const path  = `invoices/${year}/${invoice.id}.pdf`;

    await this.gcsService.upload(pdf, path, 'application/pdf');
    this.logger.log(`PDF uploaded: ${path}`);
    return path;
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    // Dynamic import to avoid crashing at startup if puppeteer isn't installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer') as typeof import('puppeteer');

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        margin:  { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private renderHtml(invoice: Invoice & { lines: import('./invoice-line.entity').InvoiceLine[] }): string {
    const addr    = invoice.sellerAddress as Record<string, string>;
    const fmtEur  = (n: number) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

    const lines = (invoice.lines ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(l => `
        <tr>
          <td class="desc">${esc(l.description)}</td>
          <td class="right">${Number(l.quantity)}</td>
          <td class="right">${fmtEur(Number(l.unitPrice))}</td>
          <td class="right">${fmtEur(Number(l.subtotal))}</td>
        </tr>
      `)
      .join('');

    const vatPct = Math.round(Number(invoice.taxRateSnapshot) * 100);

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Facture ${esc(invoice.invoiceNumber ?? '')}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
    .page { padding: 0; }
    /* ── Header ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .brand { font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; }
    .brand-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-number { font-size: 13px; color: #64748b; margin-top: 4px; }
    .invoice-date { font-size: 12px; color: #64748b; margin-top: 2px; }
    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
    /* ── Parties ── */
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; }
    .party { width: 48%; }
    .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
    .party-name { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 3px; }
    .party-info { font-size: 11px; color: #475569; line-height: 1.6; }
    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #0f172a; color: #fff; }
    thead th { padding: 9px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
    thead th.right { text-align: right; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 10px 10px; font-size: 12px; color: #334155; vertical-align: top; }
    td.desc { width: 55%; }
    td.right { text-align: right; white-space: nowrap; }
    /* ── Summary ── */
    .summary { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .summary-table { width: 280px; }
    .summary-table td { padding: 5px 0; font-size: 12px; }
    .summary-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-size: 14px; font-weight: 700; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 8px; }
    /* ── Status badge ── */
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; }
    .badge-paid { background: #dcfce7; color: #15803d; }
    .badge-void { background: #fee2e2; color: #b91c1c; }
    /* ── Footer ── */
    .footer { border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 10px; color: #94a3b8; line-height: 1.7; text-align: center; }
    .payment-notice { background: #f0fdf4; border-left: 3px solid #22c55e; padding: 10px 14px; font-size: 11px; color: #166534; margin-bottom: 24px; border-radius: 0 6px 6px 0; }
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div class="brand">${esc(invoice.sellerName)}</div>
      <div class="brand-sub">${esc(addr.line1 ?? '')} – ${esc(addr.zip ?? '')} ${esc(addr.city ?? '')} (${esc(addr.country ?? 'FR')})</div>
      ${invoice.sellerSiret     ? `<div class="brand-sub">SIRET : ${esc(invoice.sellerSiret)}</div>` : ''}
      ${invoice.sellerVatNumber ? `<div class="brand-sub">TVA intracommunautaire : ${esc(invoice.sellerVatNumber)}</div>` : ''}
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">Facture</div>
      <div class="invoice-number">${esc(invoice.invoiceNumber ?? '')}</div>
      <div class="invoice-date">Émise le ${fmtDate(invoice.issuedAt)}</div>
      <div style="margin-top:6px">
        <span class="badge ${invoice.status === 'void' ? 'badge-void' : 'badge-paid'}">${invoice.status === 'void' ? 'Annulée' : 'Payée'}</span>
      </div>
    </div>
  </div>

  <hr>

  <div class="parties">
    <div class="party">
      <div class="party-label">Prestataire</div>
      <div class="party-name">${esc(invoice.sellerName)}</div>
      <div class="party-info">${esc(addr.line1 ?? '')}<br>${esc(addr.zip ?? '')} ${esc(addr.city ?? '')}</div>
    </div>
    <div class="party">
      <div class="party-label">Client</div>
      <div class="party-name">${esc(invoice.customerName ?? 'Client')}</div>
      <div class="party-info">${invoice.customerEmail ? esc(invoice.customerEmail) : ''}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Qté (j)</th>
        <th class="right">Prix unitaire TTC</th>
        <th class="right">Total TTC</th>
      </tr>
    </thead>
    <tbody>
      ${lines}
    </tbody>
  </table>

  <div class="summary">
    <table class="summary-table">
      <tbody>
        <tr>
          <td>Montant HT</td>
          <td>${fmtEur(Number(invoice.subtotalAmount))}</td>
        </tr>
        <tr>
          <td>${esc(invoice.taxRateLabel)} (${vatPct}%)</td>
          <td>${fmtEur(Number(invoice.taxAmount))}</td>
        </tr>
        <tr class="total-row">
          <td>Total TTC</td>
          <td>${fmtEur(Number(invoice.totalAmount))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${invoice.status !== 'void' ? `
  <div class="payment-notice">
    Paiement reçu par carte bancaire via Stripe.
    ${invoice.paymentIntentId ? `Référence Stripe : <strong>${esc(invoice.paymentIntentId)}</strong>.` : ''}
    Cette facture est acquittée.
  </div>` : ''}

  <div class="footer">
    <p>${esc(invoice.sellerName)} — ${esc(addr.line1 ?? '')} — ${esc(addr.zip ?? '')} ${esc(addr.city ?? '')} — France</p>
    ${invoice.sellerSiret ? `<p>SIRET ${esc(invoice.sellerSiret)}</p>` : ''}
    ${invoice.sellerVatNumber ? `<p>N° TVA : ${esc(invoice.sellerVatNumber)}</p>` : ''}
    <p>Facture émise le ${fmtDate(invoice.issuedAt)} — ${esc(invoice.invoiceNumber ?? '')}</p>
  </div>

</div>
</body>
</html>`;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}
