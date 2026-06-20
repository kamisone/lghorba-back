import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createTransport, Transporter } from 'nodemailer';
import { PlatformSettings } from '../../platform-settings/platform-settings.entity';
import { SmsService } from '../../sms/sms.service';
import { CommerceNotificationLog } from './commerce-notification-log.entity';
import { baseLayout, ctaButton, divider, esc, fmtCents } from '../email/templates/layout';
import {
  COMMERCE_NOTIF_KEYS,
  COMMERCE_NOTIF_DEFAULTS,
  CommerceNotifEvent,
} from './commerce-notification.constants';

export interface CommerceNotifSettings {
  smsEnabled:     boolean;
  smsPhones:      string[];
  emailEnabled:   boolean;
  emailAddresses: string[];
  events:         string[];
}

export interface AdminNotifPayload {
  event:        CommerceNotifEvent;
  orderId?:     string;
  orderNumber?: string;
  summary:      string;
  detailUrl?:   string;
  customerName?:  string;
  customerEmail?: string;
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  totalCents?:    number;
  couponCode?:    string | null;
  items?:         Array<{ title: string; quantity: number; unitPriceCents: number }>;
}

@Injectable()
export class CommerceNotificationService {
  private readonly logger = new Logger(CommerceNotificationService.name);
  private readonly mailer: Transporter | null;
  private readonly from: string;
  private readonly sellerName: string;

  constructor(
    @InjectRepository(PlatformSettings)
    private readonly settingsRepo: Repository<PlatformSettings>,
    @InjectRepository(CommerceNotificationLog)
    private readonly logRepo: Repository<CommerceNotificationLog>,
    private readonly smsService: SmsService,
  ) {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.mailer = createTransport({
        host,
        port:   Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
      this.mailer = null;
    }
    this.from       = process.env.SMTP_FROM ?? 'noreply@vitecamion.com';
    this.sellerName = process.env.SELLER_NAME ?? 'vitecamion';
  }

  // ── Settings CRUD ──────────────────────────────────────────────────────────

  async getSettings(): Promise<CommerceNotifSettings> {
    const keys = Object.values(COMMERCE_NOTIF_KEYS);
    const rows = await this.settingsRepo.find({ where: { key: In(keys) } });
    const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));

