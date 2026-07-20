import {
  DEFAULT_POSITION_FILTER_CONFIG,
  FilterContext,
  FilterReference,
  filterPosition,
  PositionFilterConfig,
} from './position-filter';

const BASE = new Date('2026-01-01T12:00:00Z');
const at = (minutes: number) => new Date(BASE.getTime() + minutes * 60_000);

const RABAT = { lat: 34.0209, lng: -6.8416 };
const CASABLANCA = { lat: 33.5731, lng: -7.5898 }; // ~87 km from Rabat
const MARRAKECH = { lat: 31.6295, lng: -7.9811 }; // ~320 km from Rabat
const DAKHLA = { lat: 23.6848, lng: -15.958 }; // ~1200 km from Rabat

function ref(
  coords: { lat: number; lng: number },
  minutes: number,
  extra: Partial<FilterReference> = {},
): FilterReference {
  return { id: `pos-${minutes}`, ...coords, recordedAt: at(minutes), ...extra };
}

function ctx(over: Partial<FilterContext> = {}): FilterContext {
  return { anchor: null, lastRejected: null, now: at(60), ...over };
}

/** Nudge a point by roughly `km` eastwards. */
function offsetKm(p: { lat: number; lng: number }, km: number) {
  return { lat: p.lat, lng: p.lng + km / (111.32 * Math.cos((p.lat * Math.PI) / 180)) };
}

