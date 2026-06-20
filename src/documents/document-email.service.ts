import { Injectable, Logger } from '@nestjs/common';
import { Document } from './document.entity';
import { baseLayout, ctaButton, divider, mutedText, esc } from '../commerce/email/templates/layout';

const COPY = {
  invoice: {
    fr: {
      subject:   (n: string, s: string) => `Votre facture ${n} – ${s}`,
      greeting:  (name: string) => `Bonjour ${name},`,
      intro:     'Merci pour votre location. Votre facture est disponible.',
      cta:       'Télécharger ma facture (PDF)',
      linkNote:  "Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.",
      refLabel:  'Référence',
      amountLabel: 'Montant réglé',
      dateLabel: 'Date',
    },
    en: {
      subject:   (n: string, s: string) => `Your invoice ${n} – ${s}`,
      greeting:  (name: string) => `Hello ${name},`,
      intro:     'Thank you for your rental. Your invoice is now available.',
      cta:       'Download my invoice (PDF)',
      linkNote:  'This link is valid for 15 minutes. Contact us if you need a new copy.',
      refLabel:  'Reference',
      amountLabel: 'Amount paid',
      dateLabel: 'Date',
    },
  },
  receipt: {
    fr: {
      subject:   (n: string, s: string) => `Votre reçu ${n} – ${s}`,
      greeting:  (name: string) => `Bonjour ${name},`,
      intro:     'Merci pour votre commande. Votre reçu est disponible.',
      cta:       'Télécharger mon reçu (PDF)',
      linkNote:  "Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.",
      refLabel:  'Référence',
      amountLabel: 'Montant réglé',
      dateLabel: 'Date',
    },
    en: {
      subject:   (n: string, s: string) => `Your receipt ${n} – ${s}`,
      greeting:  (name: string) => `Hello ${name},`,
      intro:     'Thank you for your order. Your receipt is now available.',
      cta:       'Download my receipt (PDF)',
      linkNote:  'This link is valid for 15 minutes. Contact us if you need a new copy.',
      refLabel:  'Reference',
      amountLabel: 'Amount paid',
      dateLabel: 'Date',
    },
  },
} as const;

type DocType = keyof typeof COPY;
type Lang    = 'fr' | 'en';

const fmtCents = (c: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(c / 100);

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
    const date = document.issuedAt
      ? new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(document.issuedAt)
      : '—';

    const body = `
      <p style="margin:0 0 6px;font-size:15px;">${copy.greeting(name)}</p>
      <p style="margin:0 0 20px;font-size:15px;">${copy.intro}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin:0 0 8px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">${copy.refLabel}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${num}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">${copy.amountLabel}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${esc(fmtCents(document.totalCents, lang))}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;">${copy.dateLabel}</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;text-align:right;">${esc(date)}</td>
        </tr>
      </table>

      ${ctaButton(copy.cta, downloadUrl)}

      ${divider()}
      ${mutedText(copy.linkNote)}
    `;

    const subject = copy.subject(num, document.sellerName);
    const html = baseLayout(subject, body, lang);

    await this.transport().sendMail({
      from:    this.from,
      to:      document.customerEmail,
      subject,
      html,
    });
    this.logger.log(`Document email sent to ${document.customerEmail} (${num})`);
  }
}
