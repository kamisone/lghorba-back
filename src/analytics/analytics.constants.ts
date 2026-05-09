export const ANALYTICS_QUEUE = 'analytics' as const;

export const CACHE_TTL: Record<string, number> = {
  '7d':  5  * 60,  // 5 min — recent window changes with active sessions
  '30d': 10 * 60,  // 10 min
  '90d': 30 * 60,  // 30 min — historical data is stable
  telemetry: 3 * 60, // 3 min — includes active sessions
};

export function cacheKey(namespace: string, period: string): string {
  return `analytics:${namespace}:${period}`;
}