describe('filterPosition', () => {
  describe('stage 0 — structural', () => {
    it('rejects non-finite coordinates', () => {
      expect(filterPosition({ lat: NaN, lng: -6.8, recordedAt: at(0) }, ctx())).toMatchObject({
        accepted: false,
        reason: 'non_finite',
      });
      expect(
        filterPosition({ lat: 34, lng: Infinity, recordedAt: at(0) }, ctx()),
      ).toMatchObject({ accepted: false, reason: 'non_finite' });
    });

    it('rejects out-of-range latitude and longitude', () => {
      expect(filterPosition({ lat: 91, lng: -6.8, recordedAt: at(0) }, ctx())).toMatchObject({
        reason: 'lat_out_of_range',
      });
      expect(filterPosition({ lat: 34, lng: -181, recordedAt: at(0) }, ctx())).toMatchObject({
        reason: 'lng_out_of_range',
      });
    });

    it('rejects null island, including near-zero coordinates', () => {
      expect(filterPosition({ lat: 0, lng: 0, recordedAt: at(0) }, ctx())).toMatchObject({
        reason: 'null_island',
      });
      expect(
        filterPosition({ lat: 0.0005, lng: -0.0009, recordedAt: at(0) }, ctx()),
      ).toMatchObject({ reason: 'null_island' });
    });

    it('rejects timestamps beyond the skew tolerance but allows small skew', () => {
      expect(
        filterPosition({ ...RABAT, recordedAt: at(120) }, ctx({ now: at(60) })),
      ).toMatchObject({ reason: 'future_timestamp' });
      expect(
        filterPosition({ ...RABAT, recordedAt: at(62) }, ctx({ now: at(60) })).accepted,
      ).toBe(true);
    });

    it('rejects an invalid Date rather than crashing', () => {
      const result = filterPosition({ ...RABAT, recordedAt: new Date('garbage') }, ctx());
      expect(result).toMatchObject({ accepted: false, reason: 'invalid_timestamp' });
    });
  });

  describe('stage 1 — geographic bounds', () => {
    const PARIS = { lat: 48.8566, lng: 2.3522 };

    it('rejects a point outside the configured bounds', () => {
      expect(filterPosition({ ...PARIS, recordedAt: at(0) }, ctx())).toMatchObject({
        reason: 'outside_geo_bounds',
      });
    });

    it('accepts anywhere when bounds are disabled', () => {
      expect(
        filterPosition({ ...PARIS, recordedAt: at(0) }, ctx({ config: { geoBounds: null } }))
          .accepted,
      ).toBe(true);
    });

    it('accepts points just inside each edge', () => {
      const b = DEFAULT_POSITION_FILTER_CONFIG.geoBounds!;
      const corners = [
        { lat: b.latMin + 0.01, lng: b.lngMin + 0.01 },
        { lat: b.latMax - 0.01, lng: b.lngMax - 0.01 },
      ];
      for (const c of corners) {
        expect(filterPosition({ ...c, recordedAt: at(0) }, ctx()).accepted).toBe(true);
      }
    });
  });

  describe('stage 2 — duplicates and ordering', () => {
    it('rejects a retry carrying an identical rawMessage', () => {
      const anchor = ref(RABAT, 0, { rawMessage: 'https://maps.google.com/?q=34.0209,-6.8416' });
      const result = filterPosition(
        { ...RABAT, recordedAt: at(10 / 60), rawMessage: anchor.rawMessage },
        ctx({ anchor }),
      );
      expect(result).toMatchObject({ accepted: false, reason: 'duplicate' });
    });

    it('rejects a timestamp equal to the anchor', () => {
      expect(
        filterPosition({ ...CASABLANCA, recordedAt: at(0) }, ctx({ anchor: ref(RABAT, 0) })),
      ).toMatchObject({ reason: 'non_monotonic' });
    });

    it('rejects an out-of-order delivery', () => {
      expect(
        filterPosition({ ...CASABLANCA, recordedAt: at(5) }, ctx({ anchor: ref(RABAT, 10) })),
      ).toMatchObject({ reason: 'non_monotonic' });
    });
  });

  describe('stage 3 — implied speed', () => {
    it('accepts the first position of a session', () => {
      const result = filterPosition({ ...RABAT, recordedAt: at(0) }, ctx({ anchor: null }));
      expect(result.accepted).toBe(true);
      expect(result.impliedSpeedKmh).toBeUndefined();
    });

    it('accepts any displacement once the anchor is stale', () => {
      const result = filterPosition(
        { ...DAKHLA, recordedAt: at(30 * 60 + 1) },
        ctx({ anchor: ref(RABAT, 0), now: at(30 * 60 + 1) }),
      );
      expect(result.accepted).toBe(true);
    });

    it('accepts parked GPS jitter regardless of how short the gap is', () => {
      const jitter = offsetKm(RABAT, 0.15);
      expect(
        filterPosition({ ...jitter, recordedAt: at(1) }, ctx({ anchor: ref(RABAT, 0) })).accepted,
      ).toBe(true);
      expect(
        filterPosition({ ...jitter, recordedAt: at(10 / 60) }, ctx({ anchor: ref(RABAT, 0) }))
          .accepted,
      ).toBe(true);
    });

    it('accepts a normal drive and reports the implied speed', () => {
      const result = filterPosition(
        { ...CASABLANCA, recordedAt: at(60) },
        ctx({ anchor: ref(RABAT, 0), now: at(60) }),
      );
      expect(result.accepted).toBe(true);
      expect(result.impliedSpeedKmh).toBeGreaterThan(80);
      expect(result.impliedSpeedKmh).toBeLessThan(95);
    });

    it('rejects a teleport between two consecutive pings', () => {
      const result = filterPosition(
        { ...MARRAKECH, recordedAt: at(15) },
        ctx({ anchor: ref(RABAT, 0), now: at(15) }),
      );
      expect(result).toMatchObject({ accepted: false, reason: 'implied_speed' });
      expect(result.impliedSpeedKmh).toBeGreaterThan(1000);
    });

    // The requirement that motivated this filter: no network for hours, then a
    // huge but entirely legitimate distance delta.
    it('accepts a long jump after hours offline', () => {
      const result = filterPosition(
        { ...DAKHLA, recordedAt: at(20 * 60) },
        ctx({ anchor: ref(RABAT, 0), now: at(20 * 60) }),
      );
      expect(result.accepted).toBe(true);
      expect(result.impliedSpeedKmh).toBeLessThan(DEFAULT_POSITION_FILTER_CONFIG.maxSpeedKmh);
    });

    it('floors the elapsed time so a near-zero gap yields a finite speed', () => {
      const result = filterPosition(
        { ...offsetKm(RABAT, 5), recordedAt: at(1 / 60) },
        ctx({ anchor: ref(RABAT, 0) }),
      );
      expect(result.accepted).toBe(false);
      expect(Number.isFinite(result.impliedSpeedKmh)).toBe(true);
    });
  });

  describe('stage 4 — corroboration', () => {
    const near = (p: { lat: number; lng: number }, km: number) => offsetKm(p, km);

    it('accepts and un-rejects when a second reading corroborates the relocation', () => {
      const lastRejected = ref(MARRAKECH, 15);
      const result = filterPosition(
        { ...near(MARRAKECH, 2), recordedAt: at(30) },
        ctx({ anchor: ref(RABAT, 0), lastRejected, now: at(30) }),
      );
      expect(result.accepted).toBe(true);
      expect(result.unrejectPositionId).toBe(lastRejected.id);
    });

    it('leaves an isolated outlier rejected when the track returns to the anchor', () => {
      const result = filterPosition(
        { ...near(RABAT, 3), recordedAt: at(30) },
        ctx({ anchor: ref(RABAT, 0), lastRejected: ref(MARRAKECH, 15), now: at(30) }),
      );
      expect(result.accepted).toBe(true);
      expect(result.unrejectPositionId).toBeUndefined();
    });

    it('ignores a rejected point older than the current anchor', () => {
      const result = filterPosition(
        { ...near(MARRAKECH, 2), recordedAt: at(30) },
        ctx({ anchor: ref(RABAT, 20), lastRejected: ref(MARRAKECH, 5), now: at(30) }),
      );
      expect(result).toMatchObject({ accepted: false, reason: 'implied_speed' });
      expect(result.unrejectPositionId).toBeUndefined();
    });

    // Uses a deliberately tight window: at the default 6 h the guard is
    // unreachable, because a candidate that far from the rejected point is
    // further still from the older anchor, so stage 3 accepts it on elapsed
    // time alone and stage 4 never runs.
    it('ignores a corroborating reading beyond the confirmation window', () => {
      const result = filterPosition(
        { ...near(MARRAKECH, 2), recordedAt: at(20) },
        ctx({
          anchor: ref(RABAT, 0),
          lastRejected: ref(MARRAKECH, 5),
          now: at(20),
          config: { confirmMaxGapHours: 0.1 },
        }),
      );
      expect(result).toMatchObject({ accepted: false, reason: 'implied_speed' });
    });

    it('corroborates via plausible speed when outside the confirmation radius', () => {
      const lastRejected = ref(MARRAKECH, 15);
      const result = filterPosition(
        { ...offsetKm(MARRAKECH, 40), recordedAt: at(45) },
        ctx({ anchor: ref(RABAT, 0), lastRejected, now: at(45) }),
      );
      expect(result.accepted).toBe(true);
      expect(result.unrejectPositionId).toBe(lastRejected.id);
    });
  });

  describe('config overrides', () => {
    it('honours a tightened max speed', () => {
      const cfg: Partial<PositionFilterConfig> = { maxSpeedKmh: 50 };
      const result = filterPosition(
        { ...CASABLANCA, recordedAt: at(60) },
        ctx({ anchor: ref(RABAT, 0), now: at(60), config: cfg }),
      );
      expect(result).toMatchObject({ accepted: false, reason: 'implied_speed' });
    });
  });
});
