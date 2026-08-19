/**
 * An internal reference link (supplier listing, sourcing page, factory
 * contact, etc.) attached to a product for the admin's own use. Never
 * exposed on the storefront or in any public API response — stripped
 * explicitly wherever a product is serialized for a public consumer (see
 * ProductService#findBySlug / #publicList).
 */
export interface ProductPrivateLink {
  id: string;
  label: string;
  url: string;
}
