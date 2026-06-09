import { Injectable, Logger } from '@nestjs/common';
import { Document } from './document.entity';

const COPY = {
  invoice: {
    fr: {
      subject:   (n: string, s: string) => `Votre facture ${n} – ${s}`,
      greeting:  (name: string) => `Bonjour ${name},`,
      intro:     'Merci pour votre location. Votre facture est disponible :',
      cta:       'Télécharger ma facture (PDF)',
      linkNote:  "Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.",
    },
    en: {
      subject:   (n: string, s: string) => `Your invoice ${n} – ${s}`,
      greeting:  (name: string) => `Hello ${name},`,
      intro:     'Thank you for your rental. Your invoice is now available:',
      cta:       'Download my invoice (PDF)',
      linkNote:  'This link is valid for 15 minutes. Contact us if you need a new copy.',
    },
  },
  receipt: {
    fr: {
      subject:   (n: string, s: string) => `Votre reçu ${n} – ${s}`,
      greeting:  (name: string) => `Bonjour ${name},`,
      intro:     'Merci pour votre commande. Votre reçu est disponible :',
      cta:       'Télécharger mon reçu (PDF)',
      linkNote:  "Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.",
    },
    en: {
      subject:   (n: string, s: string) => `Your receipt ${n} – ${s}`,
      greeting:  (name: string) => `Hello ${name},`,
      intro:     'Thank you for your order. Your receipt is now available:',
      cta:       'Download my receipt (PDF)',
      linkNote:  'This link is valid for 15 minutes. Contact us if you need a new copy.',
    },
  },
} as const;

type DocType = keyof typeof COPY;
type Lang    = 'fr' | 'en';
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtCents = (c: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);

@Injectable()
export class DocumentEmailService {
  private readonly logger = new Logger(DocumentEmailService.name);

  private transport() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nm = require('nodemailer') as typeof import('nodemailer');
    return nm.createTransport({
      host:   process.env.SMTP_HOST ?? 'localhost',
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    });
  }

  private get from() { return process.env.SMTP_FROM ?? `noreply@${process.env.SELLER_NAME ?? 'shop'}.fr`; }

  async send(document: Document, downloadUrl: string): Promise<void> {
    const dt   = (document.documentType as DocType) in COPY ? document.documentType as DocType : 'receipt';
    const lang: Lang = document.customerLocale?.startsWith('en') ? 'en' : 'fr';
    const copy = COPY[dt][lang];
    const name = esc(document.customerName ?? (lang === 'fr' ? 'Client' : 'Customer'));
    const num  = esc(document.documentNumber ?? '—');
    const sel  = esc(document.sellerName);
    const date = document.issuedAt
      ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(document.issuedAt)
      : '—';

    const html = `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6;margin:0;padding:0}
  .w{max-width:600px;margin:0 auto;padding:32px 24px}
  .logo{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
  td:last-child{text-align:right;font-weight:600;color:#1e40af}
  .cta{display:inline-block;background:#1e3a5f;color:#fff;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;margin:20px 0}
  .note{font-size:11px;color:#94a3b8;margin-top:12px}
  .footer{margin-top:32px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}
</style>
</head><body><div class="w">
  <div class="logo">${sel}</div>
  <p>${copy.greeting(name)}</p>
  <p>${copy.intro}</p>
  <table>
    <tr><td>${lang === 'fr' ? 'Référence' : 'Reference'}</td><td>${num}</td></tr>
    <tr><td>${lang === 'fr' ? 'Montant réglé' : 'Amount paid'}</td><td>${esc(fmtCents(document.totalCents))}</td></tr>
    <tr><td>${lang === 'fr' ? 'Date' : 'Date'}</td><td>${esc(date)}</td></tr>
  </table>
  <p><a href="${esc(downloadUrl)}" class="cta">${copy.cta}</a></p>
  <p class="note">${copy.linkNote}</p>
  <div class="footer">© ${new Date().getUTCFullYear()} ${sel}${document.sellerSiret ? ' · SIRET ' + esc(document.sellerSiret) : ''}${document.sellerVatNumber ? ' · TVA ' + esc(document.sellerVatNumber) : ''}</div>
</div></body></html>`;

    await this.transport().sendMail({
      from:    this.from,
      to:      document.customerEmail,
      subject: copy.subject(num, document.sellerName),
      html,
    });
    this.logger.log(`Document email sent to ${document.customerEmail} (${num})`);
  }
}
