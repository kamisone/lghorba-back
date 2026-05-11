import { Injectable } from '@nestjs/common';
import { ExtractedBooking } from '../entities/ingested-email.entity';
import { ProviderEmailParser, RawEmail } from './provider-email-parser.interface';
import { parseDateString } from './date-parser.util';

const TURO_FROM  = 'noreply@mail.turo.com';

// Subjects that indicate a booking confirmation
const TURO_SUBJECT_EN = /\bis booked\b/i;
const TURO_SUBJECT_FR = /\best r[eé]serv[eé]e?(?!\w)/i;
const TURO_BODY_EN    = /\btrip\s+is\s+confirmed\b|\bbooking\s+confirmed\b|\bbooked\b/i;
const TURO_BODY_FR    = /\br[eé]servation\s+confirm[eé]e?(?!\w)|\best\s+r[eé]serv[eé]e?(?!\w)/i;

@Injectable()
export class TuroEmailParser implements ProviderEmailParser {
  detect(email: RawEmail): boolean {
    if (!email.fromAddress.toLowerCase().includes(TURO_FROM)) return false;
    const body = email.text + ' ' + email.subject;
    return (
      TURO_SUBJECT_EN.test(email.subject) ||
      TURO_SUBJECT_FR.test(email.subject) ||
      TURO_BODY_EN.test(body) ||
      TURO_BODY_FR.test(body)
    );
  }

