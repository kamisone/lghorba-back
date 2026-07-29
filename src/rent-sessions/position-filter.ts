import { haversineKm } from '../common/utils/map.util';

/**
 * Plausibility filter for inbound GPS positions.
 *
 * Positions arrive by scraping a Maps URL out of an SMS reply, so the phone can
 * fall back to cell-tower location when it has no satellite fix — producing a
 * point that may be tens of kilometres off.
 *
 * The filter is deliberately time-aware: it judges *implied speed*, never raw
 * distance. A car can be offline for hours in an area with no network and then
 * legitimately report a position hundreds of kilometres away.
 *
 * Pure by design (clock is injected, no repository, no env access) so it can be
 * unit-tested without a database.
 */

export interface FilterCandidate {
  lat: number;
  lng: number;
  recordedAt: Date;
  rawMessage?: string | null;
}

/** Minimal shape of an already-stored position the filter compares against. */
export interface FilterReference {
  id: string;
  lat: number;
  lng: number;
  recordedAt: Date;
  rawMessage?: string | null;
}

export interface GeoBounds {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export interface PositionFilterConfig {
  /** Implied speed above which a move is considered impossible. */
  maxSpeedKmh: number;
  /** Movement below this is treated as GPS jitter while parked. */
  noiseFloorKm: number;
  /** Floor on elapsed time, so a tiny gap cannot inflate implied speed. */
  minDtHours: number;
  /** Beyond this the anchor says nothing about plausible displacement. */
  staleAnchorHours: number;
  /** Two readings within this distance corroborate each other. */
  confirmRadiusKm: number;
  /** A corroborating reading later than this is a different trip. */
  confirmMaxGapHours: number;
  /** Clock-skew tolerance for timestamps in the future. */
  futureToleranceMs: number;
  /** Window in which an identical rawMessage is treated as a retry. */
  dedupeWindowMs: number;
  /**
   * A candidate stamped slightly before the anchor is tolerated up to this
   * much and judged by speed instead of rejected outright — concurrent POSTs
   * from one SMS burst can be persisted out of stamped order.
   */
  outOfOrderToleranceMs: number;
  /** Optional bounding box; null disables the check. */
  geoBounds: GeoBounds | null;
}

/**
 * How often the phone is polled for a fix. `recordedAt` is SMS *receipt* time,
 * not GPS fix time — the companion phone queues replies while offline and
 * posts them in a burst, so fixes representing this much real driving can
 * arrive seconds apart. `minDtHours` below must never be tighter than this,
 * or receipt-time delta divided into real distance produces impossible speeds
 * and every fix in a burst gets rejected. rent-sessions.service.ts derives its
 * polling interval from this same constant so the two cannot drift apart.
 */
export const TRACKING_INTERVAL_HOURS = 0.25;

export const DEFAULT_POSITION_FILTER_CONFIG: PositionFilterConfig = {
  maxSpeedKmh: 200,
  noiseFloorKm: 0.3,
  minDtHours: TRACKING_INTERVAL_HOURS,
  staleAnchorHours: 24,
  confirmRadiusKm: 5,
  confirmMaxGapHours: 6,
  futureToleranceMs: 5 * 60 * 1000,
  dedupeWindowMs: 60 * 1000,
  outOfOrderToleranceMs: 5 * 60 * 1000,
  // Morocco including Western Sahara, with a small margin.
  geoBounds: { latMin: 20.5, latMax: 36.2, lngMin: -17.3, lngMax: -0.8 },
};

export type RejectReason =
  | 'non_finite'
  | 'invalid_timestamp'
  | 'lat_out_of_range'
  | 'lng_out_of_range'
  | 'null_island'
  | 'future_timestamp'
  | 'outside_geo_bounds'
  | 'duplicate'
  | 'non_monotonic'
  | 'implied_speed';

export interface FilterResult {
  accepted: boolean;
  reason?: RejectReason;
  /** Present whenever the speed stage ran, accepted or not — persisted for tuning. */
  impliedSpeedKmh?: number;
  /** Set when a previously rejected position was corroborated and must be un-rejected. */
  unrejectPositionId?: string;
}

export interface FilterContext {
  /** Most recent accepted position for the session, or null. */
  anchor: FilterReference | null;
  /** Most recent rejected position for the session, used for corroboration. */
  lastRejected: FilterReference | null;
  /** Injected clock, for deterministic tests. */
  now: Date;
  config?: Partial<PositionFilterConfig>;
}

const MS_PER_HOUR = 3_600_000;

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR;
}

