import {
  boolParam,
  intParam,
  resolveWindow,
  testProductSort,
} from './analytics-filters';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('resolveWindow', () => {
  it('defaults to the last 30 days when nothing is provided', () => {
    const { since, until, days } = resolveWindow({});
    expect(days).toBe(30);
    expect(until.getTime() - since.getTime()).toBeCloseTo(30 * DAY_MS, -4);
  });

  it('honours a rolling days window', () => {
    const { since, until, days } = resolveWindow({ days: '7' });
    expect(days).toBe(7);
    expect(until.getTime() - since.getTime()).toBeCloseTo(7 * DAY_MS, -4);
  });

  it('falls back to 30 for a non-numeric days value', () => {
    expect(resolveWindow({ days: 'abc' }).days).toBe(30);
  });

  it('uses an explicit start/end range with an inclusive end date', () => {
    const { since, until, days } = resolveWindow({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(since.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // end is inclusive → exclusive upper bound is the next midnight
    expect(until.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(days).toBe(31);
  });

  it('treats a lone startDate as running up to now', () => {
    const { since, until } = resolveWindow({ startDate: '2026-01-01' });
    expect(since.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(until.getTime()).toBeGreaterThan(since.getTime());
  });

  it('ignores an invalid startDate and falls back to the rolling window', () => {
    const { days } = resolveWindow({ startDate: 'not-a-date', days: '14' });
    expect(days).toBe(14);
  });
});

describe('param helpers', () => {
  it('intParam parses ints and rejects junk', () => {
    expect(intParam('20')).toBe(20);
    expect(intParam('')).toBeUndefined();
    expect(intParam(undefined)).toBeUndefined();
    expect(intParam('abc')).toBeUndefined();
  });

  it('boolParam recognises true/1 only', () => {
    expect(boolParam('true')).toBe(true);
    expect(boolParam('1')).toBe(true);
    expect(boolParam('false')).toBe(false);
    expect(boolParam(undefined)).toBe(false);
  });

  it('testProductSort validates the allowed keys', () => {
    expect(testProductSort('views')).toBe('views');
    expect(testProductSort('reachedCheckout')).toBe('reachedCheckout');
    expect(testProductSort('bogus')).toBeUndefined();
    expect(testProductSort(undefined)).toBeUndefined();
  });
});
