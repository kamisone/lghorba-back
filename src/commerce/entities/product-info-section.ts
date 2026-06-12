/**
 * A structured, translatable text block shown on the product page
 * (e.g. Composition, Lavage, Sexe, Dimensions...). Order = display order.
 * `label`/`value` hold the default-language (FR) text; FR/EN translations
 * are stored in the `translations` table under entityType `shop_product`,
 * entityId = the product's id, field = `infoSection:{id}:label|value`.
 */
export interface ProductInfoSection {
  /** Stable id — used as the translation field key, generated on first save. */
  id: string;
  /** Optional canonical key for preset sections (e.g. 'composition', 'care'). 'custom' for free-form labels. */
  key: string;
  label: string;
  value: string;
  sortOrder: number;
}
