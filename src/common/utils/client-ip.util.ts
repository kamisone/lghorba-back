import { Request } from 'express';

/**
 * Header the edge nginx stamps with the visitor's real address
 * (`proxy_set_header X-Original-Client-IP $remote_addr`, see
 * back/docker/nginx/default.conf).
 *
 * It exists because the k8s ingress rewrites the standard `X-Forwarded-*`
 * headers with its own peer unless `use-forwarded-headers` is enabled, which
 * destroys the visitor's address before it reaches any pod. Custom headers are
 * passed through untouched, so this survives the hop regardless of cluster
 * configuration.
 */
export const ORIGINAL_CLIENT_IP_HEADER = 'x-original-client-ip';

const PRIVATE_IP = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|169\.254\.)/i;

/** Strips the IPv4-mapped IPv6 prefix Express reports for IPv4 peers. */
function normalise(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, '');
}

function isUsable(ip: string | null | undefined): ip is string {
  return !!ip && !PRIVATE_IP.test(normalise(ip));
}

/**
 * The visitor's address, or null when only internal hops are visible.
 *
 * Order matters: the edge header is checked first because it is the one value
 * nothing between the edge and the pod can overwrite. `req.ip` is the fallback
 * and is correct on its own wherever `trust proxy` can see a real
 * `X-Forwarded-For` — a direct deployment, or a cluster with
 * `use-forwarded-headers` enabled.
 *
 * Private and loopback addresses are rejected rather than returned: they mean a
 * hop swallowed the real one, and geolocating them yields null anyway. Callers
 * get an explicit null instead of a misleading value.
 */
export function resolveClientIp(req: Request): string | null {
  const raw = req.headers[ORIGINAL_CLIENT_IP_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  // The edge sets a single address, but tolerate a list and take the first.
  const edge = header?.split(',')[0];
  if (isUsable(edge)) return normalise(edge);

  if (isUsable(req.ip)) return normalise(req.ip);

  return null;
}