    return {
      smsEnabled:     (map[COMMERCE_NOTIF_KEYS.smsEnabled]     ?? String(COMMERCE_NOTIF_DEFAULTS.smsEnabled)) === 'true',
      smsPhones:      JSON.parse(map[COMMERCE_NOTIF_KEYS.smsPhones]      ?? JSON.stringify(COMMERCE_NOTIF_DEFAULTS.smsPhones)),
      emailEnabled:   (map[COMMERCE_NOTIF_KEYS.emailEnabled]   ?? String(COMMERCE_NOTIF_DEFAULTS.emailEnabled)) === 'true',
      emailAddresses: JSON.parse(map[COMMERCE_NOTIF_KEYS.emailAddresses] ?? JSON.stringify(COMMERCE_NOTIF_DEFAULTS.emailAddresses)),
      events:         JSON.parse(map[COMMERCE_NOTIF_KEYS.events]         ?? JSON.stringify(COMMERCE_NOTIF_DEFAULTS.events)),
    };
  }

  async updateSettings(patch: Partial<CommerceNotifSettings>): Promise<CommerceNotifSettings> {
    if (patch.smsPhones) {
      patch.smsPhones = patch.smsPhones.map(p => p.replace(/\s+/g, '').replace(/^00/, '+'));
    }

    const updates: { key: string; value: string }[] = [];
    if (patch.smsEnabled     !== undefined) updates.push({ key: COMMERCE_NOTIF_KEYS.smsEnabled,     value: String(patch.smsEnabled) });
    if (patch.smsPhones      !== undefined) updates.push({ key: COMMERCE_NOTIF_KEYS.smsPhones,      value: JSON.stringify(patch.smsPhones) });
    if (patch.emailEnabled   !== undefined) updates.push({ key: COMMERCE_NOTIF_KEYS.emailEnabled,   value: String(patch.emailEnabled) });
    if (patch.emailAddresses !== undefined) updates.push({ key: COMMERCE_NOTIF_KEYS.emailAddresses, value: JSON.stringify(patch.emailAddresses) });
    if (patch.events         !== undefined) updates.push({ key: COMMERCE_NOTIF_KEYS.events,         value: JSON.stringify(patch.events) });

    await Promise.all(
      updates.map(({ key, value }) =>
        this.settingsRepo.save(this.settingsRepo.create({ key, value })),
      ),
    );
    return this.getSettings();
  }

  // ── Send notifications ─────────────────────────────────────────────────────

  async notify(payload: AdminNotifPayload): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.events.includes(payload.event)) return;

    const promises: Promise<void>[] = [];

    if (settings.smsEnabled && settings.smsPhones.length > 0) {
      promises.push(this.sendSms(settings.smsPhones, payload));
    }

    if (settings.emailEnabled && settings.emailAddresses.length > 0) {
      promises.push(this.sendEmail(settings.emailAddresses, payload));
    }

    await Promise.allSettled(promises);
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  async getLogs(filters: {
    channel?: string;
    event?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: CommerceNotificationLog[]; total: number }> {
    const qb = this.logRepo.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (filters.channel) qb.andWhere('l.channel = :channel', { channel: filters.channel });
    if (filters.event)   qb.andWhere('l.event = :event',     { event: filters.event });
    if (filters.status)  qb.andWhere('l.status = :status',   { status: filters.status });
    const limit  = Math.min(filters.limit  ?? 50, 200);
    const offset = filters.offset ?? 0;
    const [logs, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { logs, total };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async sendSms(phones: string[], payload: AdminNotifPayload): Promise<void> {
    const appUrl  = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const lines   = [`[${this.sellerName}] ${payload.summary}`];
    if (payload.orderNumber) lines.push(`#${payload.orderNumber}`);
    if (payload.detailUrl)   lines.push(`${appUrl}${payload.detailUrl}`);
    const message = lines.join('\n');

    for (const phone of phones) {
      try {
        await this.smsService.addMessage(phone, message);
        await this.log(payload, 'sms', phone, 'sent');
      } catch (err) {
        const error = (err as Error).message;
        this.logger.error(`Commerce SMS failed to ${phone}: ${error}`);
        await this.log(payload, 'sms', phone, 'failed', error);
      }
    }
  }

  private async sendEmail(addresses: string[], payload: AdminNotifPayload): Promise<void> {
    if (!this.mailer) {
      for (const addr of addresses) {
        await this.log(payload, 'email', addr, 'skipped', 'SMTP not configured');
      }
      return;
    }

    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const subject = `[${this.sellerName}] ${payload.summary}`;
    const html = this.buildEmailHtml(payload, appUrl);

    for (const addr of addresses) {
      try {
        await this.mailer.sendMail({
          from:    `"${this.sellerName}" <${this.from}>`,
          to:      addr,
          subject,
          html,
        });
        await this.log(payload, 'email', addr, 'sent');
      } catch (err) {
        const error = (err as Error).message;
        this.logger.error(`Commerce email failed to ${addr}: ${error}`);
        await this.log(payload, 'email', addr, 'failed', error);
      }
    }
  }

  private buildEmailHtml(payload: AdminNotifPayload, appUrl: string): string {
    const label = this.eventLabel(payload.event);

    let itemsHtml = '';
    if (payload.items && payload.items.length > 0) {
      const rows = payload.items.map(i => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${esc(i.title)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:13px;color:#475569;">${i.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;color:#0f172a;">${fmtCents(i.unitPriceCents * i.quantity, 'fr')}</td>
        </tr>`).join('');

      itemsHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 0;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 12px;border-bottom:2px solid #e2e8f0;">Product</th>
              <th style="text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 12px;border-bottom:2px solid #e2e8f0;">Qty</th>
              <th style="text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 12px;border-bottom:2px solid #e2e8f0;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    let pricingHtml = '';
    if (payload.totalCents !== undefined) {
      const lines: string[] = [];
      if (payload.subtotalCents !== undefined) {
        lines.push(this.summaryRow('Subtotal', fmtCents(payload.subtotalCents, 'fr')));
      }
      if (payload.shippingCents !== undefined && payload.shippingCents > 0) {
        lines.push(this.summaryRow('Shipping', fmtCents(payload.shippingCents, 'fr')));
      }
      if (payload.discountCents !== undefined && payload.discountCents > 0) {
        const discountLabel = payload.couponCode ? `Discount (${esc(payload.couponCode)})` : 'Discount';
        lines.push(this.summaryRow(discountLabel, `<span style="color:#dc2626;">-${fmtCents(payload.discountCents, 'fr')}</span>`));
      }
      lines.push(`
        <tr>
          <td style="padding:10px 12px 0;font-size:15px;font-weight:800;color:#0f172a;border-top:2px solid #e2e8f0;">Total</td>
          <td style="padding:10px 12px 0;font-size:15px;font-weight:800;color:#0f172a;text-align:right;border-top:2px solid #e2e8f0;">${fmtCents(payload.totalCents, 'fr')}</td>
        </tr>`);
      pricingHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 0;">${lines.join('')}</table>`;
    }

    const customerHtml = payload.customerName || payload.customerEmail
      ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;">Customer: <strong style="color:#0f172a;">${esc(payload.customerName ?? '')} </strong>${payload.customerEmail ? `<span style="color:#475569;">${esc(payload.customerEmail)}</span>` : ''}</p>`
      : '';

    const body = `
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${esc(label)}</p>
      <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a;">${esc(payload.summary)}</p>
      ${payload.orderNumber ? `<p style="margin:0;font-size:14px;color:#64748b;">Order <strong style="color:#0f172a;">#${esc(payload.orderNumber)}</strong></p>` : ''}
      ${customerHtml}
      ${itemsHtml}
      ${pricingHtml}
      ${payload.detailUrl ? divider() + ctaButton('View in Admin', `${appUrl}${payload.detailUrl}`) : ''}
    `;

    return baseLayout(`[Admin] ${label}`, body, 'fr');
  }

  private summaryRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:5px 12px;font-size:13px;color:#475569;">${label}</td>
      <td style="padding:5px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${value}</td>
    </tr>`;
  }

  private eventLabel(event: string): string {
    const labels: Record<string, string> = {
      payment_succeeded: 'New Order',
      payment_failed:    'Payment Failed',
      order_cancelled:   'Order Cancelled',
      order_shipped:     'Order Shipped',
      order_delivered:   'Order Delivered',
      low_stock:         'Low Stock Alert',
    };
    return labels[event] ?? event;
  }

  private async log(
    payload: AdminNotifPayload,
    channel: 'sms' | 'email',
    recipient: string,
    status: 'sent' | 'failed' | 'skipped',
    error?: string,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        event:       payload.event,
        channel,
        recipient,
        status,
        orderId:     payload.orderId ?? null,
        orderNumber: payload.orderNumber ?? null,
        error:       error ?? null,
      }),
    );
  }
}
