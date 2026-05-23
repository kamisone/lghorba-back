import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 — Commerce architecture evolution.
 *
 * New tables:
 *   shop_countries, shop_addresses, shop_payment_types,
 *   shop_user_payment_methods, shop_promotion_categories,
 *   shop_variation_option_values
 *
 * Updated existing tables:
 *   shop_variant_attributes   → displayType, sortOrder, isActive
 *   shop_variant_options      → optionValueId (nullable FK)
 *   shop_promotions           → promotionCategoryId (nullable FK)
 *   shop_customer_addresses   → addressId (nullable FK)
 */
export class Phase5ArchitectureEvolution1778500000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {

    // ── shop_countries ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_countries (
        "isoCode"          CHAR(2)       NOT NULL,
        name               VARCHAR(200)  NOT NULL,
        "nativeName"       VARCHAR(200),
        "phonePrefix"      VARCHAR(10),
        "currencyCode"     CHAR(3),
        "isoCode3"         CHAR(3),
        "continentCode"    VARCHAR(2),
        "isActive"         BOOLEAN       NOT NULL DEFAULT true,
        "isShippingEnabled" BOOLEAN      NOT NULL DEFAULT false,
        "isEuVat"          BOOLEAN       NOT NULL DEFAULT false,
        CONSTRAINT "PK_shop_countries" PRIMARY KEY ("isoCode")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_countries_isActive" ON shop_countries ("isActive")`);

