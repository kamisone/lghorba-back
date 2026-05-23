import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 — Schema alignment with domain spec.
 *
 * Entity changes:
 *   shop_orders           → paymentMethodId (FK to shop_user_payment_methods)
 *   shop_product_reviews  → orderItemId (FK to shop_order_items)
 *   shop_addresses        → unitNumber, streetNumber columns
 *
 * New tables:
 *   shop_promotion_category_rules  — junction: promotion ↔ product category
 *   shop_order_status_refs         — reference table for order status codes
 */
export class Phase6SchemaAlignment1778600000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {

    // ── shop_orders: add paymentMethodId ─────────────────────────────────────
    await qr.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS "paymentMethodId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_orders_paymentMethod'
        ) THEN
          ALTER TABLE shop_orders
            ADD CONSTRAINT "FK_shop_orders_paymentMethod"
            FOREIGN KEY ("paymentMethodId") REFERENCES shop_user_payment_methods(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_orders_paymentMethodId" ON shop_orders ("paymentMethodId")`);

    // ── shop_product_reviews: add orderItemId ─────────────────────────────────
    await qr.query(`ALTER TABLE shop_product_reviews ADD COLUMN IF NOT EXISTS "orderItemId" UUID`);
    await qr.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_shop_reviews_orderItem'
        ) THEN
          ALTER TABLE shop_product_reviews
            ADD CONSTRAINT "FK_shop_reviews_orderItem"
            FOREIGN KEY ("orderItemId") REFERENCES shop_order_items(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_reviews_orderItemId" ON shop_product_reviews ("orderItemId")`);

    // ── shop_addresses: add unitNumber, streetNumber ──────────────────────────
    await qr.query(`ALTER TABLE shop_addresses ADD COLUMN IF NOT EXISTS "unitNumber"   VARCHAR(50)`);
    await qr.query(`ALTER TABLE shop_addresses ADD COLUMN IF NOT EXISTS "streetNumber" VARCHAR(50)`);

    // ── shop_promotion_category_rules ─────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_promotion_category_rules (
        id             UUID  NOT NULL DEFAULT gen_random_uuid(),
        "promotionId"  UUID  NOT NULL,
        "categoryId"   UUID  NOT NULL,
        CONSTRAINT "PK_shop_promotion_category_rules" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_pcr_promotion_category" UNIQUE ("promotionId", "categoryId"),
        CONSTRAINT "FK_shop_pcr_promotion"
          FOREIGN KEY ("promotionId") REFERENCES shop_promotions(id) ON DELETE CASCADE,
        CONSTRAINT "FK_shop_pcr_category"
          FOREIGN KEY ("categoryId") REFERENCES shop_product_categories(id) ON DELETE CASCADE
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_pcr_promotionId" ON shop_promotion_category_rules ("promotionId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_pcr_categoryId"  ON shop_promotion_category_rules ("categoryId")`);

    // ── shop_order_status_refs ────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_order_status_refs (
        id           UUID          NOT NULL DEFAULT gen_random_uuid(),
        code         VARCHAR(50)   NOT NULL,
        label        VARCHAR(200)  NOT NULL,
        description  TEXT,
        color        VARCHAR(50),
        "sortOrder"  INTEGER       NOT NULL DEFAULT 0,
        "isActive"   BOOLEAN       NOT NULL DEFAULT true,
        CONSTRAINT "PK_shop_order_status_refs" PRIMARY KEY (id),
        CONSTRAINT "UQ_shop_order_status_refs_code" UNIQUE (code)
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_shop_order_status_refs_code" ON shop_order_status_refs (code)`);

    // Seed the standard order status codes
    await qr.query(`
      INSERT INTO shop_order_status_refs (code, label, color, "sortOrder") VALUES
        ('draft',           'Draft',            '#94a3b8', 0),
        ('pending',         'Pending',          '#f59e0b', 1),
        ('awaiting_payment','Awaiting Payment',  '#f97316', 2),
        ('paid',            'Paid',             '#22c55e', 3),
        ('processing',      'Processing',       '#3b82f6', 4),
        ('shipped',         'Shipped',          '#8b5cf6', 5),
        ('delivered',       'Delivered',        '#10b981', 6),
        ('cancelled',       'Cancelled',        '#ef4444', 7),
        ('refunded',        'Refunded',         '#ec4899', 8)
      ON CONFLICT (code) DO NOTHING
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS shop_order_status_refs`);
    await qr.query(`DROP TABLE IF EXISTS shop_promotion_category_rules`);

    await qr.query(`ALTER TABLE shop_addresses        DROP COLUMN IF EXISTS "streetNumber"`);
    await qr.query(`ALTER TABLE shop_addresses        DROP COLUMN IF EXISTS "unitNumber"`);
    await qr.query(`ALTER TABLE shop_product_reviews  DROP COLUMN IF EXISTS "orderItemId"`);
    await qr.query(`ALTER TABLE shop_orders           DROP COLUMN IF EXISTS "paymentMethodId"`);
  }
}
