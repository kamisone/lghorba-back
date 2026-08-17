/** How long a session replay (metadata + GCS chunks) is kept before the retention job purges it. */
export const REPLAY_RETENTION_DAYS = parseInt(process.env.REPLAY_RETENTION_DAYS ?? '', 10) || 30;

/** Hard caps on one ingested batch — reject rather than accept unbounded client payloads. */
export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 2 * 1024 * 1024; // 2 MB

/** A session accumulating more raw events than this stops accepting further chunks (runaway/abuse guard). */
export const MAX_SESSION_EVENTS = 20_000;

/** GCS object key prefix for replay chunks — outside `media/` so AssetUrlService signs rather than serves publicly. */
export const REPLAY_GCS_PREFIX = 'replay-sessions';

export const REPLAY_EVENT_TYPES = [
  'session_start',
  'session_end',
  'click',
  'scroll',
  'navigation',
] as const;
