import { REPLAY_EVENT_TYPES } from './replay.constants';
import { ReplayEventType } from '../entities/replay-event.entity';

export interface ReplayMarkerInput {
  type: ReplayEventType;
  timestampMs: number;
  label?: string | null;
  meta?: Record<string, unknown> | null;
}

const isEventType = (v: unknown): v is ReplayEventType =>
  typeof v === 'string' && (REPLAY_EVENT_TYPES as readonly string[]).includes(v);

/**
 * Validates/sanitizes a batch of client-supplied marker rows. Never throws —
 * this is a public, unauthenticated endpoint, so a malformed or hostile
 * payload should just lose the bad entries, not 500 the whole ingest.
 */
export function sanitizeMarkers(raw: unknown): ReplayMarkerInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayMarkerInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { type, timestampMs, label, meta } = item as Record<string, unknown>;
    if (!isEventType(type)) continue;
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) continue;
    out.push({
      type,
      timestampMs: Math.round(timestampMs),
      label: typeof label === 'string' ? label.slice(0, 255) : null,
      meta: meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : null,
    });
  }
  return out;
}

/**
 * Strips query string/hash (may carry tokens, coupon codes, or PII typed
 * into a search box) and caps length. Rejects anything that isn't a
 * same-site relative path — the recorder should only ever report pages on
 * this shop, so a full external URL here means a tampered/buggy client.
 */
export function sanitizePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (!raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0];
  return path.slice(0, 500) || null;
}

export function sanitizePageTitle(raw: unknown): string | null {
  return typeof raw === 'string' && raw ? raw.slice(0, 300) : null;
}

export function sanitizeViewport(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 20000
    ? Math.round(raw)
    : null;
}

export function computeDurationMs(startedAt: Date, endedAt: Date): number {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

/** Everything strictly older than the cutoff is eligible for retention purge. */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// Defense-in-depth server-side backstop behind the client's rrweb masking
// config (maskAllInputs + blockClass/maskTextClass) — catches sensitive
// values that end up in recorded text nodes rather than form inputs (e.g. an
// email printed as page copy, not typed into a field), which client-side
// input-masking alone would not cover.
//
// Deliberately NOT scanning for bare phone-number digit runs here: rrweb's
// own event envelope always contains 13-digit epoch-millisecond timestamps
// and large sequential DOM node ids, so any bare-digit-run pattern loose
// enough to catch a phone number also matches those on every single batch —
// that would reject ordinary, harmless sessions outright. Phone numbers are
// covered where it's reliable instead: client-side masking of
// `input[type=tel]` (see maskInputOptions in the recorder). The credit-card
// pattern below only matches digits *explicitly grouped* with separators
// (how card numbers are actually displayed/typed), which a raw timestamp or
// node id never is, so it doesn't share that false-positive risk.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const CREDIT_CARD_RE = /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]?\d{1,7}\b/;

/**
 * Scans a raw event-batch JSON string for values that look like an email or
 * a grouped card number. Used to reject a chunk outright rather than
 * silently store it — the client is expected to mask these before they ever
 * reach this text, so a hit here means the masking config missed something.
 */
export function containsLikelySensitiveData(rawJson: string): boolean {
  return EMAIL_RE.test(rawJson) || CREDIT_CARD_RE.test(rawJson);
}
