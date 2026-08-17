import {
  computeDurationMs,
  containsLikelySensitiveData,
  extractIncrementalEventsJson,
  retentionCutoff,
  sanitizeMarkers,
  sanitizePageTitle,
  sanitizePageUrl,
  sanitizeViewport,
} from './replay.util';

describe('sanitizeMarkers', () => {
  it('keeps well-formed markers and normalizes timestampMs to an integer', () => {
    const out = sanitizeMarkers([
      { type: 'click', timestampMs: 1234.6, label: 'Add to cart', meta: { x: 10, y: 20 } },
    ]);
    expect(out).toEqual([
      { type: 'click', timestampMs: 1235, label: 'Add to cart', meta: { x: 10, y: 20 } },
    ]);
  });

  it('drops entries with an unknown event type', () => {
    expect(sanitizeMarkers([{ type: 'keypress', timestampMs: 1 }])).toEqual([]);
  });

  it('drops entries with a missing/negative/non-finite timestampMs', () => {
    expect(sanitizeMarkers([{ type: 'click' }])).toEqual([]);
    expect(sanitizeMarkers([{ type: 'click', timestampMs: -1 }])).toEqual([]);
    expect(sanitizeMarkers([{ type: 'click', timestampMs: Infinity }])).toEqual([]);
  });

  it('never throws on garbage input from an untrusted public endpoint', () => {
    expect(sanitizeMarkers(null)).toEqual([]);
    expect(sanitizeMarkers('not an array')).toEqual([]);
    expect(sanitizeMarkers([null, 42, 'x', { type: 'click', timestampMs: 5 }])).toEqual([
      { type: 'click', timestampMs: 5, label: null, meta: null },
    ]);
  });

  it('truncates an overlong label and drops a non-object meta', () => {
    const out = sanitizeMarkers([
      { type: 'navigation', timestampMs: 0, label: 'x'.repeat(300), meta: 'nope' },
    ]);
    expect(out[0].label).toHaveLength(255);
    expect(out[0].meta).toBeNull();
  });
});

describe('sanitizePageUrl', () => {
  it('strips query string and hash', () => {
    expect(sanitizePageUrl('/en/shop/widget?utm_source=ig#reviews')).toBe('/en/shop/widget');
  });

  it('rejects non-relative (external) URLs', () => {
    expect(sanitizePageUrl('https://evil.example.com/phish')).toBeNull();
  });

  it('rejects non-strings and empty values', () => {
    expect(sanitizePageUrl(undefined)).toBeNull();
    expect(sanitizePageUrl('')).toBeNull();
  });
});

describe('sanitizePageTitle / sanitizeViewport', () => {
  it('caps an overlong title', () => {
    expect(sanitizePageTitle('x'.repeat(400))?.length).toBe(300);
  });

  it('accepts a plausible viewport dimension and rejects nonsense', () => {
    expect(sanitizeViewport(1440)).toBe(1440);
    expect(sanitizeViewport(0)).toBeNull();
    expect(sanitizeViewport(-10)).toBeNull();
    expect(sanitizeViewport(100000)).toBeNull();
    expect(sanitizeViewport('1440')).toBeNull();
  });
});

describe('computeDurationMs', () => {
  it('returns the millisecond span between start and end', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T00:00:05.500Z');
    expect(computeDurationMs(start, end)).toBe(5500);
  });

  it('clamps to zero rather than going negative on out-of-order timestamps', () => {
    const start = new Date('2026-01-01T00:00:05.000Z');
    const end = new Date('2026-01-01T00:00:00.000Z');
    expect(computeDurationMs(start, end)).toBe(0);
  });
});

describe('retentionCutoff', () => {
  it('subtracts N days from the reference time', () => {
    const now = new Date('2026-02-15T12:00:00.000Z');
    expect(retentionCutoff(30, now)).toEqual(new Date('2026-01-16T12:00:00.000Z'));
  });
});

describe('extractIncrementalEventsJson', () => {
  it('keeps only IncrementalSnapshot (type 3) events', () => {
    const events = [
      { type: 4, data: { href: 'https://vitecamion.com' } }, // Meta
      { type: 2, data: { node: { id: 1 } } }, // FullSnapshot
      { type: 3, data: { source: 5, text: 'hello' } }, // IncrementalSnapshot
    ];
    const out = JSON.parse(extractIncrementalEventsJson(events));
    expect(out).toEqual([{ type: 3, data: { source: 5, text: 'hello' } }]);
  });

  it('never throws on a non-array/garbage list', () => {
    expect(extractIncrementalEventsJson([null, 'x', 42])).toBe('[]');
  });

  // Pins the actual production bug: the storefront footer's own contact
  // email (info@vitecamion.com) appears in every page's initial DOM, so it
  // shows up in every session's FullSnapshot — scanning the *whole* batch
  // rejected the FullSnapshot on every session, leaving click/scroll
  // markers recorded (a separate code path) but the replay video always
  // empty. This must never regress.
  it('excludes an email that only appears in the FullSnapshot', () => {
    const events = [
      { type: 2, data: { text: 'contact us at info@vitecamion.com' } },
    ];
    const json = extractIncrementalEventsJson(events);
    expect(containsLikelySensitiveData(json)).toBe(false);
  });
});

describe('containsLikelySensitiveData', () => {
  it('flags an email address anywhere in the payload', () => {
    expect(containsLikelySensitiveData('{"text":"contact us at jane.doe@example.com"}')).toBe(true);
  });

  it('flags a grouped/separated card-number-shaped run', () => {
    expect(containsLikelySensitiveData('{"text":"4111 1111 1111 1111"}')).toBe(true);
    expect(containsLikelySensitiveData('{"text":"4111-1111-1111-1111"}')).toBe(true);
  });

  it('does NOT flag a bare rrweb epoch timestamp or DOM node id', () => {
    // This is the regression this test exists to pin: rrweb events always
    // carry 13-digit millisecond timestamps and sequential integer node ids,
    // and an over-eager digit-run pattern would reject every real batch.
    expect(containsLikelySensitiveData('{"timestamp":1755400000000,"id":48291}')).toBe(false);
  });

  it('does not flag ordinary event JSON with no sensitive-looking values', () => {
    expect(containsLikelySensitiveData('{"type":2,"data":{"source":0,"x":10,"y":20}}')).toBe(false);
  });
});
