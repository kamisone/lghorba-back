import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Encrypted-at-rest storage for third-party API credentials (currently just
 * the Groq API key used by the product-import feature). Deliberately
 * separate from platform_settings, which is served in full by a @Public()
 * endpoint and cached in-memory — neither is safe for a secret.
 */
export class CreateIntegrationCredentials1786472400000
  implements MigrationInterface
{
  name = 'CreateIntegrationCredentials1786472400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "integration_credentials" (
        "provider"   varchar(50) NOT NULL,
        "iv"         varchar(24) NOT NULL,
        "authTag"    varchar(32) NOT NULL,
        "ciphertext" text NOT NULL,
        "keyVersion" integer NOT NULL DEFAULT 1,
        "updatedBy"  varchar(200),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_integration_credentials" PRIMARY KEY ("provider")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "integration_credentials"`);
  }
}
