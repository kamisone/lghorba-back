import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createTransport, Transporter } from 'nodemailer';
import { PlatformSettings } from '../../platform-settings/platform-settings.entity';
import { SmsService } from '../../sms/sms.service';
import { CommerceNotificationLog } from './commerce-notification-log.entity';
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
    const detailLink = payload.detailUrl
      ? `<a href="${appUrl}${payload.detailUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00466E;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">View Details</a>`
      : '';

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <tr><td style="background:#001829;padding:20px 28px;">
    <span style="color:#fff;font-size:16px;font-weight:700;">${this.sellerName}</span>
  </td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${this.eventLabel(payload.event)}</p>
    <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a;">${payload.summary}</p>
    ${payload.orderNumber ? `<p style="margin:0;font-size:14px;color:#64748b;">Order #${payload.orderNumber}</p>` : ''}
    ${detailLink}
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
    Admin notification · ${this.sellerName}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
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
