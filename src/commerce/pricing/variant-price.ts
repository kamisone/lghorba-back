/**
 * Three-tier variant pricing model.
 *
 * Tier 1 — Variant override:      variant.priceCents (explicit, wins everything)
 * Tier 2 — Computed price:        product.basePriceCents + sum(option adjustments)
 *
 * Usage:
 *   const price = resolveVariantPrice({
 *     variantPriceCents:     variant.priceCents,
 *     basePriceCents:        product.basePriceCents,
 *     optionAdjustmentCents: sumOptionAdjustments(variant.options),
 *   });
 */

export interface VariantPriceComponents {
  /** Per-variant explicit price. When non-null, wins over everything else. */
  variantPriceCents: number | null;
  /** Product-level base price from which option adjustments are computed. */
  basePriceCents: number | null;
  /** Pre-summed adjustments from all selected VariationOptionValues. */
  optionAdjustmentCents: number;
}

export function resolveVariantPrice(c: VariantPriceComponents): number {
  if (c.variantPriceCents !== null) return c.variantPriceCents;
  const computed = (c.basePriceCents ?? 0) + c.optionAdjustmentCents;
  if (computed < 0) {
    throw new Error(
      `Resolved variant price is negative (${computed}): basePriceCents=${c.basePriceCents}, optionAdjustmentCents=${c.optionAdjustmentCents}`,
    );
  }
  return computed;
}

/**
 * Sums the priceAdjustmentCents from an array of VariantOption-like objects.
 * Null or missing adjustments contribute 0.
 */
export function sumOptionAdjustments(
  options: Array<{ optionValue?: { priceAdjustmentCents?: number | null } | null }>,
): number {
  return (options ?? []).reduce(
    (sum, o) => sum + (o.optionValue?.priceAdjustmentCents ?? 0),
    0,
  );
}