function impliedSpeed(
  from: FilterReference,
  to: FilterCandidate,
  cfg: PositionFilterConfig,
): { distKm: number; dtHours: number; speedKmh: number } {
  const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const dtHours = Math.max(cfg.minDtHours, hoursBetween(from.recordedAt, to.recordedAt));
  return { distKm, dtHours, speedKmh: distKm / dtHours };
}

export function filterPosition(candidate: FilterCandidate, ctx: FilterContext): FilterResult {
  const cfg = { ...DEFAULT_POSITION_FILTER_CONFIG, ...ctx.config };
  const { anchor, lastRejected, now } = ctx;

  // --- Stage 0: structural -------------------------------------------------
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
    return { accepted: false, reason: 'non_finite' };
  }
  const recordedMs = candidate.recordedAt?.getTime();
  if (recordedMs === undefined || Number.isNaN(recordedMs)) {
    // An invalid Date makes every later comparison silently false.
    return { accepted: false, reason: 'invalid_timestamp' };
  }
  if (candidate.lat < -90 || candidate.lat > 90) {
    return { accepted: false, reason: 'lat_out_of_range' };
  }
  if (candidate.lng < -180 || candidate.lng > 180) {
    return { accepted: false, reason: 'lng_out_of_range' };
  }
  if (Math.abs(candidate.lat) < 0.001 && Math.abs(candidate.lng) < 0.001) {
    // Null island: the phone returned a garbage fix.
    return { accepted: false, reason: 'null_island' };
  }
  if (recordedMs > now.getTime() + cfg.futureToleranceMs) {
    return { accepted: false, reason: 'future_timestamp' };
  }

  // --- Stage 1: geographic bounds -----------------------------------------
  const b = cfg.geoBounds;
  if (
    b &&
    (candidate.lat < b.latMin ||
      candidate.lat > b.latMax ||
      candidate.lng < b.lngMin ||
      candidate.lng > b.lngMax)
  ) {
    return { accepted: false, reason: 'outside_geo_bounds' };
  }

  // Nothing to compare against: first position of the session.
  if (!anchor) return { accepted: true };

  // --- Stage 2: duplicates and ordering ------------------------------------
  // The Android app retries POSTs, and recordedAt is server receipt time, so a
  // retry looks strictly newer. Content is the reliable duplicate signal.
  if (
    candidate.rawMessage &&
    anchor.rawMessage &&
    candidate.rawMessage === anchor.rawMessage &&
    Math.abs(recordedMs - anchor.recordedAt.getTime()) <= cfg.dedupeWindowMs
  ) {
    return { accepted: false, reason: 'duplicate' };
  }
  if (recordedMs <= anchor.recordedAt.getTime()) {
    const behindMs = anchor.recordedAt.getTime() - recordedMs;
    if (behindMs > cfg.outOfOrderToleranceMs) {
      return { accepted: false, reason: 'non_monotonic' };
    }
    // Within tolerance: fall through to stage 3, which floors the negative
    // elapsed time to minDtHours and judges the reading on implied speed
    // rather than discarding it purely for arriving out of stamped order.
  }

  // --- Stage 3: implied speed ----------------------------------------------
  if (hoursBetween(anchor.recordedAt, now) > cfg.staleAnchorHours) {
    // Too old to judge — the car could legitimately be anywhere by now.
    return { accepted: true };
  }

  const { distKm, speedKmh } = impliedSpeed(anchor, candidate, cfg);
  if (distKm <= cfg.noiseFloorKm) {
    // Parked: GPS jitter, not movement. Checked before speed so a small
    // displacement over a short gap is not read as a high speed.
    return { accepted: true };
  }
  if (speedKmh <= cfg.maxSpeedKmh) {
    return { accepted: true, impliedSpeedKmh: speedKmh };
  }

  // --- Stage 4: corroboration ----------------------------------------------
  // The jump is implausible against the anchor. If the previous rejected
  // reading agrees with this one, two independent fixes concur that the car
  // really did relocate, so accept both and re-anchor. An isolated tower
  // fallback stays rejected, because the next true reading returns to the track.
  if (
    lastRejected &&
    lastRejected.recordedAt > anchor.recordedAt &&
    hoursBetween(lastRejected.recordedAt, candidate.recordedAt) <= cfg.confirmMaxGapHours
  ) {
    const fromRejected = impliedSpeed(lastRejected, candidate, cfg);
    if (
      fromRejected.distKm <= cfg.confirmRadiusKm ||
      fromRejected.speedKmh <= cfg.maxSpeedKmh
    ) {
      return {
        accepted: true,
        impliedSpeedKmh: speedKmh,
        unrejectPositionId: lastRejected.id,
      };
    }
  }

  return { accepted: false, reason: 'implied_speed', impliedSpeedKmh: speedKmh };
}
