import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
// Namespace import, not default: geoip-lite is a plain CJS `module.exports`
// object, and a default import silently resolves to undefined at runtime.
import * as geoip from 'geoip-lite';

/**
 * Salt for the visitor digest. Without it the hash would be a rainbow-table
 * lookup away from the original address — the IPv4 space is small enough to
 * enumerate. Falls back to an existing secret so no new env var is required to
 * deploy; set ANALYTICS_IP_SALT to rotate (which resets visitor identity, so
 * counts restart from that point).
 */
const VISITOR_SALT =
  process.env.ANALYTICS_IP_SALT ??
  process.env.SECRETS_ENCRYPTION_KEY ??
  process.env.JWT_SECRET ??
  'lghorba-visitor-salt';

@Injectable()
export class GeoIpService {
  /**
   * Resolves a client IP to its ISO-3166-1 alpha-2 country code (e.g. "FR"),
   * or null if unresolvable (private/local IPs, lookup miss). Offline lookup
   * (geoip-lite's bundled database) — the IP itself is never sent anywhere
   * or persisted; only this derived country code is stored by callers.
   */
  countryFromIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    const cleaned = ip.replace(/^::ffff:/, '');
    return geoip.lookup(cleaned)?.country ?? null;
  }

  /**
   * Stable pseudonymous id for a visitor, derived from their IP.
   *
   * Lets analytics count one visitor once per product however many times they
   * refresh, without persisting the address: the salted digest is one-way, and
   * the IP is discarded as soon as this returns. Deliberately not
   * per-product — reports group by product already, so `COUNT(DISTINCT
   * visitorHash)` within a product group is exactly "unique IPs for this
   * product".
   *
   * Returns null when the address is unknown, so callers store NULL rather than
   * a digest of the string "null" that would merge every unidentified visitor
   * into a single one.
   */
  visitorHashFromIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    const cleaned = ip.replace(/^::ffff:/, '').trim();
    if (!cleaned) return null;
    return createHash('sha256').update(`${VISITOR_SALT}:${cleaned}`).digest('hex');
  }
}
