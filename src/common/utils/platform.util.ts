/**
 * Classifies a visitor's first-touch acquisition channel from an explicit
 * `utm_source` campaign tag (wins when present) or the Referer captured at
 * landing. Mirrors device.util.ts's convention: null when there's nothing to
 * classify (never guessed), never persisted with a fake "Direct" default.
 */

const UTM_SOURCE_MAP: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  tiktok: 'TikTok',
  google: 'Google',
  youtube: 'YouTube',
  twitter: 'X',
  x: 'X',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  snapchat: 'Snapchat',
  newsletter: 'Newsletter',
  email: 'Email',
};

const HOST_PATTERNS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)l\.instagram\.com$/i, 'Instagram'],
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)fb\.com$/i, 'Facebook'],
  [/(^|\.)lm\.facebook\.com$/i, 'Facebook'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)google\.[a-z.]+$/i, 'Google'],
  [/(^|\.)youtube\.com$/i, 'YouTube'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/i, 'X'],
  [/(^|\.)pinterest\.[a-z.]+$/i, 'Pinterest'],
  [/(^|\.)whatsapp\.com$/i, 'WhatsApp'],
  [/(^|\.)snapchat\.com$/i, 'Snapchat'],
];

/**
 * `utmSource` takes priority — it's a deliberate campaign tag, more reliable
 * than a Referer header (which browsers/apps increasingly strip or rewrite).
 * An unrecognized utm_source is surfaced verbatim rather than discarded, since
 * it's a label the admin chose themselves. Falls back to matching the
 * referrer's hostname against known platforms; a present-but-unmatched
 * referrer (a genuine external site) reports as 'Other' rather than null, to
 * keep "we know nothing" (null) distinct from "we know it wasn't one of
 * these" (Other).
 */
export function platformFromSource(
  referrer?: string | null,
  utmSource?: string | null,
): string | null {
  if (utmSource) {
    const key = utmSource.trim().toLowerCase();
    if (UTM_SOURCE_MAP[key]) return UTM_SOURCE_MAP[key];
    return utmSource.trim().slice(0, 30);
  }

  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    for (const [pattern, label] of HOST_PATTERNS) {
      if (pattern.test(host)) return label;
    }
    return 'Other';
  } catch {
    return null;
  }
}
