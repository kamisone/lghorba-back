import { Injectable, Logger } from '@nestjs/common';
import { Invoice } from './invoice.entity';

// ── Email copy ────────────────────────────────────────────────────────────────
// All user-facing strings live here; adding a language = adding one block.

const COPY = {
  fr: {
    subject:   (invoiceNumber: string, sellerName: string) => `Votre facture ${invoiceNumber} – ${sellerName}`,
    greeting:  (name: string) => `Bonjour ${name},`,
    intro:     'Merci pour votre location. Votre facture est disponible :',
    labelInvoice: 'Facture',
    labelAmount:  'Montant réglé',
    labelDate:    'Date',
    cta:          'Télécharger ma facture (PDF)',
    linkNote:     'Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d\'une nouvelle copie.',
    htmlLang:     'fr',
    fallbackName: 'Client',
  },
  en: {
    subject:   (invoiceNumber: string, sellerName: string) => `Your invoice ${invoiceNumber} – ${sellerName}`,
    greeting:  (name: string) => `Hello ${name},`,
    intro:     'Thank you for your rental. Your invoice is now available:',
    labelInvoice: 'Invoice',
    labelAmount:  'Amount paid',
    labelDate:    'Date',
    cta:          'Download my invoice (PDF)',
    linkNote:     'This link is valid for 15 minutes. Contact us if you need a new copy.',
    htmlLang:     'en',
    fallbackName: 'Customer',
  },
} as const;

type InvoiceLang = keyof typeof COPY;

function resolveLang(locale: string | null | undefined): InvoiceLang {
  return locale && locale in COPY ? (locale as InvoiceLang) : 'fr';
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class InvoiceEmailService {
  private readonly logger = new Logger(InvoiceEmailService.name);

  private createTransport() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST ?? 'localhost',
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ?? '',
      } : undefined,
    });
  }

  async sendInvoice(invoice: Invoice, downloadUrl: string): Promise<void> {
    if (!invoice.customerEmail) {
      this.logger.warn(`No customer email for invoice ${invoice.id}, skipping`);
      return;
    }

    const lang = resolveLang(invoice.customerLocale);
    const c    = COPY[lang];
    const name = esc(invoice.customerName ?? c.fallbackName);
    const from = process.env.SMTP_FROM ?? `noreply@${process.env.SELLER_NAME ?? 'company'}.fr`;

    const html = `<!DOCTYPE html>
<html lang="${c.htmlLang}"><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6; }
  .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
  .header { margin-bottom: 24px; }
  .brand { font-size: 18px; font-weight: 700; color: #0f172a; }
  .btn { display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 16px 0; }
  .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  .amount { font-size: 22px; font-weight: 700; color: #0f172a; }
</style>
</head>
<body>
<div class="container">
  <div class="header"><div class="brand">${esc(invoice.sellerName)}</div></div>
  <p>${c.greeting(name)}</p>
  <p>${c.intro}</p>
  <p>
    <strong>${c.labelInvoice} :</strong> ${esc(invoice.invoiceNumber ?? '')}<br>
    <strong>${c.labelAmount} :</strong> <span class="amount">${fmtCurrency(Number(invoice.totalAmount), lang)}</span><br>
    <strong>${c.labelDate} :</strong> ${fmtDate(invoice.issuedAt, lang)}
  </p>
  <a class="btn" href="${esc(downloadUrl)}">${c.cta}</a>
  <p style="font-size:11px;color:#64748b;">${c.linkNote}</p>
  <div class="footer">
    ${esc(invoice.sellerName)}
    ${invoice.sellerSiret ? `· SIRET ${esc(invoice.sellerSiret)}` : ''}
    ${invoice.sellerVatNumber ? `· TVA ${esc(invoice.sellerVatNumber)}` : ''}
  </div>
</div>
</body></html>`;

    const transport = this.createTransport();
    await transport.sendMail({
      from,
      to:      invoice.customerEmail,
      subject: c.subject(esc(invoice.invoiceNumber ?? ''), esc(invoice.sellerName)),
      html,
    });

    this.logger.log(`Invoice email sent (${lang}) to ${invoice.customerEmail} for ${invoice.invoiceNumber}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d: Date | null, lang: InvoiceLang): string {
  if (!d) return '';
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function fmtCurrency(n: number, lang: InvoiceLang): string {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n);
}
