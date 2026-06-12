import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `faqs` jsonb column to shop_products — an ordered list of
 * product-specific FAQ entries shown near the bottom of the PDP and used to
 * generate Schema.org FAQPage structured data. Each item:
 * { id, question, answer, sortOrder, isActive }.
 * FR/EN translations are stored in `translations` under entityType
 * 'shop_product', fields `faq:{id}:question` and `faq:{id}:answer`.
 */
export class AddProductFaqs1780900200000 implements MigrationInterface {
  name = 'AddProductFaqs1780900200000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products"
        ADD COLUMN IF NOT EXISTS "faqs" JSONB NOT NULL DEFAULT '[]'
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "shop_products" DROP COLUMN IF EXISTS "faqs"
    `);
  }
}
