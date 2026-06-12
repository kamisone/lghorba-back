/**
 * A product-specific FAQ entry shown near the bottom of the PDP and used to
 * generate Schema.org FAQPage structured data. Order = display order.
 * `question`/`answer` hold the default-language (FR) text; FR/EN translations
 * are stored in the `translations` table under entityType `shop_product`,
 * entityId = the product's id, fields `faq:{id}:question` and `faq:{id}:answer`.
 *
 * Inactive FAQs are kept (e.g. seasonal) but excluded from the public PDP and
 * the FAQPage JSON-LD.
 */
export interface ProductFaq {
  /** Stable id — used as the translation field key, generated on first save. */
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}
