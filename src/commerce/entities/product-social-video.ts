/**
 * A social/reels-style video attached to a product, shown in a vertical
 * (9:16) carousel on the PDP above the FAQ section. Order = display order.
 * The video is a media-library asset; its HLS/poster renditions come from
 * the transcode pipeline on `media_assets`.
 */
export interface ProductSocialVideo {
  /** Stable id, generated on first save. */
  id: string;
  /** GCS storage key of the source video (media library asset). */
  key: string;
  /** Optional short caption shown in the fullscreen viewer. */
  title?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** ProductSocialVideo with resolved playback URLs, returned by the API */
export interface ResolvedProductSocialVideo extends ProductSocialVideo {
  /** Progressive mp4 URL (optimized rendition when transcoded, else the original). */
  url: string;
  /** HLS master playlist URL — null until the asset's transcode is ready. */
  hlsUrl: string | null;
  /** Poster frame URL — the transcode's auto-poster when available. */
  posterUrl: string | null;
  durationSeconds?: number | null;
}
