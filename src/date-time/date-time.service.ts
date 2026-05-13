import { Injectable } from '@nestjs/common';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * Central timezone-aware date utilities for all backend services.
 * The business timezone is read from PlatformSettingsService (cached, ~60 s TTL).
 * All methods are synchronous — they rely on the in-process cache.
 */
@Injectable()
export class DateTimeService {
  constructor(private readonly settings: PlatformSettingsService) {}

  /** Current business timezone (IANA). */
  get timezone(): string {
    return this.settings.getTimezone();
  }

  /**
   * Format a Date for human-readable display using the business timezone.
   * Default locale is 'fr-FR' (matches reminder templates and invoices).
   */
  format(date: Date, locale = 'fr-FR'): string {
    return date.toLocaleString(locale, {
      timeZone: this.timezone,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /**
   * Convert a Date to a "local datetime string" in the business timezone.
   * Returns "YYYY-MM-DDTHH:mm" — used for datetime-local inputs and analytics.
   */
  toLocalDT(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  }

  /**
   * Start of today (midnight) in the business timezone, as a UTC Date.
   * Useful for "today" boundary queries.
   */
  startOfToday(): Date {
    const localDT = this.toLocalDT(new Date());
    const datePart = localDT.slice(0, 10); // "YYYY-MM-DD"
    // Parse as midnight UTC of that calendar date
    return new Date(`${datePart}T00:00:00.000Z`);
  }

  /**
   * Start of a given ISO date (YYYY-MM-DD) at midnight in the business timezone,
   * returned as a UTC Date. Useful for day-boundary range queries.
   */
  startOfDate(dateStr: string): Date {
    // Construct noon UTC to avoid DST edge at midnight, then floor to midnight in TZ
    const noon = new Date(`${dateStr}T12:00:00.000Z`);
    const localDT = this.toLocalDT(noon);
    const day = localDT.slice(0, 10);
    return new Date(`${day}T00:00:00.000Z`);
  }
}
