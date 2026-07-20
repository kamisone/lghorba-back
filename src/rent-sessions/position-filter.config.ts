import {
  DEFAULT_POSITION_FILTER_CONFIG,
  GeoBounds,
  PositionFilterConfig,
} from './position-filter';

/**
 * Env resolution lives here rather than in position-filter.ts so the filter
 * itself stays pure and its spec needs no env mocking.
 */

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `GPS_GEO_BOUNDS="latMin,latMax,lngMin,lngMax"`, or "off" to disable. */
function bounds(fallback: GeoBounds | null): GeoBounds | null {
  const raw = process.env.GPS_GEO_BOUNDS?.trim();
  if (!raw) return fallback;
  if (raw.toLowerCase() === 'off') return null;
  const parts = raw.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return fallback;
  const [latMin, latMax, lngMin, lngMax] = parts;
  return { latMin, latMax, lngMin, lngMax };
}

export function loadPositionFilterConfig(): PositionFilterConfig {
  const d = DEFAULT_POSITION_FILTER_CONFIG;
  return {
    maxSpeedKmh: num('GPS_MAX_SPEED_KMH', d.maxSpeedKmh),
    noiseFloorKm: num('GPS_NOISE_FLOOR_KM', d.noiseFloorKm),
    minDtHours: d.minDtHours,
    staleAnchorHours: num('GPS_STALE_ANCHOR_HOURS', d.staleAnchorHours),
    confirmRadiusKm: num('GPS_CONFIRM_RADIUS_KM', d.confirmRadiusKm),
    confirmMaxGapHours: num('GPS_CONFIRM_MAX_GAP_HOURS', d.confirmMaxGapHours),
    futureToleranceMs: d.futureToleranceMs,
    dedupeWindowMs: d.dedupeWindowMs,
    geoBounds: bounds(d.geoBounds),
  };
}
