import { Injectable, Logger } from '@nestjs/common';
import { ShopOrderReceipt } from './shop-order-receipt.entity';

const COPY = {
  fr: {
    subject:      (n: string, s: string) => `Votre reçu ${n} – ${s}`,
    greeting:     (name: string) => `Bonjour ${name},`,
    intro:        'Merci pour votre commande. Votre reçu est disponible :',
    labelReceipt: 'Reçu',
    labelAmount:  'Montant réglé',
    labelDate:    'Date',
    cta:          'Télécharger mon reçu (PDF)',
    linkNote:     "Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.",
    fallback:     'Client',
  },
  en: {
    subject:      (n: string, s: string) => `Your receipt ${n} – ${s}`,
    greeting:     (name: string) => `Hello ${name},`,
    intro:        'Thank you for your order. Your receipt is now available:',
    labelReceipt: 'Receipt',
    labelAmount:  'Amount paid',
    labelDate:    'Date',
    cta:          'Download my receipt (PDF)',
    linkNote:     'This link is valid for 15 minutes. Contact us if you need a new copy.',
    fallback:     'Customer',
  },
} as const;

type Lang = keyof typeof COPY;
const resolveLang = (locale: string | null | undefined): Lang =>
  locale && locale in COPY ? (locale as Lang) : 'fr';

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtCents = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

@Injectable()
export class ShopReceiptEmailService {
  private readonly logger = new Logger(ShopReceiptEmailService.name);

  private createTransport() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST   ?? 'localhost',
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    });
  }

  private get from(): string {
    return process.env.SMTP_FROM ?? `noreply@${process.env.SELLER_NAME ?? 'shop'}.fr`;
  }

  async sendReceipt(receipt: ShopOrderReceipt, downloadUrl: string): Promise<void> {
    const lang   = resolveLang(receipt.customerLocale);
    const copy   = COPY[lang];
    const name   = esc(receipt.customerName ?? copy.fallback);
    const num    = esc(receipt.receiptNumber ?? '—');
    const seller = esc(receipt.sellerName);
    const date   = receipt.issuedAt
      ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(receipt.issuedAt)
      : '—';

    const html = `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;margin:0;padding:0}
  .wrap{max-width:600px;margin:0 auto;padding:32px 24px}
  .logo{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
  td:last-child{text-align:right;font-weight:600;color:#1e40af}
  .cta{display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;margin:20px 0}
  .note{font-size:11px;color:#94a3b8;margin-top:12px}
  .footer{margin-top:32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}
</style>
</head><body>
<div class="wrap">
  <div class="logo">${seller}</div>
  <p>${copy.greeting(name)}</p>
  <p>${copy.intro}</p>
  <table>
    <tr><td>${copy.labelReceipt}</td><td>${num}</td></tr>
    <tr><td>${copy.labelAmount}</td><td>${esc(fmtCents(receipt.totalCents))}</td></tr>
    <tr><td>${copy.labelDate}</td><td>${esc(date)}</td></tr>
  </table>
  <p><a href="${esc(downloadUrl)}" class="cta">${copy.cta}</a></p>
  <p class="note">${copy.linkNote}</p>
  <div class="footer">© ${new Date().getUTCFullYear()} ${seller}${receipt.sellerSiret ? ' · SIRET ' + esc(receipt.sellerSiret) : ''}${receipt.sellerVatNumber ? ' · TVA ' + esc(receipt.sellerVatNumber) : ''}</div>
</div>
</body></html>`;

    const transport = this.createTransport();
    await transport.sendMail({
      from:    this.from,
      to:      receipt.customerEmail,
      subject: copy.subject(num, receipt.sellerName),
      html,
    });
    this.logger.log(`Receipt email sent to ${receipt.customerEmail} (${num})`);
  }
}
