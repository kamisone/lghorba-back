import { Injectable, Logger } from '@nestjs/common';

// ── Locale helpers ────────────────────────────────────────────────────────────

type Lang = 'fr' | 'en';

function resolveLang(locale?: string | null): Lang {
  return locale === 'en' ? 'en' : 'fr';
}

// ── Translations ──────────────────────────────────────────────────────────────

const COPY = {
  fr: {
    footer:   (year: number, name: string) => `© ${year} ${name}. Tous droits réservés.`,

    orderConfirmed: {
      subject:    (n: string) => `Commande confirmée – ${n}`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      "Merci pour votre commande ! Nous l'avons bien reçue et allons commencer à la traiter sous peu.",
      colProduct: 'Produit',
      colQty:     'Qté',
      colPrice:   'Prix unitaire',
      colTotal:   'Total',
      orderRef:   'Référence commande',
    },

    orderShipped: {
      subject:    (n: string) => `Votre commande ${n} est en route !`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (n: string) => `Excellente nouvelle ! Votre commande <strong>${n}</strong> est en chemin.`,
      tracking:   (t: string, c?: string | null) =>
        `Votre numéro de suivi est <strong>${t}</strong>${c ? ` (${c})` : ''}.`,
      eta:        'Vous devriez la recevoir dans les délais estimés.',
    },

    reviewRequest: {
      subject:    (p: string) => `Comment était votre ${p} ?`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (product: string, order: string) =>
        `Nous espérons que vous profitez de votre <strong>${product}</strong> (commande <strong>${order}</strong>).`,
      body:       "Votre avis aide d'autres clients — cela ne prend qu'une minute.",
      cta:        'Laisser un avis',
      fallback:   'Si le bouton ne fonctionne pas, copiez-collez ce lien :',
    },

    paymentFailed: {
      subject:    (n: string) => `Paiement non abouti – ${n}`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (n: string) =>
        `Malheureusement, nous n'avons pas pu traiter votre paiement pour la commande <strong>${n}</strong>.`,
      body:       'Vos articles sont réservés encore un moment. Veuillez réessayer avec un autre mode de paiement :',
      cta:        'Réessayer le paiement',
      note:       "Si vous continuez à rencontrer des problèmes, veuillez contacter notre service client.",
    },

    stockAlert: {
      subject:    (p: string) => `${p} est de nouveau en stock !`,
      intro:      'Bonne nouvelle ! Un article de votre liste de souhaits est de nouveau disponible :',
      cta:        'Voir le produit',
      urgency:    'Dépêchez-vous — les stocks sont limités.',
    },

    abandonedCart: {
      subject:    'Vous avez oublié quelque chose !',
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      "Vous avez laissé des articles dans votre panier. Ne les laissez pas partir !",
      cta:        'Finaliser ma commande',
      note:       'Votre panier est sauvegardé — cliquez simplement pour reprendre là où vous en étiez.',
    },
  },

  en: {
    footer:   (year: number, name: string) => `© ${year} ${name}. All rights reserved.`,

    orderConfirmed: {
      subject:    (n: string) => `Order confirmed – ${n}`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      "Thank you for your order! We've received it and will start processing it shortly.",
      colProduct: 'Product',
      colQty:     'Qty',
      colPrice:   'Unit price',
      colTotal:   'Total',
      orderRef:   'Order reference',
    },

    orderShipped: {
      subject:    (n: string) => `Your order ${n} has shipped!`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (n: string) => `Great news! Your order <strong>${n}</strong> is on its way.`,
      tracking:   (t: string, c?: string | null) =>
        `Your tracking number is <strong>${t}</strong>${c ? ` (${c})` : ''}.`,
      eta:        'You should receive it within the estimated delivery window.',
    },

    reviewRequest: {
      subject:    (p: string) => `How was your ${p}?`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (product: string, order: string) =>
        `We hope you're enjoying your <strong>${product}</strong> from order <strong>${order}</strong>.`,
      body:       "We'd love to hear what you think — it only takes a minute and helps other customers.",
      cta:        'Leave a review',
      fallback:   "If the button doesn't work, copy and paste this link:",
    },

    paymentFailed: {
      subject:    (n: string) => `Payment unsuccessful – ${n}`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (n: string) =>
        `Unfortunately, we were unable to process your payment for order <strong>${n}</strong>.`,
      body:       'Your items are still reserved for a short period. Please try again with a different payment method:',
      cta:        'Retry payment',
      note:       'If you continue to experience issues, please contact our support team.',
    },

    stockAlert: {
      subject:    (p: string) => `${p} is back in stock!`,
      intro:      'Good news! An item from your wishlist is back in stock:',
      cta:        'View product',
      urgency:    'Hurry — stock is limited.',
    },

    abandonedCart: {
      subject:    'You left something behind!',
      greeting:   (name: string) => `Hello ${name},`,
      intro:      "You left some items in your cart. Don't let them get away!",
      cta:        'Complete my order',
      note:       'Your cart is saved — just click the button to continue where you left off.',
    },
  },
} as const;

