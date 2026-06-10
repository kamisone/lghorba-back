/** A single media asset attached to a product (image or video). Order = gallery order. */
export interface ProductMediaItem {
  /** GCS storage key (image or video) */
  key:         string;
  type:        'image' | 'video';
  /** Optional poster/thumbnail image key — videos only */
  posterKey?:  string | null;
  altText?:    string | null;
  /** At most one item across the array should be true */
  isFeatured?: boolean;
}

/** ProductMediaItem with resolved URLs + asset metadata, returned by the API */
export interface ResolvedProductMediaItem extends ProductMediaItem {
  url:             string;
  posterUrl:       string | null;
  durationSeconds?: number | null;
  mimeType?:       string | null;
}
