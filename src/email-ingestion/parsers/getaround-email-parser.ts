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
    const { start, end }    = this.extractDates(body);
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
    // Subject format: "Peugeot 208 (DL914AP): location confirmée..."
    if (subject) {
      const m = subject.match(/^([A-ZÀÂÄÉ][a-zA-ZÀ-ÿ0-9\s]{2,40}?)\s*\([A-Z0-9]+\)/i);
      if (m) return m[1].trim();
    }

    // Raw HTML: car image alt inside mail-card__image-container
    if (rawHtml) {
      const m = rawHtml.match(/mail-card__image-container[\s\S]{0,300}?alt="([^"]+)"/i);
      if (m) return m[1].trim();
    }

    // Labelled patterns: "Véhicule : Peugeot 208" or "votre Renault Clio"
    const m = body.match(/(?:v[eé]hicule|voiture|car)\s*[:\-]\s*([A-ZÀÂÄÉ][^\n]{3,60})/i)
           ?? body.match(/votre\s+([A-ZÀÂÄÉ][a-zA-ZÀ-ÿ0-9\s]{2,40})/i);
    return m ? m[1].trim() : null;
  }

  private extractDates(body: string): { start: string | null; end: string | null } {
    let start: string | null = null;
    let end: string | null   = null;

    // "Début : lundi 15 février 2025 à 10h00"
    const startM = body.match(/(?:d[eé]but|prise\s+en\s+charge|d[eé]part|du)\s*[:\-\n]+\s*([^\n]{5,80})/i);
    const endM   = body.match(/(?:fin|retour|restitution|au)\s*[:\-\n]+\s*([^\n]{5,80})/i);

    if (startM) start = parseDateString(startM[1]);
    if (endM)   end   = parseDateString(endM[1]);

    // Fallback: grab all French date strings
    if (!start || !end) {
      const allDates = this.extractAllFrDates(body);
      if (!start && allDates[0]) start = allDates[0];
      if (!end   && allDates[1]) end   = allDates[1];
    }

    return { start, end };
  }

  private extractAllFrDates(body: string): string[] {
    const results: string[] = [];
    const re = /\d{1,2}\s+[a-zéèêîôûùàâäë]+\.?\s+\d{4}\s+(?:à\s+)?\d{1,2}h\d{2}/gi;
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