// ── Payload interfaces ────────────────────────────────────────────────────────

export interface OrderConfirmedPayload {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  totalCents: number;
  locale?: string;
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
    const { customerEmail, customerName, orderNumber, totalCents, items } = payload;
    const lang = resolveLang(payload.locale);
    const c    = COPY[lang].orderConfirmed;

    const itemRows = items.map(i => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">${esc(i.title)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:center">${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right">${fmtCents(i.unitPriceCents, lang)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right">${fmtCents(i.unitPriceCents * i.quantity, lang)}</td>
      </tr>`).join('');

    const html = baseTemplate(c.subject(orderNumber), `
      <p>${c.greeting(esc(customerName))}</p>
      <p>${c.intro}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr>
          <th style="text-align:left;font-size:12px;color:#6b7280;padding-bottom:8px">${c.colProduct}</th>
          <th style="text-align:center;font-size:12px;color:#6b7280;padding-bottom:8px">${c.colQty}</th>
          <th style="text-align:right;font-size:12px;color:#6b7280;padding-bottom:8px">${c.colPrice}</th>
          <th style="text-align:right;font-size:12px;color:#6b7280;padding-bottom:8px">${c.colTotal}</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr>
          <td colspan="3" style="padding-top:12px;font-weight:700">${c.colTotal}</td>
          <td style="padding-top:12px;font-weight:700;text-align:right">${fmtCents(totalCents, lang)}</td>
        </tr></tfoot>
      </table>
      <p style="font-size:13px;color:#6b7280">${c.orderRef} : <strong>${esc(orderNumber)}</strong></p>
    `, lang);

    await this.send(customerEmail, c.subject(orderNumber), html);
    this.logger.log(`Order confirmed email sent to ${customerEmail} for ${orderNumber} [${lang}]`);
  }

  // ── Order shipped ─────────────────────────────────────────────────────────

  async sendOrderShipped(payload: OrderShippedPayload): Promise<void> {
    const { customerEmail, customerName, orderNumber, trackingNumber, carrier } = payload;
    const lang = resolveLang(payload.locale);
    const c    = COPY[lang].orderShipped;

    const trackingBlock = trackingNumber
      ? `<p>${c.tracking(esc(trackingNumber), carrier ? esc(carrier) : null)}</p>`
      : '';

    const html = baseTemplate(c.subject(orderNumber), `
      <p>${c.greeting(esc(customerName))}</p>
      <p>${c.intro(esc(orderNumber))}</p>
      ${trackingBlock}
      <p>${c.eta}</p>
    `, lang);

    await this.send(customerEmail, c.subject(orderNumber), html);
    this.logger.log(`Shipped email sent to ${customerEmail} for ${orderNumber} [${lang}]`);
  }

  // ── Review request ────────────────────────────────────────────────────────

  async sendReviewRequest(payload: ReviewRequestPayload): Promise<void> {
    const { customerEmail, customerName, orderNumber, productTitle, reviewUrl } = payload;
    const lang = resolveLang(payload.locale);
    const c    = COPY[lang].reviewRequest;

    const html = baseTemplate(c.subject(productTitle), `
      <p>${c.greeting(esc(customerName))}</p>
      <p>${c.intro(esc(productTitle), esc(orderNumber))}</p>
      <p>${c.body}</p>
      <p style="margin:24px 0">
        <a href="${esc(reviewUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">${c.cta}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">${c.fallback} ${esc(reviewUrl)}</p>
    `, lang);

    await this.send(customerEmail, c.subject(productTitle), html);
    this.logger.log(`Review request sent to ${customerEmail} for order ${orderNumber} [${lang}]`);
  }

  // ── Payment failed ────────────────────────────────────────────────────────

  async sendPaymentFailed(payload: { customerEmail: string; customerName: string; orderNumber: string; retryUrl: string; locale?: string }): Promise<void> {
    const { customerEmail, customerName, orderNumber, retryUrl } = payload;
    const lang = resolveLang(payload.locale);
    const c    = COPY[lang].paymentFailed;

    const html = baseTemplate(c.subject(orderNumber), `
      <p>${c.greeting(esc(customerName))}</p>
      <p>${c.intro(esc(orderNumber))}</p>
      <p>${c.body}</p>
      <p style="margin:24px 0">
        <a href="${esc(retryUrl)}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">${c.cta}</a>
      </p>
      <p style="font-size:13px;color:#6b7280">${c.note}</p>
    `, lang);

    await this.send(customerEmail, c.subject(orderNumber), html);
    this.logger.log(`Payment failed email sent to ${customerEmail} for ${orderNumber} [${lang}]`);
  }

  // ── Stock alert ───────────────────────────────────────────────────────────

  async sendStockAlert(payload: StockAlertPayload): Promise<void> {
    const { customerEmail, productTitle, productUrl } = payload;
    const lang = resolveLang(payload.locale);
    const c    = COPY[lang].stockAlert;

    const html = baseTemplate(c.subject(productTitle), `
      <p>${c.intro}</p>
      <h2 style="font-size:18px;margin:16px 0">${esc(productTitle)}</h2>
      <p style="margin:24px 0">
        <a href="${esc(productUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">${c.cta}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">${c.urgency}</p>
    `, lang);

    await this.send(customerEmail, c.subject(productTitle), html);
    this.logger.log(`Stock alert sent to ${customerEmail} for "${productTitle}" [${lang}]`);
  }

  // ── Abandoned cart ────────────────────────────────────────────────────────

  async sendAbandonedCart(payload: AbandonedCartPayload): Promise<void> {
    const { customerEmail, customerName, cartUrl, resumeUrl, items } = payload;
    const lang     = resolveLang(payload.locale);
    const c        = COPY[lang].abandonedCart;
    const itemList = items.map(i => `<li>${esc(i.title)} × ${i.quantity} — ${fmtCents(i.unitPriceCents * i.quantity, lang)}</li>`).join('');
    // If a resume URL exists (customer started checkout), link directly to their saved step;
    // otherwise fall back to the cart page.
    const ctaUrl   = resumeUrl ?? cartUrl;

    const html = baseTemplate(c.subject, `
      <p>${c.greeting(esc(customerName))}</p>
      <p>${c.intro}</p>
      <ul style="margin:12px 0;padding-left:20px">${itemList}</ul>
      <p style="margin:24px 0">
        <a href="${esc(ctaUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">${c.cta}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af">${c.note}</p>
    `, lang);

    await this.send(customerEmail, c.subject, html);
    this.logger.log(`Abandoned cart email sent to ${customerEmail} [${lang}]`);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async send(to: string, subject: string, html: string): Promise<void> {
    const transport = this.createTransport();
    await transport.sendMail({ from: this.from, to, subject, html });
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string, lang: Lang = 'fr'): string {
  const year   = new Date().getFullYear();
  const seller = esc(process.env.SELLER_NAME ?? 'Shop');
  const footer = COPY[lang].footer(year, seller);

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
  .logo { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 24px; }
  .footer { margin-top: 32px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">${seller}</div>
  ${body}
  <div class="footer">${footer}</div>
</div>
</body></html>`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtCents(cents: number, lang: Lang): string {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
