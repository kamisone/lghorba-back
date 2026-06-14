/**
 * A small icon + title/subtitle "trust signal" shown in the PDP trust row
 * (e.g. "Secure checkout", "Free shipping"). Order = display order.
 * `title`/`subtitle` hold the default-language (FR) text; FR/EN translations
 * are stored in the `translations` table under entityType `shop_product`,
 * entityId = the product's id, fields `trustBadge:{id}:title` and
 * `trustBadge:{id}:subtitle`.
 *
 * `icon` must be one of the curated lucide-react icon names — keep this
 * list in sync with TRUST_BADGE_ICON_NAMES in
 * front/src/lib/shop/trustBadgeIcons.tsx.
 */
export const TRUST_BADGE_ICON_NAMES = [
  'Lock', 'ShieldCheck', 'Truck', 'PackageCheck', 'RotateCcw', 'CreditCard',
  'BadgeCheck', 'Award', 'Clock', 'Headset', 'Gift', 'Leaf', 'Recycle', 'Globe',
] as const;

export type TrustBadgeIconName = typeof TRUST_BADGE_ICON_NAMES[number];

export interface ProductTrustBadge {
  /** Stable id — used as the translation field key, generated on first save. */
  id: string;
  icon: TrustBadgeIconName;
  title: string;
  /** Optional secondary line shown under the title. */
  subtitle?: string;
  /** Optional URL — when set, the badge is rendered as a link. */
  link?: string;
  sortOrder: number;
}
