import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds checkoutProducts to support_conversations: the cart's product
 * titles+URLs at the moment a support chat is opened from the checkout page.
 * pageUrl alone is just "/shop/checkout" there, which doesn't tell an admin
 * what the customer is actually trying to buy.
 *
 * Nullable, no default: only conversations opened from checkout (after this
 * ships) ever populate it.
 */
export class AddSupportConversationCheckoutProducts1786950000000 implements MigrationInterface {
  name = 'AddSupportConversationCheckoutProducts1786950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_conversations"
        ADD COLUMN IF NOT EXISTS "checkoutProducts" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_conversations" DROP COLUMN IF EXISTS "checkoutProducts"
    `);
  }
}
