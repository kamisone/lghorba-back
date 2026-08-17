/**
 * A "Zoomed Images" gallery image attached to a product — rendered in a
 * dedicated section between Specifications and FAQ on the PDP, each image
 * animating from a close zoom down to its normal `object-fit: cover` framing
 * as it scrolls into view. Order = display order. Image only — no copy.
 */
export interface ProductZoomedImage {
  /** Stable id — generated on first save. */
  id: string;
  /** GCS storage key of the image */
  key: string;
  altText?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** ProductZoomedImage with resolved image URL, returned by the API */
export interface ResolvedProductZoomedImage extends ProductZoomedImage {
  url: string;
}
