/**
 * A "what's in the box" image attached to a product — shown as a small
 * thumbnail grid in a collapsible section on the PDP, right after Delivery
 * details. Admin-managed via the product edit page; each item is one
 * included item photo with an optional short caption (e.g. "USB-C cable ×1").
 */
export interface ProductPackageContentItem {
  /** Stable id — generated on first save. */
  id: string;
  /** GCS storage key of the image */
  key: string;
  label?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** ProductPackageContentItem with resolved image URL, returned by the API */
export interface ResolvedProductPackageContentItem extends ProductPackageContentItem {
  url: string;
}
