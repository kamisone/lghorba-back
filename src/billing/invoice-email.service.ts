import { Injectable, Logger } from '@nestjs/common';
import { Invoice } from './invoice.entity';

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

  async sendInvoice(
    invoice: Invoice,
    downloadUrl: string,
  ): Promise<void> {
    if (!invoice.customerEmail) {
      this.logger.warn(`No customer email for invoice ${invoice.id}, skipping`);
      return;
    }

    const from    = process.env.SMTP_FROM ?? `noreply@${process.env.SELLER_NAME ?? 'company'}.fr`;
    const subject = `Votre facture ${invoice.invoiceNumber ?? ''} – ${invoice.sellerName}`;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
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
  <p>Bonjour ${esc(invoice.customerName ?? 'Client')},</p>
  <p>Merci pour votre location. Votre facture est disponible :</p>
  <p>
    <strong>Facture :</strong> ${esc(invoice.invoiceNumber ?? '')}<br>
    <strong>Montant réglé :</strong> <span class="amount">${fmtEur(Number(invoice.totalAmount))}</span><br>
    <strong>Date :</strong> ${fmtDate(invoice.issuedAt)}
  </p>
  <a class="btn" href="${esc(downloadUrl)}">Télécharger ma facture (PDF)</a>
  <p style="font-size:11px;color:#64748b;">Ce lien est valable 15 minutes. Contactez-nous si vous avez besoin d'une nouvelle copie.</p>
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
      subject,
      html,
    });

    this.logger.log(`Invoice email sent to ${invoice.customerEmail} for ${invoice.invoiceNumber}`);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}
