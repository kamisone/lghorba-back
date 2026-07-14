/** A single media attachment on a review (image or video). Order = upload order. */
export interface ReviewMediaItem {
  /** GCS storage key */
  key: string;
  type: 'image' | 'video';
  altText?: string | null;
}

/** ReviewMediaItem with a resolved URL, returned by the API */
export interface ResolvedReviewMediaItem extends ReviewMediaItem {
  url: string;
}
