import { ValueTransformer } from 'typeorm';

/**
 * Postgres returns DECIMAL/NUMERIC as a string to preserve precision, which
 * silently breaks any arithmetic done on the column. Coerce back to number on
 * read so entities expose real numbers (and serialize as JSON numbers).
 *
 * Note: transformers do not apply to `getRawMany()` results.
 */
export const NumericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? value : parseFloat(value),
};
