import {
  DEFAULT_POSITION_FILTER_CONFIG,
  FilterContext,
  FilterReference,
  FilterResult,
  filterPosition,
  GeoBounds,
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
    // Disabled by default (no fixed country fence); a caller can still opt in
    // via config, which this block exercises explicitly.
    const MOROCCO: GeoBounds = { latMin: 20.5, latMax: 36.2, lngMin: -17.3, lngMax: -0.8 };

    it('is disabled by default, accepting anywhere', () => {
      expect(DEFAULT_POSITION_FILTER_CONFIG.geoBounds).toBeNull();
      expect(filterPosition({ ...PARIS, recordedAt: at(0) }, ctx()).accepted).toBe(true);
    });

    it('rejects a point outside explicitly configured bounds', () => {
      expect(
        filterPosition({ ...PARIS, recordedAt: at(0) }, ctx({ config: { geoBounds: MOROCCO } })),
      ).toMatchObject({ reason: 'outside_geo_bounds' });
    });

    it('accepts points just inside each edge of configured bounds', () => {
      const corners = [
        { lat: MOROCCO.latMin + 0.01, lng: MOROCCO.lngMin + 0.01 },
        { lat: MOROCCO.latMax - 0.01, lng: MOROCCO.lngMax - 0.01 },
      ];
      for (const c of corners) {
        expect(
          filterPosition({ ...c, recordedAt: at(0) }, ctx({ config: { geoBounds: MOROCCO } }))
            .accepted,
        ).toBe(true);
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

    it('judges a same-instant reading by speed instead of rejecting it outright', () => {
      // A burst can persist two positions with an identical receipt time;
      // without a floor this would always be non_monotonic regardless of
      // plausibility. A nearby point should still pass, an implausible one
      // should still fail — just via the speed stage, not blanket rejection.
      const anchor = ref(RABAT, 0);
      const jitter = offsetKm(RABAT, 0.15);
      expect(
        filterPosition({ ...jitter, recordedAt: at(0) }, ctx({ anchor })).accepted,
      ).toBe(true);
      expect(
        filterPosition({ ...CASABLANCA, recordedAt: at(0) }, ctx({ anchor })),
      ).toMatchObject({ accepted: false, reason: 'implied_speed' });
    });

    it('tolerates a small out-of-order arrival within the burst window', () => {
      // Concurrent POSTs from one burst can be persisted out of stamped
      // order; a few minutes of reorder must not sink an otherwise-plausible
      // reading.
      const anchor = ref(RABAT, 10);
      const jitter = offsetKm(RABAT, 0.15);
      expect(
        filterPosition({ ...jitter, recordedAt: at(8) }, ctx({ anchor })).accepted,
      ).toBe(true);
    });

    it('rejects an out-of-order delivery beyond the tolerance window', () => {
      expect(
        filterPosition({ ...CASABLANCA, recordedAt: at(-1) }, ctx({ anchor: ref(RABAT, 10) })),
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
      // Displacement must exceed maxSpeedKmh * minDtHours (200 * 0.25 = 50 km)
      // to still be implausible once the floor applies.
      const result = filterPosition(
        { ...offsetKm(RABAT, 60), recordedAt: at(1 / 60) },
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

  // Regression guard for the bug that motivated this filter's tuning:
  // `minDtHours` drifting below the tracking cadence, or `non_monotonic`
  // having no tolerance, silently rejects every fix in a real drive as soon
  // as delivery timing isn't perfectly even. Single-step tests against a
  // hand-placed anchor are structurally blind to this — the anchor only
  // advances on acceptance, so one wrong rejection stalls the whole replay.
  // If this block ever fails, look at `minDtHours` and `outOfOrderToleranceMs`
  // before touching speed thresholds.
  describe('regression — whole-session ingestion', () => {
    // Five legs of a genuine ~87 km Rabat→Casablanca drive at ~70 km/h,
    // interpolated at even fractions so each leg is itself plausible.
    const FRACTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const TOTAL_MINUTES = 75; // ~87 km at ~70 km/h

    function waypoint(t: number) {
      return {
        lat: RABAT.lat + (CASABLANCA.lat - RABAT.lat) * t,
        lng: RABAT.lng + (CASABLANCA.lng - RABAT.lng) * t,
      };
    }

    /** Replays the drive with the given per-fix receipt times, as ingestion would. */
    function replay(deliveryMinutes: number[]): FilterResult[] {
      let anchor: FilterReference | null = null;
      let lastRejected: FilterReference | null = null;
      return FRACTIONS.map((f, i) => {
        const candidate = { ...waypoint(f), recordedAt: at(deliveryMinutes[i]) };
        const result = filterPosition(candidate, {
          anchor,
          lastRejected,
          now: at(deliveryMinutes[i]),
        });
        const stored: FilterReference = { id: `p${i}`, ...candidate };
        if (result.accepted) {
          anchor = stored;
        } else {
          lastRejected = stored;
        }
        return result;
      });
    }

    it('accepts every fix delivered exactly on the polling cadence', () => {
      const onTime = FRACTIONS.map((f) => f * TOTAL_MINUTES);
      expect(replay(onTime).every((r) => r.accepted)).toBe(true);
    });

    it('accepts every fix under 2-4 minute delivery jitter', () => {
      const jitterOffsets = [0, 3, -2, 4, -3, 2];
      const jittered = FRACTIONS.map((f, i) => f * TOTAL_MINUTES + jitterOffsets[i]);
      expect(replay(jittered).every((r) => r.accepted)).toBe(true);
    });

    it('accepts every fix delivered in a single burst after being offline', () => {
      const burst = FRACTIONS.map((_, i) => (i === 0 ? 0 : TOTAL_MINUTES + i / 60));
      expect(replay(burst).every((r) => r.accepted)).toBe(true);
    });
  });
});
