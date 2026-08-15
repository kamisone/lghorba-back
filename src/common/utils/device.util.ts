export type DeviceType = 'mobile' | 'desktop';

// Tablets are grouped under "mobile" — the analytics ask is a binary
// mobile-vs-desktop split, not a three-way device-class breakdown.
const MOBILE_UA_PATTERN =
  /Mobi|Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

/** Null when no User-Agent was available to classify (never guessed). */
export function deviceFromUserAgent(
  userAgent: string | null | undefined,
): DeviceType | null {
  if (!userAgent) return null;
  return MOBILE_UA_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}
