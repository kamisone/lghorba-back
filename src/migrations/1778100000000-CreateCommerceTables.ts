import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommerceTables1778100000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── Categories (hierarchical) ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_categories (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        VARCHAR(200) NOT NULL UNIQUE,
        name        VARCHAR(500) NOT NULL,
        description TEXT,
        "imageKey"  VARCHAR(1000),
        "parentId"  UUID REFERENCES shop_product_categories(id) ON DELETE SET NULL,
        "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
        "sortOrder" INT NOT NULL DEFAULT 0,
        "seoTitle"  VARCHAR(500),
        "seoDescription" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spc_parent ON shop_product_categories("parentId");
    `);

    // ── Tags ─────────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_tags (
        id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL UNIQUE,
        slug VARCHAR(200) NOT NULL UNIQUE
      );
    `);

    // ── Variant attributes ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_variant_attributes (
        id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL UNIQUE,
        slug VARCHAR(200) NOT NULL UNIQUE
      );
    `);

    // ── Products ─────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_products (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug               VARCHAR(300) NOT NULL UNIQUE,
        sku                VARCHAR(200),
        title              VARCHAR(500) NOT NULL,
        "shortDescription" TEXT,
        description        TEXT,
        "featuredImageKey" VARCHAR(1000),
        "galleryImageKeys" TEXT[] NOT NULL DEFAULT '{}',
        brand              VARCHAR(300),
        specifications     JSONB,
        "seoTitle"         VARCHAR(500),
        "seoDescription"   TEXT,
        "canonicalUrl"     VARCHAR(2000),
        featured           BOOLEAN NOT NULL DEFAULT FALSE,
        status             VARCHAR(50) NOT NULL DEFAULT 'draft',
        "publishedAt"      TIMESTAMPTZ,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deletedAt"        TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_sp_status  ON shop_products(status);
      CREATE INDEX IF NOT EXISTS idx_sp_featured ON shop_products(featured);
    `);

    // ── Product↔Category M2M ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_category_map (
        "productId"  UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
        "categoryId" UUID NOT NULL REFERENCES shop_product_categories(id) ON DELETE CASCADE,
        PRIMARY KEY ("productId", "categoryId")
      );
    `);

    // ── Product↔Tag M2M ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_tag_map (
        "productId" UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
        "tagId"     UUID NOT NULL REFERENCES shop_product_tags(id) ON DELETE CASCADE,
        PRIMARY KEY ("productId", "tagId")
      );
    `);

    // ── Product variants ──────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_variants (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "productId"          UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
        sku                  VARCHAR(200) NOT NULL UNIQUE,
        title                VARCHAR(500) NOT NULL,
        "priceCents"         INT NOT NULL,
        "compareAtPriceCents" INT,
        barcode              VARCHAR(200),
        "weightGrams"        INT,
        dimensions           JSONB,
        "mediaKeys"          TEXT[] NOT NULL DEFAULT '{}',
        "isDefault"          BOOLEAN NOT NULL DEFAULT FALSE,
        "sortOrder"          INT NOT NULL DEFAULT 0,
        "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spv_product ON shop_product_variants("productId");
    `);

    // ── Variant options ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_variant_options (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "variantId"   UUID NOT NULL REFERENCES shop_product_variants(id) ON DELETE CASCADE,
        "attributeId" UUID NOT NULL REFERENCES shop_variant_attributes(id) ON DELETE CASCADE,
        value         VARCHAR(200) NOT NULL,
        UNIQUE ("variantId", "attributeId")
      );
    `);

    // ── Inventory items ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_inventory_items (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "variantId"       UUID NOT NULL REFERENCES shop_product_variants(id) ON DELETE CASCADE UNIQUE,
        "productId"       UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
        available         INT NOT NULL DEFAULT 0,
        reserved          INT NOT NULL DEFAULT 0,
        incoming          INT NOT NULL DEFAULT 0,
        "lowStockThreshold" INT NOT NULL DEFAULT 5,
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Inventory movements ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_inventory_movements (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "variantId"     UUID NOT NULL REFERENCES shop_product_variants(id) ON DELETE CASCADE,
        "orderId"       UUID,
        "adminId"       UUID,
        type            VARCHAR(50) NOT NULL,
        delta           INT NOT NULL,
        "availableAfter" INT NOT NULL,
        "reservedAfter" INT NOT NULL,
        note            TEXT,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sim_variant ON shop_inventory_movements("variantId");
      CREATE INDEX IF NOT EXISTS idx_sim_order   ON shop_inventory_movements("orderId");
    `);

    // ── Carts ──────────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_carts (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token      UUID NOT NULL UNIQUE,
        "userId"   UUID,
        status     VARCHAR(20) NOT NULL DEFAULT 'active',
        "expiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Cart items ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_cart_items (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "cartId"          UUID NOT NULL REFERENCES shop_carts(id) ON DELETE CASCADE,
        "productId"       UUID NOT NULL,
        "variantId"       UUID NOT NULL,
        quantity          INT NOT NULL,
        "unitPriceCents"  INT NOT NULL,
        "titleSnapshot"   VARCHAR(500) NOT NULL,
        "skuSnapshot"     VARCHAR(200),
        "imageKeySnapshot" VARCHAR(1000),
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("cartId", "variantId")
      );
    `);

    // ── Order number sequence ──────────────────────────────────────────────────
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS shop_order_number_seq START 1000;`);

    // ── Orders ────────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_orders (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderNumber"             VARCHAR(50) NOT NULL UNIQUE,
        status                    VARCHAR(30) NOT NULL DEFAULT 'pending',
        "userId"                  UUID,
        "customerId"              UUID,
        "customerEmail"           VARCHAR(300) NOT NULL,
        "customerName"            VARCHAR(300),
        "customerPhone"           VARCHAR(50),
        "shippingAddressSnapshot" JSONB NOT NULL,
        "billingAddressSnapshot"  JSONB,
        "subtotalCents"           INT NOT NULL DEFAULT 0,
        "shippingCents"           INT NOT NULL DEFAULT 0,
        "discountCents"           INT NOT NULL DEFAULT 0,
        "taxCents"                INT NOT NULL DEFAULT 0,
        "totalCents"              INT NOT NULL DEFAULT 0,
        "couponCode"              VARCHAR(100),
        "shippingMethodId"        UUID,
        "paymentIntentId"         VARCHAR(500),
        notes                     TEXT,
        "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_so_status ON shop_orders(status);
      CREATE INDEX IF NOT EXISTS idx_so_email  ON shop_orders("customerEmail");
    `);

    // ── Order items ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_order_items (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId"         UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
        "productId"       UUID,
        "variantId"       UUID,
        "titleSnapshot"   VARCHAR(500) NOT NULL,
        "skuSnapshot"     VARCHAR(200),
        "imageKeySnapshot" VARCHAR(1000),
        quantity          INT NOT NULL,
        "unitPriceCents"  INT NOT NULL,
        "totalCents"      INT NOT NULL,
        "taxRatePct"      NUMERIC(5,2) NOT NULL DEFAULT 20,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Order status history ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_order_status_history (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId"    UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
        "fromStatus" VARCHAR(30),
        "toStatus"   VARCHAR(30) NOT NULL,
        note         TEXT,
        "adminId"    UUID,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Payment transactions ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_payment_transactions (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId"               UUID NOT NULL,
        provider                VARCHAR(50) NOT NULL DEFAULT 'stripe',
        "providerTransactionId" VARCHAR(500) NOT NULL,
        "webhookEventId"        VARCHAR(500) UNIQUE,
        type                    VARCHAR(30) NOT NULL,
        status                  VARCHAR(30) NOT NULL,
        "amountCents"           INT NOT NULL,
        currency                VARCHAR(10) NOT NULL DEFAULT 'EUR',
        metadata                JSONB,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spt_order ON shop_payment_transactions("orderId");
    `);

    // ── Shipping zones ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_shipping_zones (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name          VARCHAR(200) NOT NULL,
        "countryCodes" TEXT[] NOT NULL DEFAULT '{}',
        "isActive"    BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);

    // ── Shipping methods ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_shipping_methods (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "zoneId"          UUID NOT NULL REFERENCES shop_shipping_zones(id) ON DELETE CASCADE,
        name              VARCHAR(200) NOT NULL,
        carrier           VARCHAR(200),
        "priceCents"      INT NOT NULL,
        "freeAboveCents"  INT,
        "estimatedDaysMin" INT NOT NULL DEFAULT 2,
        "estimatedDaysMax" INT NOT NULL DEFAULT 5,
        "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
        "sortOrder"       INT NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_ssm_zone ON shop_shipping_methods("zoneId");
    `);

    // ── Shipments ─────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_shipments (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId"            UUID NOT NULL,
        "methodId"           UUID,
        status               VARCHAR(30) NOT NULL DEFAULT 'pending',
        carrier              VARCHAR(200),
        "trackingNumber"     VARCHAR(300),
        "trackingUrl"        VARCHAR(2000),
        "shippedAt"          TIMESTAMPTZ,
        "deliveredAt"        TIMESTAMPTZ,
        "estimatedDeliveryAt" TIMESTAMPTZ,
        "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ss_order ON shop_shipments("orderId");
    `);

    // ── Product reviews ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_product_reviews (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "productId"         UUID NOT NULL,
        "orderId"           UUID,
        "userId"            UUID,
        "authorName"        VARCHAR(300) NOT NULL,
        "authorEmail"       VARCHAR(300) NOT NULL,
        rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title               VARCHAR(500),
        body                TEXT,
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT FALSE,
        "helpfulVotes"      INT NOT NULL DEFAULT 0,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spr_product ON shop_product_reviews("productId", status);
    `);

    // ── Promotions ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_promotions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code            VARCHAR(100) UNIQUE,
        name            VARCHAR(300) NOT NULL,
        type            VARCHAR(30) NOT NULL,
        value           INT NOT NULL,
        "minOrderCents" INT,
        "maxUsesTotal"  INT,
        "usesCount"     INT NOT NULL DEFAULT 0,
        "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
        "startsAt"      TIMESTAMPTZ,
        "expiresAt"     TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Shop customers ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_customers (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email             VARCHAR(300) NOT NULL UNIQUE,
        "firstName"       VARCHAR(300),
        "lastName"        VARCHAR(300),
        phone             VARCHAR(50),
        "userId"          UUID,
        "marketingOptIn"  BOOLEAN NOT NULL DEFAULT TRUE,
        "totalOrders"     INT NOT NULL DEFAULT 0,
        "totalSpentCents" INT NOT NULL DEFAULT 0,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_email ON shop_customers(email);
    `);

    // ── Customer addresses ─────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_customer_addresses (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "customerId" UUID NOT NULL REFERENCES shop_customers(id) ON DELETE CASCADE,
        name         VARCHAR(300) NOT NULL,
        line1        VARCHAR(500) NOT NULL,
        line2        VARCHAR(500),
        city         VARCHAR(200) NOT NULL,
        zip          VARCHAR(20) NOT NULL,
        country      VARCHAR(10) NOT NULL,
        "isDefault"  BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sca_customer ON shop_customer_addresses("customerId");
    `);

    // ── Collections ───────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_collections (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            VARCHAR(200) NOT NULL UNIQUE,
        name            VARCHAR(500) NOT NULL,
        description     TEXT,
        "imageKey"      VARCHAR(1000),
        "seoTitle"      VARCHAR(500),
        "seoDescription" TEXT,
        "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
        "isFeatured"    BOOLEAN NOT NULL DEFAULT FALSE,
        "sortOrder"     INT NOT NULL DEFAULT 0,
        "publishedAt"   TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Collection products ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_collection_products (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "collectionId" UUID NOT NULL REFERENCES shop_collections(id) ON DELETE CASCADE,
        "productId"    UUID NOT NULL,
        "sortOrder"    INT NOT NULL DEFAULT 0,
        UNIQUE ("collectionId", "productId")
      );
    `);

    // ── Wishlist items ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS shop_wishlist_items (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionToken" VARCHAR(100),
        "userId"       UUID,
        "productId"    UUID NOT NULL,
        "variantId"    UUID,
        "addedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("sessionToken", "productId")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_swi_user_product
        ON shop_wishlist_items("userId", "productId")
        WHERE "userId" IS NOT NULL;
    `);

    // ── Seed: Worldwide shipping zone + free standard shipping ─────────────────
    await qr.query(`
      WITH zone AS (
        INSERT INTO shop_shipping_zones (id, name, "countryCodes", "isActive")
        VALUES (gen_random_uuid(), 'Worldwide', '{}', TRUE)
        RETURNING id
      )
      INSERT INTO shop_shipping_methods ("zoneId", name, "priceCents", "freeAboveCents", "estimatedDaysMin", "estimatedDaysMax", "isActive", "sortOrder")
      SELECT id, 'Standard Shipping', 500, 5000, 3, 7, TRUE, 0 FROM zone
      UNION ALL
      SELECT id, 'Express Shipping',  1200, NULL, 1, 3, TRUE, 1 FROM zone;
    `);

    // ── Seed: default variant attributes ──────────────────────────────────────
    await qr.query(`
      INSERT INTO shop_variant_attributes (id, name, slug)
      VALUES
        (gen_random_uuid(), 'Size',   'size'),
        (gen_random_uuid(), 'Color',  'color'),
        (gen_random_uuid(), 'Material', 'material')
      ON CONFLICT DO NOTHING;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const tables = [
      'shop_wishlist_items', 'shop_collection_products', 'shop_collections',
      'shop_customer_addresses', 'shop_customers', 'shop_promotions',
      'shop_product_reviews', 'shop_shipments', 'shop_shipping_methods',
      'shop_shipping_zones', 'shop_payment_transactions', 'shop_order_status_history',
      'shop_order_items', 'shop_orders', 'shop_cart_items', 'shop_carts',
      'shop_inventory_movements', 'shop_inventory_items', 'shop_variant_options',
      'shop_product_variants', 'shop_product_tag_map', 'shop_product_category_map',
      'shop_products', 'shop_variant_attributes', 'shop_product_tags',
      'shop_product_categories',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }
    await qr.query(`DROP SEQUENCE IF EXISTS shop_order_number_seq;`);
  }
}
