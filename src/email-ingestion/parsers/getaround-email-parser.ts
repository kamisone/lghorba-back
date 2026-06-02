import { Injectable } from '@nestjs/common';
import { ExtractedBooking } from '../entities/ingested-email.entity';
import { ProviderEmailParser, RawEmail } from './provider-email-parser.interface';
import { parseDateString } from './date-parser.util';

const GETAROUND_FROM    = 'automated@mail-eu.getaround.com';
const GETAROUND_SUBJECT = /location\s+confirm[eé]e?|r[eé]servation\s+confirm[eé]e?/i;
const GETAROUND_BODY    = /location\s+confirm[eé]e?|r[eé]servation\s+confirm[eé]e?|getaround/i;

@Injectable()
export class GetaroundEmailParser implements ProviderEmailParser {
  detect(email: RawEmail): boolean {
    if (!email.fromAddress.toLowerCase().includes(GETAROUND_FROM)) return false;
    return GETAROUND_SUBJECT.test(email.subject) || GETAROUND_BODY.test(email.text);
  }

  parse(email: RawEmail): ExtractedBooking {
    const body = this.flattenHtml(email.html) || email.text;

    const reservationNumber = this.extractReservationNumber(body, email.subject, email.html);
    const guestName         = this.extractGuestName(body);
    const vehicleName       = this.extractVehicleName(body, email.subject, email.html);
    const { start, end }    = this.extractDates(body, email.html, email.subject);
    const totalEarning      = this.extractEarning(body);
    const pickupLocation    = this.extractPickupLocation(body);
    const guestPhone        = this.extractPhone(body);
    const mileage           = this.extractMileage(body);

    if (!reservationNumber) throw new Error('Could not extract Getaround reservation number');
    if (!guestName)         throw new Error('Could not extract Getaround guest name');
    if (!vehicleName)       throw new Error('Could not extract Getaround vehicle name');
    if (!start)             throw new Error('Could not extract Getaround start date');
    if (!end)               throw new Error('Could not extract Getaround end date');

    return {
      provider: 'getaround',
      reservationNumber,
      guestName: guestName.trim(),
      vehicleName: vehicleName.trim(),
      startDateTime: start,
      endDateTime: end,
      totalEarning,
      pickupLocation: pickupLocation ?? null,
      guestPhone: guestPhone ?? null,
      includedMileageKm: mileage,
      detectedLanguage: 'fr',
      platformProfileUrl: null, // will be added when Getaround email is analysed
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private flattenHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/td>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }

  private extractReservationNumber(body: string, subject: string, rawHtml?: string): string | null {
    // Highest priority: rental ID from the Getaround dashboard URL in raw HTML
    if (rawHtml) {
      const urlM = rawHtml.match(/\/(?:dashboard\/)?rentals\/(\d{5,12})/);
      if (urlM) return urlM[1];
    }

    const targets = [subject, body];
    for (const t of targets) {
      // "B123456789", "#123456", or explicit label "Réservation 123456"
      const m = t.match(/\bB(\d{7,12})\b/)
             ?? t.match(/#\s*(\d{5,12})\b/)
             ?? t.match(/(?:r[eé]f[eé]rence|r[eé]servation)\s*(?:n[o°]\.?|:)?\s*([A-Z0-9]{5,12})\b/i);
      if (m) return m[1].toUpperCase();
    }
    return null;
  }

  private extractGuestName(body: string): string | null {
    const m =
      // "Conducteur : Jean Dupont" or "Locataire : Jean Dupont"
      body.match(/(?:conducteur|locataire|client|driver)\s*[:\-]\s*([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']{1,50})/i)
      // "réservé par Jean Dupont"
      ?? body.match(/(?:r[eé]serv[eé] par|lou[eé] par)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']{1,50})/i)
      // "Félicitations, Jean Dupont a confirmé la location."
      ?? body.match(/f[eé]licitations,\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']+?)\s+a\s+confirm[eé]/i)
      // Generic fallback: "Name a confirmé la location"
      ?? body.match(/([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ\s\-']+?)\s+a\s+confirm[eé]\s+la\s+location/i);
    return m ? m[1].trim() : null;
  }

  private extractVehicleName(body: string, subject?: string, rawHtml?: string): string | null {
    // 1. Subject: "Renault Mégane (DQ589PJ): location confirmée..." (no ^ anchor — subject may have prefix)
    if (subject) {
      const m = subject.match(/([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ0-9\s]{2,40}?)\s*\([A-Z0-9]{4,10}\)/i);
      if (m) return m[1].trim();
    }

    if (rawHtml) {
      // 2. <body aria-label="Renault Mégane (DQ589PJ): location confirmée...">
      const ariaM = rawHtml.match(/<body[^>]*\baria-label="([^"]+)"/i);
      if (ariaM) {
        const m = ariaM[1].match(/^([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ0-9\s]{2,40}?)\s*\(/i);
        if (m) return m[1].trim();
      }

      // 3. Text immediately before <span class="car-plate-number"> inside mail-card__title
      const plateM = rawHtml.match(/>([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ0-9\s\n\r]{2,60}?)\s*<span[^>]*car-plate-number/i);
      if (plateM) {
        const name = plateM[1].replace(/\s+/g, ' ').trim();
        if (name.length >= 3) return name;
      }

      // 4. img alt near mail-card__image-container (extended range for heavy inline-style emails)
      const imgM = rawHtml.match(/class="mail-card__image-container"[\s\S]{0,3000}?<img\b[^>]*\balt="([^"]{3,60})"/i);
      if (imgM && imgM[1].trim()) return imgM[1].trim();
    }

    // 5. Labelled patterns in flattened body
    const m = body.match(/(?:v[eé]hicule|voiture|car)\s*[:\-]\s*([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][^\n]{3,60})/i)
           ?? body.match(/votre\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜŸ][a-zA-ZÀ-ÿ0-9\s]{2,40})/i);
    return m ? m[1].trim() : null;
  }

  private extractDates(body: string, rawHtml?: string, subject?: string): { start: string | null; end: string | null } {
    let start: string | null = null;
    let end: string | null   = null;

    // 1. Prefer aria-label on <body> — it always contains the year.
    //    "...location confirmée du dim 26 juil. 2026 à 20:00 au dim 02 août 2026 à 22:00"
    if (rawHtml) {
      const ariaM = rawHtml.match(/<body[^>]*\baria-label="([^"]+)"/i);
      if (ariaM) {
        const allDates = this.extractAllFrDates(ariaM[1]);
        if (allDates[0]) start = allDates[0];
        if (allDates[1]) end   = allDates[1];
      }
    }

    // 2. Email subject — reliably contains full dates with year, e.g.
    //    "Renault Mégane (DQ589PJ): location confirmée du ven 05 juin 2026 à 09:00 au sam 06 juin 2026 à 20:00"
    if ((!start || !end) && subject) {
      const subjectDates = this.extractAllFrDates(subject);
      if (!start && subjectDates[0]) start = subjectDates[0];
      if (!end   && subjectDates[1]) end   = subjectDates[1];
    }

    // 3. Labelled patterns in flattened body: "Début : lundi 15 février 2025 à 10h00"
    if (!start || !end) {
      const startM = body.match(/(?:d[eé]but|prise\s+en\s+charge|d[eé]part|du)\s*[:\-\n]+\s*([^\n]{5,80})/i);
      const endM   = body.match(/(?:fin|retour|restitution|au)\s*[:\-\n]+\s*([^\n]{5,80})/i);
      if (!start && startM) start = parseDateString(startM[1]);
      if (!end   && endM)   end   = parseDateString(endM[1]);
    }

    // 4. Fallback: scan body for any French date strings with year
    if (!start || !end) {
      const allDates = this.extractAllFrDates(body);
      if (!start && allDates[0]) start = allDates[0];
      if (!end   && allDates[1]) end   = allDates[1];
    }

    // 5. Last resort: extract dates from rental-dates elements in raw HTML.
    //    These lack a year, so infer it from subject or aria-label first.
    if ((!start || !end) && rawHtml) {
      const yearSrc = subject ?? rawHtml;
      const yearM   = yearSrc.match(/\b(20\d{2})\b/);
      const year    = yearM ? yearM[1] : String(new Date().getFullYear());

      for (const m of rawHtml.matchAll(/class="[^"]*rental-dates[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
        const raw = m[1].replace(/<[^>]+>/g, '').trim();
        // raw: "ven 5 juin à 09:00" — inject the year so parseFrench can handle it
        const withYear = raw.replace(
          /(\d{1,2})\s+([a-zéèêîôûùàâäë]+)\s+(?:à\s+)?(\d{1,2}[h:]\d{2})/i,
          `$1 $2 ${year} à $3`,
        );
        const d = parseDateString(withYear);
        if (d) {
          if (!start) { start = d; continue; }
          if (!end)   { end   = d; break; }
        }
      }
    }

    return { start, end };
  }

  private extractAllFrDates(body: string): string[] {
    const results: string[] = [];
    const re = /\d{1,2}\s+[a-zéèêîôûùàâäë]+\.?\s+\d{4}\s+(?:à\s+)?\d{1,2}[h:]\d{2}/gi;
    for (const m of body.matchAll(re)) {
      const d = parseDateString(m[0]);
      if (d) results.push(d);
    }
    // Also try DD/MM/YYYY HH:mm
    const reSlash = /\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/g;
    for (const m of body.matchAll(reSlash)) {
      const d = parseDateString(m[0]);
      if (d && !results.includes(d)) results.push(d);
    }
    return results;
  }

  private extractEarning(body: string): number | null {
    // "Vous gagnez 45,00 €" or "Revenu : 45 €"
    const m = body.match(/(?:vous\s+gagnez?|revenu|gain|r[eé]mun[eé]ration)\s*:?\s*([\d\s,.]+)\s*€/i)
           ?? body.match(/([\d\s,.]+)\s*€\s*(?:de\s+)?(?:gain|revenu)/i);
    if (!m) return null;
    const cleaned = m[1].replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  }

  private extractPickupLocation(body: string): string | null {
    const m = body.match(/(?:lieu\s+de\s+prise\s+en\s+charge|adresse\s+de\s+d[eé]part|adresse)\s*[:\-]\s*([^\n]{5,100})/i);
    return m ? m[1].trim() : null;
  }

  private extractPhone(body: string): string | null {
    const m = body.match(/(?:t[eé]l[eé]phone?|mobile|portable|contact)\s*[:\-]?\s*(\+?[\d\s\-().]{7,20})/i);
    return m ? m[1].trim() : null;
  }

  private extractMileage(body: string): number | null {
    const m = body.match(/(?:kilom[eé]trage|distance)\s*(?:inclus|illimit[eé]e?|allou[eé]e?)?\s*[:\-]?\s*(\d[\d\s]*)\s*km/i);
    return m ? parseInt(m[1].replace(/\s/g, ''), 10) : null;
  }
}