    // ── shop_addresses ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_addresses (
        id               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "fullName"       VARCHAR(300)  NOT NULL,
        company          VARCHAR(300),
        line1            VARCHAR(500)  NOT NULL,
        line2            VARCHAR(500),
        city             VARCHAR(200)  NOT NULL,
        state            VARCHAR(200),
        "postalCode"     VARCHAR(20)   NOT NULL,
        "countryCode"    VARCHAR(10)   NOT NULL,
        phone            VARCHAR(50),
        "isLocked"       BOOLEAN       NOT NULL DEFAULT false,
        "createdAt"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_addresses" PRIMARY KEY (id)
      )
    `);

    // ── shop_payment_types ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_payment_types (
        id           UUID          NOT NULL DEFAULT gen_random_uuid(),
        code         VARCHAR(50)   NOT NULL,
        name         VARCHAR(200)  NOT NULL,
        "iconKey"    VARCHAR(500),
        "isActive"   BOOLEAN       NOT NULL DEFAULT true,
        "sortOrder"  INTEGER       NOT NULL DEFAULT 0,
        CONSTRAINT "PK_shop_payment_types" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_payment_types_code" UNIQUE (code)
      )
    `);

    // ── shop_user_payment_methods ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_user_payment_methods (
        id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "customerId"        UUID          NOT NULL,
        "paymentTypeId"     UUID,
        "providerMethodId"  VARCHAR(300)  NOT NULL,
        provider            VARCHAR(50)   NOT NULL DEFAULT 'stripe',
        "cardBrand"         VARCHAR(30),
        "cardLast4"         CHAR(4),
        "cardExpMonth"      SMALLINT,
        "cardExpYear"       SMALLINT,
        "billingAddressId"  UUID,
        "isDefault"         BOOLEAN       NOT NULL DEFAULT false,
        status              VARCHAR(20)   NOT NULL DEFAULT 'active',
        "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_user_payment_methods" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_user_payment_methods_providerMethodId" UNIQUE ("providerMethodId"),
        CONSTRAINT "FK_shop_upm_customer"
          FOREIGN KEY ("customerId") REFERENCES shop_customers(id) ON DELETE CASCADE,
        CONSTRAINT "FK_shop_upm_payment_type"
          FOREIGN KEY ("paymentTypeId") REFERENCES shop_payment_types(id) ON DELETE SET NULL,
        CONSTRAINT "FK_shop_upm_billing_address"
          FOREIGN KEY ("billingAddressId") REFERENCES shop_addresses(id) ON DELETE SET NULL
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_upm_customerId"  ON shop_user_payment_methods ("customerId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_upm_status"      ON shop_user_payment_methods (status)`);

    // ── shop_promotion_categories ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_promotion_categories (
        id           UUID          NOT NULL DEFAULT gen_random_uuid(),
        name         VARCHAR(200)  NOT NULL,
        slug         VARCHAR(200)  NOT NULL,
        description  TEXT,
        color        VARCHAR(7),
        "isActive"   BOOLEAN       NOT NULL DEFAULT true,
        "sortOrder"  INTEGER       NOT NULL DEFAULT 0,
        "createdAt"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_promotion_categories" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_promotion_categories_slug" UNIQUE (slug)
      )
    `);

    // ── shop_variation_option_values ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_variation_option_values (
        id             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "attributeId"  UUID          NOT NULL,
        value          VARCHAR(200)  NOT NULL,
        "displayValue" VARCHAR(200),
        "swatchValue"  VARCHAR(500),
        "swatchType"   VARCHAR(10),
        "sortOrder"    INTEGER       NOT NULL DEFAULT 0,
        "isActive"     BOOLEAN       NOT NULL DEFAULT true,
        CONSTRAINT "PK_shop_variation_option_values" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_vov_attribute_value" UNIQUE ("attributeId", value),
        CONSTRAINT "FK_shop_vov_attribute"
          FOREIGN KEY ("attributeId") REFERENCES shop_variant_attributes(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_vov_attributeId" ON shop_variation_option_values ("attributeId")`);

    // ── Alter shop_variant_attributes ─────────────────────────────────────────
    await qr.query(`ALTER TABLE shop_variant_attributes ADD COLUMN IF NOT EXISTS "displayType" VARCHAR(20) NOT NULL DEFAULT 'button'`);
    await qr.query(`ALTER TABLE shop_variant_attributes ADD COLUMN IF NOT EXISTS "sortOrder"   INTEGER     NOT NULL DEFAULT 0`);
    await qr.query(`ALTER TABLE shop_variant_attributes ADD COLUMN IF NOT EXISTS "isActive"    BOOLEAN     NOT NULL DEFAULT true`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_va_displayType" ON shop_variant_attributes ("displayType")`);

    // ── Alter shop_variant_options ────────────────────────────────────────────
    await qr.query(`ALTER TABLE shop_variant_options ADD COLUMN IF NOT EXISTS "optionValueId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_vo_optionValue'
        ) THEN
          ALTER TABLE shop_variant_options
            ADD CONSTRAINT "FK_shop_vo_optionValue"
            FOREIGN KEY ("optionValueId") REFERENCES shop_variation_option_values(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_vo_optionValueId" ON shop_variant_options ("optionValueId")`);

    // ── Alter shop_promotions ─────────────────────────────────────────────────
    await qr.query(`ALTER TABLE shop_promotions ADD COLUMN IF NOT EXISTS "promotionCategoryId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_promotions_category'
        ) THEN
          ALTER TABLE shop_promotions
            ADD CONSTRAINT "FK_shop_promotions_category"
            FOREIGN KEY ("promotionCategoryId") REFERENCES shop_promotion_categories(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_promotions_categoryId" ON shop_promotions ("promotionCategoryId")`);

    // ── Alter shop_customer_addresses ─────────────────────────────────────────
    await qr.query(`ALTER TABLE shop_customer_addresses ADD COLUMN IF NOT EXISTS "addressId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_ca_address'
        ) THEN
          ALTER TABLE shop_customer_addresses
            ADD CONSTRAINT "FK_shop_ca_address"
            FOREIGN KEY ("addressId") REFERENCES shop_addresses(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    // Remove FKs and columns from existing tables
    await qr.query(`ALTER TABLE shop_customer_addresses DROP COLUMN IF EXISTS "addressId"`);
    await qr.query(`ALTER TABLE shop_promotions          DROP COLUMN IF EXISTS "promotionCategoryId"`);
    await qr.query(`ALTER TABLE shop_variant_options     DROP COLUMN IF EXISTS "optionValueId"`);
    await qr.query(`ALTER TABLE shop_variant_attributes  DROP COLUMN IF EXISTS "isActive"`);
    await qr.query(`ALTER TABLE shop_variant_attributes  DROP COLUMN IF EXISTS "sortOrder"`);
    await qr.query(`ALTER TABLE shop_variant_attributes  DROP COLUMN IF EXISTS "displayType"`);

    // Drop new tables (reverse dependency order)
    await qr.query(`DROP TABLE IF EXISTS shop_variation_option_values`);
    await qr.query(`DROP TABLE IF EXISTS shop_promotion_categories`);
    await qr.query(`DROP TABLE IF EXISTS shop_user_payment_methods`);
    await qr.query(`DROP TABLE IF EXISTS shop_payment_types`);
    await qr.query(`DROP TABLE IF EXISTS shop_addresses`);
    await qr.query(`DROP TABLE IF EXISTS shop_countries`);
  }
}
