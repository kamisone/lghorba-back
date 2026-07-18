import { z } from 'zod';

const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} exceeds ${max} characters`);

// Category is a lowercase slug: letters/digits separated by single hyphens.
const categorySlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Category must be a lowercase slug (letters, digits, hyphens)')
  .max(64, 'Category exceeds 64 characters');

export const CreateQuickReplySchema = z.object({
  title:    text('Title', 2, 150),
  body:     text('Body', 2, 4000),
  category: categorySlug.optional().default('general'),
  isActive: z.boolean().optional().default(true),
  // Null/omitted = global reply; a car id restricts it to that car's Messages tab.
  carId:    z.string().uuid('carId must be a valid UUID').nullable().optional(),
});
export type CreateQuickReplyDto = z.infer<typeof CreateQuickReplySchema>;

export const UpdateQuickReplySchema = z.object({
  title:    text('Title', 2, 150).optional(),
  body:     text('Body', 2, 4000).optional(),
  category: categorySlug.optional(),
  isActive: z.boolean().optional(),
  carId:    z.string().uuid('carId must be a valid UUID').nullable().optional(),
});
export type UpdateQuickReplyDto = z.infer<typeof UpdateQuickReplySchema>;

export const RenameCategorySchema = z.object({
  category: categorySlug,
});
export type RenameCategoryDto = z.infer<typeof RenameCategorySchema>;
