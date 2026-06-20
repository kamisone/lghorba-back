import { Injectable, Logger } from '@nestjs/common';
import { resolveLang } from './templates/copy';
import { renderOrderConfirmed } from './templates/order-confirmed';
import { renderOrderShipped } from './templates/order-shipped';
import { renderPaymentFailed } from './templates/payment-failed';
import { renderReviewRequest } from './templates/review-request';
import { renderStockAlert } from './templates/stock-alert';
import { renderAbandonedCart } from './templates/abandoned-cart';

// ── Payload interfaces ────────────────────────────────────────────────────────

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  couponCode?: string | null;
  locale?: string;
  trackingToken?: string | null;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

export interface OrderShippedPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  trackingNumber: string | null;
  carrier: string | null;
  locale?: string;
}

export interface ReviewRequestPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  productId: string;
  productTitle: string;
  reviewUrl: string;
  locale?: string;
}

export interface StockAlertPayload {
  customerEmail: string;
  productTitle:  string;
  productUrl:    string;
  locale?: string;
}

export interface AbandonedCartPayload {
  cartToken: string;
  customerEmail: string;
  customerName: string;
  cartUrl: string;
  resumeUrl?: string;
  locale?: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

// ── Service ───────────────────────────────────────────────────────────────────

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
    const lang = resolveLang(payload.locale);
    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const { subject, html } = renderOrderConfirmed({
      customerName:  payload.customerName,
      orderNumber:   payload.orderNumber,
      subtotalCents: payload.subtotalCents,
      shippingCents: payload.shippingCents,
      discountCents: payload.discountCents,
      totalCents:    payload.totalCents,
      couponCode:    payload.couponCode,
      items:         payload.items,
      orderUrl:      appUrl && payload.trackingToken
        ? `${appUrl}/${lang}/shop/orders/track/${payload.orderNumber}?token=${payload.trackingToken}`
        : undefined,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Order confirmed email sent to ${payload.customerEmail} for ${payload.orderNumber} [${lang}]`);
  }

  // ── Order shipped ─────────────────────────────────────────────────────────

  async sendOrderShipped(payload: OrderShippedPayload): Promise<void> {
    const lang = resolveLang(payload.locale);
    const { subject, html } = renderOrderShipped({
      customerName:   payload.customerName,
      orderNumber:    payload.orderNumber,
      trackingNumber: payload.trackingNumber,
      carrier:        payload.carrier,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Shipped email sent to ${payload.customerEmail} for ${payload.orderNumber} [${lang}]`);
  }

  // ── Review request ────────────────────────────────────────────────────────

  async sendReviewRequest(payload: ReviewRequestPayload): Promise<void> {
    const lang = resolveLang(payload.locale);
    const { subject, html } = renderReviewRequest({
      customerName: payload.customerName,
      orderNumber:  payload.orderNumber,
      productTitle: payload.productTitle,
      reviewUrl:    payload.reviewUrl,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Review request sent to ${payload.customerEmail} for order ${payload.orderNumber} [${lang}]`);
  }

  // ── Payment failed ────────────────────────────────────────────────────────

  async sendPaymentFailed(payload: { customerEmail: string; customerName: string; orderNumber: string; retryUrl: string; locale?: string }): Promise<void> {
    const lang = resolveLang(payload.locale);
    const { subject, html } = renderPaymentFailed({
      customerName: payload.customerName,
      orderNumber:  payload.orderNumber,
      retryUrl:     payload.retryUrl,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Payment failed email sent to ${payload.customerEmail} for ${payload.orderNumber} [${lang}]`);
  }

  // ── Stock alert ───────────────────────────────────────────────────────────

  async sendStockAlert(payload: StockAlertPayload): Promise<void> {
    const lang = resolveLang(payload.locale);
    const { subject, html } = renderStockAlert({
      productTitle: payload.productTitle,
      productUrl:   payload.productUrl,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Stock alert sent to ${payload.customerEmail} for "${payload.productTitle}" [${lang}]`);
  }

  // ── Abandoned cart ────────────────────────────────────────────────────────

  async sendAbandonedCart(payload: AbandonedCartPayload): Promise<void> {
    const lang = resolveLang(payload.locale);
    const { subject, html } = renderAbandonedCart({
      customerName: payload.customerName,
      resumeUrl:    payload.resumeUrl ?? payload.cartUrl,
      items:        payload.items,
    }, lang);

    await this.send(payload.customerEmail, subject, html);
    this.logger.log(`Abandoned cart email sent to ${payload.customerEmail} [${lang}]`);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async send(to: string, subject: string, html: string): Promise<void> {
    const transport = this.createTransport();
    await transport.sendMail({ from: this.from, to, subject, html });
  }
}
