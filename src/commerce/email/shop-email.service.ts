import { Injectable, Logger } from '@nestjs/common';

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  totalCents: number;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

export interface OrderShippedPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  trackingNumber: string | null;
  carrier: string | null;
}

export interface ReviewRequestPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  productId: string;
  productTitle: string;
  reviewUrl: string;
}

export interface StockAlertPayload {
  customerEmail: string;
  productTitle:  string;
  productUrl:    string;
}

export interface AbandonedCartPayload {
  cartToken: string;
  customerEmail: string;
  customerName: string;
  cartUrl: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

@Injectable()
export class ShopEmailService {
  private readonly logger = new Logger(ShopEmailService.name);

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

  private get from(): string {
    return process.env.SMTP_FROM ?? `shop@${process.env.SELLER_NAME ?? 'shop'}.com`;
  }

  // ── Order confirmed ───────────────────────────────────────────────────────

  async sendOrderConfirmed(payload: OrderConfirmedPayload): Promise<void> {
    const { customerEmail, customerName, orderNumber, totalCents, items } = payload;
    const itemRows = items.map(i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">${esc(i.title)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:center">${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right">${fmtCents(i.unitPriceCents)}</td>
      </tr>`).join('');

    const html = baseTemplate(`Order confirmed – ${esc(orderNumber)}`, `
      <p>Hello ${esc(customerName)},</p>
      <p>Thank you for your order! We've received it and will start processing it shortly.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr>
          <th style="text-align:left;font-size:12px;color:#6b7280;padding-bottom:8px">Product</th>
          <th style="text-align:center;font-size:12px;color:#6b7280;padding-bottom:8px">Qty</th>
          <th style="text-align:right;font-size:12px;color:#6b7280;padding-bottom:8px">Price</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="padding-top:12px;font-weight:700">Total</td>
          <td style="padding-top:12px;font-weight:700;text-align:right">${fmtCents(totalCents)}</td>
        </tr></tfoot>
      </table>
      <p style="font-size:13px;color:#6b7280">Order reference: <strong>${esc(orderNumber)}</strong></p>
    `);

    await this.send(customerEmail, `Order confirmed – ${orderNumber}`, html);
    this.logger.log(`Order confirmed email sent to ${customerEmail} for ${orderNumber}`);
  }

  // ── Order shipped ─────────────────────────────────────────────────────────

  async sendOrderShipped(payload: OrderShippedPayload): Promise<void> {
    const { customerEmail, customerName, orderNumber, trackingNumber, carrier } = payload;
    const trackingBlock = trackingNumber
      ? `<p>Your tracking number is <strong>${esc(trackingNumber)}</strong>${carrier ? ` (${esc(carrier)})` : ''}.</p>`
      : '';

    const html = baseTemplate(`Your order ${esc(orderNumber)} has shipped!`, `
      <p>Hello ${esc(customerName)},</p>
      <p>Great news! Your order <strong>${esc(orderNumber)}</strong> is on its way.</p>
      ${trackingBlock}
      <p>You should receive it within the estimated delivery window.</p>
    `);

    await this.send(customerEmail, `Your order ${orderNumber} has shipped`, html);
    this.logger.log(`Shipped email sent to ${customerEmail} for ${orderNumber}`);
  }

  // ── Review request ────────────────────────────────────────────────────────

  async sendReviewRequest(payload: ReviewRequestPayload): Promise<void> {
    const { customerEmail, customerName, orderNumber, productTitle, reviewUrl } = payload;

    const html = baseTemplate('How was your order?', `
      <p>Hello ${esc(customerName)},</p>
      <p>We hope you're enjoying your <strong>${esc(productTitle)}</strong> from order <strong>${esc(orderNumber)}</strong>.</p>
      <p>We'd love to hear what you think — it only takes a minute and helps other customers.</p>
      <p style="margin:24px 0">
        <a href="${esc(reviewUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Leave a review</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">If the button doesn't work, copy and paste this link: ${esc(reviewUrl)}</p>
    `);

    await this.send(customerEmail, `How was your ${productTitle}?`, html);
    this.logger.log(`Review request sent to ${customerEmail} for order ${orderNumber}`);
  }

  // ── Stock alert ───────────────────────────────────────────────────────────

  async sendStockAlert(payload: StockAlertPayload): Promise<void> {
    const { customerEmail, productTitle, productUrl } = payload;

    const html = baseTemplate(`${esc(productTitle)} is back in stock!`, `
      <p>Good news! An item from your wishlist is back in stock:</p>
      <h2 style="font-size:18px;margin:16px 0">${esc(productTitle)}</h2>
      <p style="margin:24px 0">
        <a href="${esc(productUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">View product</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">Hurry — stock is limited.</p>
    `);

    await this.send(customerEmail, `${productTitle} is back in stock!`, html);
    this.logger.log(`Stock alert sent to ${customerEmail} for "${productTitle}"`);
  }

  // ── Abandoned cart ────────────────────────────────────────────────────────

  async sendAbandonedCart(payload: AbandonedCartPayload): Promise<void> {
    const { customerEmail, customerName, cartUrl, items } = payload;
    const itemList = items.map(i => `<li>${esc(i.title)} × ${i.quantity}</li>`).join('');

    const html = baseTemplate('You left something behind!', `
      <p>Hello ${esc(customerName)},</p>
      <p>You left some items in your cart. Don't let them get away!</p>
      <ul style="margin:12px 0;padding-left:20px">${itemList}</ul>
      <p style="margin:24px 0">
        <a href="${esc(cartUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Complete my order</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">Your cart is saved — just click the button to continue where you left off.</p>
    `);

    await this.send(customerEmail, 'You left something in your cart', html);
    this.logger.log(`Abandoned cart email sent to ${customerEmail}`);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async send(to: string, subject: string, html: string): Promise<void> {
    const transport = this.createTransport();
    await transport.sendMail({ from: this.from, to, subject, html });
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
  .logo { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 24px; }
  .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">${esc(process.env.SELLER_NAME ?? 'Shop')}</div>
  ${body}
  <div class="footer">© ${new Date().getFullYear()} ${esc(process.env.SELLER_NAME ?? 'Shop')}. All rights reserved.</div>
</div>
</body></html>`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