  parse(email: RawEmail): ExtractedBooking {
    const body   = this.flattenHtml(email.html) || email.text;
    const isEn   = this.detectLanguage(email) === 'en';
    const lang   = isEn ? 'en' : 'fr';

    const reservationNumber = this.extractReservationNumber(body, email.subject);
    const guestName         = this.extractGuestName(body, isEn, email.subject);
    const vehicleName       = this.extractVehicleName(body, email.subject, isEn);
    const { start, end }    = this.extractDates(body, isEn);
    const totalEarning      = this.extractEarning(body, isEn);
    const pickupLocation    = this.extractPickup(body, isEn);
    const guestPhone        = this.extractPhone(body);
    const mileage           = this.extractMileage(body, isEn);

    if (!reservationNumber) throw new Error('Could not extract Turo reservation number');
    if (!guestName)         throw new Error('Could not extract Turo guest name');
    if (!vehicleName)       throw new Error('Could not extract Turo vehicle name');
    if (!start)             throw new Error('Could not extract Turo start date');
    if (!end)               throw new Error('Could not extract Turo end date');

    return {
      provider: 'turo',
      reservationNumber,
      guestName: guestName.trim(),
      vehicleName: vehicleName.trim(),
      startDateTime: start,
      endDateTime: end,
      totalEarning,
      pickupLocation: pickupLocation ?? null,
      guestPhone: guestPhone ?? null,
      includedMileageKm: mileage,
      detectedLanguage: lang,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private detectLanguage(email: RawEmail): 'en' | 'fr' {
    const s = email.subject + ' ' + email.text;
    const frScore = (s.match(/(?<!\w)(r[eé]serv[eé]|confirm[eé]|r[eé]servation|prise en charge|retour|gagnerez)(?!\w)/gi) ?? []).length;
    const enScore = (s.match(/\b(booked|confirmed|reservation|pickup|return|earn)\b/gi) ?? []).length;
    return frScore >= enScore ? 'fr' : 'en';
  }

  private flattenHtml(html: string): string {
    return html
      // Strip style/script blocks first — their content contains CSS hex colors (#5ED28B)
      // that would be falsely matched as reservation numbers
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }

  private extractReservationNumber(body: string, subject: string): string | null {
    const targets = [subject, body];
    for (const t of targets) {
      // Try labeled format first: "Numéro de réservation 57089279" or "Reservation #12345678"
      // This must run before the bare "#XXXX" pattern to avoid matching CSS hex colors
      const labeled = t.match(/(?:r[eé]servation|trip|booking)\s*(?:no\.?|number|#|num[eé]ro(?:\s+de\s+r[eé]servation)?)?\s*:?\s*([A-Z0-9]{5,12})\b/i);
      if (labeled) return labeled[1].toUpperCase();

      // "Numéro de réservation57089279" (no separator)
      const numLabel = t.match(/num[eé]ro\s+de\s+r[eé]servation\s*:?\s*([A-Z0-9]{5,12})\b/i);
      if (numLabel) return numLabel[1].toUpperCase();

      // Bare "#12345678" — only after labeled patterns failed to avoid CSS color false-positives
      const hash = t.match(/(?<![A-Z0-9])#\s*([A-Z0-9]{5,12})\b/i);
      if (hash) return hash[1].toUpperCase();
    }
    return null;
  }

  private extractGuestName(body: string, isEn: boolean, subject?: string): string | null {
    if (isEn) {
      const m = body.match(/(?:booked by|driver|guest|renter)\s*:?\s*([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']{1,50})/i);
      if (m) return m[1].trim();
    } else {
      // "Le voyage de Sophia est réservé" — guest name in subject
      if (subject) {
        const subjectGuest = subject.match(/^le\s+voyage\s+de\s+(.+?)\s+est\s+r[eé]serv[eé]/i);
        if (subjectGuest) return subjectGuest[1].trim();
      }
      // "À propos de l'invité Sophia" in body
      const inviteM = body.match(/(?:à\s+propos\s+de\s+l['']invit[eé]e?|l['']invit[eé]e?)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']{1,40})/i);
      if (inviteM) return inviteM[1].trim();
      const m = body.match(/(?:réservé par|locataire|conducteur)\s*:?\s*([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']{1,50})/i);
      if (m) return m[1].trim();
    }
    // Fallback: generic name pattern after "by" / "par"
    const fb = body.match(/(?:by|par)\s+([A-ZÀÂÄÉ][a-zA-ZÀ-ÿ]+(?:\s+[A-ZÀÂÄÉ][a-zA-ZÀ-ÿ]+)?)/);
    return fb ? fb[1].trim() : null;
  }

  private extractVehicleName(body: string, subject: string, isEn: boolean): string | null {
    // From subject: "Your Peugeot 208 is booked" → "Peugeot 208"
    const subjectEn = subject.match(/^your\s+(.+?)\s+is\s+booked/i);
    if (subjectEn) return subjectEn[1].trim();

    // "Le voyage de NAME est réservé" — subject contains guest name, not vehicle; skip it
    if (!/^le\s+voyage\s+de\s+/i.test(subject)) {
      const subjectFr = subject.match(/^(?:votre\s+)?(.+?)\s+est\s+r[eé]serv[eé]e?/i);
      if (subjectFr) return subjectFr[1].trim();
    }

    // From body: "dans votre Citroen C1" or "Votre Citroen C1"
    const votreFr = body.match(/(?:dans\s+)?votre\s+([A-ZÀÂÄÉ][A-Za-zÀ-ÿ0-9\s\-]{2,50})/i);
    if (votreFr) return votreFr[1].trim();

    // From body: "Vehicle:" or "Véhicule:" labels
    const vehicleLine = body.match(/(?:v[eé]hicle|v[eé]hicule|car)\s*:?\s*([A-ZÀÂÄÉ][^\n]{3,60})/i);
    if (vehicleLine) return vehicleLine[1].trim();

    return null;
  }

  private extractDates(body: string, isEn: boolean): { start: string | null; end: string | null } {
    let start: string | null = null;
    let end: string | null   = null;

    if (isEn) {
      // "Pickup\nDate/time text" or "Trip start: date"
      const pickupM = body.match(/(?:pickup|trip\s+start|start)\s*[:\n]+\s*([^\n]+(?:\n[^\n]+)?)/i);
      const returnM = body.match(/(?:return|trip\s+end|end)\s*[:\n]+\s*([^\n]+(?:\n[^\n]+)?)/i);
      if (pickupM) start = parseDateString(pickupM[1].replace(/\n/g, ' '));
      if (returnM) end   = parseDateString(returnM[1].replace(/\n/g, ' '));
    } else {
      const pickupM = body.match(/(?:prise\s+en\s+charge|d[eé]but\s+du\s+voyage|d[eé]but|d[eé]part)\s*[:\n]+\s*([^\n]+(?:\n[^\n]+)?)/i);
      const returnM = body.match(/(?:retour|fin\s+du\s+voyage|fin|restitution)\s*[:\n]+\s*([^\n]+(?:\n[^\n]+)?)/i);
      if (pickupM) start = parseDateString(pickupM[1].replace(/\n/g, ' '));
      if (returnM) end   = parseDateString(returnM[1].replace(/\n/g, ' '));
    }

    // Fallback: grab all date-like strings in order
    if (!start || !end) {
      const allDates = this.extractAllDates(body);
      if (!start && allDates[0]) start = allDates[0];
      if (!end   && allDates[1]) end   = allDates[1];
    }

    return { start, end };
  }

  private extractAllDates(body: string): string[] {
    const results: string[] = [];
    // ISO-like
    const iso = body.matchAll(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2})/g);
    for (const m of iso) {
      const d = parseDateString(m[1]);
      if (d) results.push(d);
    }
    // French long form
    const fr = body.matchAll(/(\d{1,2}\s+[a-zéèêîôûùàâäë]+\.?\s+\d{4}\s+(?:à\s+)?\d{1,2}h\d{2})/gi);
    for (const m of fr) {
      const d = parseDateString(m[1]);
      if (d && !results.includes(d)) results.push(d);
    }
    // DD/MM/YYYY with optional time ("10/05/2026" or "10/05/2026 10:00" or "10/05/2026 à 10h00")
    const slash = body.matchAll(/(\d{1,2}\/\d{2}\/\d{4}(?:\s+(?:à\s+)?\d{1,2}[h:]\d{2})?)/gi);
    for (const m of slash) {
      const normalised = m[1].replace(/(\d{1,2})h(\d{2})/, '$1:$2').replace(/à\s+/, '');
      const d = parseDateString(normalised);
      if (d && !results.includes(d)) results.push(d);
    }
    return results;
  }

  private extractEarning(body: string, isEn: boolean): number | null {
    if (isEn) {
      const m = body.match(/(?:you(?:'ll|'ll)?\s+earn|earnings?|revenue)\s*:?\s*\$?\s*([\d\s,.]+)/i);
      if (m) return this.parseAmount(m[1]);
    } else {
      const m = body.match(/(?:vous\s+gagn|revenu|r[eé]mun[eé]ration)\w*\s*:?\s*([\d\s,.]+)\s*€/i);
      if (m) return this.parseAmount(m[1]);
      const m2 = body.match(/([\d\s,.]+)\s*€\s*(?:de\s+)?(?:gain|revenu|r[eé]mun[eé])/i);
      if (m2) return this.parseAmount(m2[1]);
    }
    return null;
  }

  private extractPickup(body: string, isEn: boolean): string | null {
    if (isEn) {
      const m = body.match(/(?:pickup\s+location|location|address)\s*[:\n]+\s*([^\n]{5,100})/i);
      if (m) return m[1].trim();
    } else {
      const m = body.match(/(?:lieu\s+de\s+prise\s+en\s+charge|adresse|lieu)\s*[:\n]+\s*([^\n]{5,100})/i);
      if (m) return m[1].trim();
    }
    return null;
  }

  private extractPhone(body: string): string | null {
    // Labeled: "Téléphone : +33 6 ..."
    const labeled = body.match(/(?:phone|téléphone|mobile|tel)\.?\s*[:\-]?\s*(\+?[\d\s\-().]{7,20})/i);
    if (labeled) return labeled[1].trim();

    // Standalone international number (e.g. "+33 6 99 18 04 54" as a bare line)
    const intl = body.match(/(\+\d{1,3}(?:[\s\-]?\d){8,12})/);
    if (intl) return intl[1].trim();

    return null;
  }

  private extractMileage(body: string, isEn: boolean): number | null {
    if (isEn) {
      const m = body.match(/(?:mileage|distance|miles?)\s*(?:included|allowance|limit)?\s*[:\-]?\s*(\d[\d,]*)\s*(?:km|miles?)/i);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    } else {
      const m = body.match(/(?:kilom[eé]trage|distance)(?:\s+\w+){0,2}\s*(?:inclus[e]?|limit[eé]e?)?\s*[:\-]?\s*(\d[\d\s]*)\s*km/i);
      if (m) return parseInt(m[1].replace(/\s/g, ''), 10);
    }
    return null;
  }

  private parseAmount(raw: string): number | null {
    const cleaned = raw.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }
}
