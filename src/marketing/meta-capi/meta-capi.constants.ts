export const META_CAPI_QUEUE = 'meta-capi-events';

export interface MetaCapiPurchaseJobData {
  orderId: string;
  eventId: string;
  eventTime: number;
  valueEur: number;
  contentIds: string[];
  contents: { id: string; quantity: number; item_price: number }[];
  /** SHA-256 hex digest of the lowercased, trimmed customer email — never the raw email. */
  customerEmailHash: string;
  eventSourceUrl: string;
  /** Sent as-is, never hashed — Meta's spec requires these unhashed. */
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  /** _fbc / _fbp cookies, read client-side at checkout — sent as-is, never hashed. */
  fbc: string | null;
  fbp: string | null;
}
