/** Where a Story Gallery image is displayed on the PDP. */
export type StoryGalleryLocation = 'side' | 'narrative';

/**
 * Aspect ratio the storefront renders a narrative-gallery image at
 * (`.narrativeMedia`'s CSS `aspect-ratio`, e.g. '16:9' -> '16/9'). Chosen by
 * the admin per image, since a single fixed ratio doesn't suit every photo a
 * narrative block might use. Not applicable to `side` items.
 */
export type StoryImageAspectRatio = '1:1' | '16:9' | '9:16';

/**
 * A Story Gallery image attached to a product. Order = display order within
 * its location.
 *
 * - `side` (Location 1): creative composition rendered next to the FAQ
 *   section — image only, no copy.
 * - `narrative` (Location 2): premium storytelling section rendered after all
 *   product sections — each image is paired with a title and description.
 *
 * `title`/`description` hold the default-language (FR) text; FR/EN
 * translations are stored in the `translations` table under entityType
 * `shop_product`, entityId = the product's id, fields
 * `storyItem:{id}:title` and `storyItem:{id}:description`.
 */
export interface ProductStoryItem {
  /** Stable id — used as the translation field key, generated on first save. */
  id: string;
  /** GCS storage key of the image */
  key: string;
  location: StoryGalleryLocation;
  altText?: string | null;
  /** Narrative items only — meaningless for side items. */
  aspectRatio: StoryImageAspectRatio;
  /** Narrative items only — empty string for side items. */
  title: string;
  /** Narrative items only — empty string for side items. */
  description: string;
  sortOrder: number;
  isActive: boolean;
}

/** ProductStoryItem with resolved image URL, returned by the API */
export interface ResolvedProductStoryItem extends ProductStoryItem {
  url: string;
}
