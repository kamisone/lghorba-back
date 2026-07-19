import { Injectable } from '@nestjs/common';
// Namespace import, not default: geoip-lite is a plain CJS `module.exports`
// object, and a default import silently resolves to undefined at runtime.
import * as geoip from 'geoip-lite';

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
}
