/**
 * Normalises provider-specific date strings to ISO 8601 (Europe/Paris TZ assumed).
 * Returns null when the string cannot be parsed.
 */

const FR_MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  février: 2, fevrier: 2, févr: 2, fev: 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  août: 8, aout: 8,
  septembre: 9, sept: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  décembre: 12, decembre: 12, déc: 12, dec: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

// Europe/Paris offset: CEST (+02:00) from last Sunday of March to last Sunday of October,
// CET (+01:00) otherwise. We check by calendar day which is accurate for all practical booking times.
function parisTzOffset(year: number, month: number, day: number): string {
  const lastSunday = (y: number, m: number): number => {
    const d = new Date(Date.UTC(y, m, 0)); // last day of month (m is 0-indexed here)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // step back to Sunday
    return d.getUTCDate();
  };
  const dstStart = lastSunday(year, 3);  // last Sunday of March
  const dstEnd   = lastSunday(year, 10); // last Sunday of October
  const inDst = (month > 3 || (month === 3 && day >= dstStart))
             && (month < 10 || (month === 10 && day < dstEnd));
  return inDst ? '+02:00' : '+01:00';
}

function buildIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const tz = parisTzOffset(year, month, day);
  return `${year}-${padTwo(month)}-${padTwo(day)}T${padTwo(hour)}:${padTwo(minute)}:00${tz}`;
}

/**
 * French patterns:
 *   "samedi 15 février 2025 à 10h00"
 *   "15 févr. 2025 10:00"
 *   "15/02/2025 10:00"
 */
function parseFrench(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');

  // "15 février 2025 à 10h00" or "samedi 15 février 2025 à 10h00"
  // Also accepts "15 mai 2026 12:00" (Turo prose uses colon, not h)
  const longFr = s.match(
    /(?:\w+\s+)?(\d{1,2})\s+([a-zéèêîôûùàâäë]+)\s+(\d{4})\s+(?:à\s+)?(\d{1,2})[h:](\d{2})/,
  );
  if (longFr) {
    const [, d, mName, y, h, m] = longFr;
    const month = FR_MONTHS[mName.replace(/é/g, 'e').replace(/û/g, 'u').replace(/è/g, 'e')];
    if (month) return buildIso(+y, month, +d, +h, +m);
  }

  // "15/02/2025 10:00", "15-02-2025 10:00", or "15/02/2025 10h00" (French h separator)
  const slashFr = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2})[h:](\d{2})/);
  if (slashFr) {
    const [, d, mo, y, h, mi] = slashFr;
    return buildIso(+y, +mo, +d, +h, +mi);
  }

  // Bare date with no time — return null so callers fall back to richer patterns.
  // Defaulting to 00:00 would silently create midnight bookings on parse failures.
  return null;
}

/**
 * English patterns:
 *   "Saturday, February 15, 2025 at 10:00 AM"
 *   "Feb 15, 2025 10:00 AM"
 *   "2025-02-15 10:00"
 */
function parseEnglish(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');

  // "february 15, 2025 at 10:00 am" or "sunday, april 26, 2026, 5:30 am" (comma after year)
  const longEn = s.match(
    /(?:\w+,\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/,
  );
  if (longEn) {
    const [, mName, d, y, hRaw, mi, ampm] = longEn;
    const month = EN_MONTHS[mName];
    if (month) {
      let h = +hRaw;
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return buildIso(+y, month, +d, h, +mi);
    }
  }

  // ISO-like "2025-02-15 10:00" or "2025-02-15T10:00"
  const isoLike = s.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (isoLike) {
    const [, y, mo, d, h, mi] = isoLike;
    return buildIso(+y, +mo, +d, +h, +mi);
  }

  // American M/D/YY[YY] — "4/26/2026 5:30 PM" (time required; bare dates return null)
  const usSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/);
  if (usSlash) {
    const [, mo, d, yRaw, hStr, miStr, ampm] = usSlash;
    if (!hStr) return null; // bare date without explicit time — let callers use a richer fallback
    const y = +yRaw < 100 ? 2000 + +yRaw : +yRaw;
    let h = +hStr;
    const mi = +miStr;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return buildIso(y, +mo, +d, h, mi);
  }

  return null;
}

export function parseDateString(raw: string): string | null {
  if (!raw) return null;
  return parseFrench(raw) ?? parseEnglish(raw) ?? null;
}
