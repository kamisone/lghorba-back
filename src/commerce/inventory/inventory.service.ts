import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../entities/inventory-item.entity';
import { InventoryMovement, MovementType } from '../entities/inventory-movement.entity';
import { CommerceEventBus } from '../events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../events/commerce-events';
import { AssetUrlService } from '../../asset-url/asset-url.service';

export interface EnrichedInventoryItem {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  variantTitle: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  featuredMediaUrl: string | null;
  optionValues: Array<{
    optionValueId: string;
    value: string;
    displayValue: string | null;
    attributeName: string;
    attributeId: string;
  }>;
  productTitle: string;
  productSlug: string;
  productStatus: string;
  available: number;
  reserved: number;
  committed: number;
  incoming: number;
  lowStockThreshold: number;
  updatedAt: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryItem)     private readonly itemRepo:     Repository<InventoryItem>,
    @InjectRepository(InventoryMovement) private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource:  DataSource,
    private readonly eventBus:    CommerceEventBus,
    private readonly assetUrl:    AssetUrlService,
  ) {}

  async getByVariant(variantId: string): Promise<InventoryItem | null> {
    return this.itemRepo.findOneBy({ variantId });
  }

  async listAll(): Promise<InventoryItem[]> {
    return this.itemRepo.find();
  }

  // ── Enriched list (for admin inventory page) ───────────────────────────────

  async listAllEnriched(): Promise<EnrichedInventoryItem[]> {
    const rows: any[] = await this.itemRepo.manager.query(`
      SELECT
        inv.id,
        inv."variantId",
        inv."productId",
        inv.available,
        inv.reserved,
        inv.committed,
        inv.incoming,
        inv."lowStockThreshold",
        inv."updatedAt",
        v.sku,
        v.title               AS "variantTitle",
        COALESCE(v."priceCents", p."basePriceCents") AS "priceCents",
        v."compareAtPriceCents",
        v."featuredMediaKey"  AS "variantMediaKey",
        p.title               AS "productTitle",
        p.slug                AS "productSlug",
        p.status              AS "productStatus",
        p."featuredImageKey"  AS "productImageKey"
      FROM shop_inventory_items  inv
      JOIN shop_product_variants v ON v.id  = inv."variantId"
      JOIN shop_products         p ON p.id  = inv."productId"
      WHERE p."deletedAt" IS NULL
        AND v."combinationHash" IS NOT NULL
      ORDER BY p.title ASC, v."sortOrder" ASC, v.title ASC
    `);

    if (!rows.length) return [];

    const variantIds = rows.map(r => r.variantId);

    const optionRows: any[] = await this.itemRepo.manager.query(`
      SELECT
        vo."variantId",
        ov.id           AS "optionValueId",
        ov.value,
        ov."displayValue",
        attr.name        AS "attributeName",
        attr.id          AS "attributeId",
        attr."sortOrder" AS "attrSortOrder"
      FROM shop_variant_options          vo
      JOIN shop_variation_option_values  ov   ON ov.id   = vo."optionValueId"
      JOIN shop_variant_attributes       attr ON attr.id = vo."attributeId"
      WHERE vo."variantId" = ANY($1)
        AND vo."optionValueId" IS NOT NULL
      ORDER BY attr."sortOrder" ASC
    `, [variantIds]);

    const optsByVariant = new Map<string, typeof optionRows>();
    for (const ov of optionRows) {
      const arr = optsByVariant.get(ov.variantId) ?? [];
      arr.push(ov);
      optsByVariant.set(ov.variantId, arr);
    }

    const mediaKeys = [
      ...rows.map(r => r.variantMediaKey).filter(Boolean),
      ...rows.map(r => r.productImageKey).filter(Boolean),
    ] as string[];
    const urlMap = await this.assetUrl.resolveBatch(mediaKeys);

    return rows.map(r => {
      const available  = Number(r.available  ?? 0);
      const threshold  = Number(r.lowStockThreshold ?? 5);
      const mediaUrl   = r.variantMediaKey
        ? (urlMap.get(r.variantMediaKey) ?? null)
        : (r.productImageKey ? (urlMap.get(r.productImageKey) ?? null) : null);

      return {
        id:                  r.id,
        variantId:           r.variantId,
        productId:           r.productId,
        sku:                 r.sku,
        variantTitle:        r.variantTitle,
        priceCents:          Number(r.priceCents  ?? 0),
        compareAtPriceCents: r.compareAtPriceCents ? Number(r.compareAtPriceCents) : null,
        featuredMediaUrl:    mediaUrl,
        optionValues:        optsByVariant.get(r.variantId) ?? [],
        productTitle:        r.productTitle,
        productSlug:         r.productSlug,
        productStatus:       r.productStatus,
        available,
        reserved:   Number(r.reserved  ?? 0),
        committed:  Number(r.committed ?? 0),
        incoming:   Number(r.incoming  ?? 0),
        lowStockThreshold: threshold,
        updatedAt:  r.updatedAt,
        status: available <= 0 ? 'out_of_stock' : available <= threshold ? 'low_stock' : 'in_stock',
      } as EnrichedInventoryItem;
    });
  }

  // ── Update inventory settings ──────────────────────────────────────────────

  async updateSettings(
    variantId: string,
    dto: { lowStockThreshold?: number; incoming?: number },
  ): Promise<InventoryItem> {
    const item = await this.itemRepo.findOneBy({ variantId });
    if (!item) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);
    if (dto.lowStockThreshold !== undefined) item.lowStockThreshold = dto.lowStockThreshold;
    if (dto.incoming          !== undefined) item.incoming          = dto.incoming;
    return this.itemRepo.save(item);
  }

  // ── Bulk adjust ────────────────────────────────────────────────────────────

  async bulkAdjust(
    adjustments: Array<{ variantId: string; delta: number; note?: string }>,
    adminId?: string,
  ): Promise<{ ok: number; failed: number }> {
    let ok = 0; let failed = 0;
    for (const adj of adjustments) {
      try {
        await this.adjust(adj.variantId, adj.delta, adj.note ?? 'Bulk adjustment', adminId);
        ok++;
      } catch (err) {
        failed++;
        this.logger.warn(`Bulk adjust failed for ${adj.variantId}: ${(err as Error).message}`);
      }
    }
    return { ok, failed };
  }

  // ── Reserve stock when an order is placed (pessimistic lock) ───────────────

  async reserveForOrder(
    variantId: string,
    quantity: number,
    orderId: string,
    em?: EntityManager,
  ): Promise<void> {
    const run = async (manager: EntityManager) => {
      const item = await manager
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);
      if (item.available < quantity) {
        throw new BadRequestException(`Insufficient stock: ${item.available} available, ${quantity} requested`);
      }

      item.available -= quantity;
      item.reserved  += quantity;
      await manager.save(InventoryItem, item);

      await manager.save(InventoryMovement, manager.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_placed' as MovementType,
        delta:          -quantity,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note:           `Reserved ${quantity} units for order`,
      }));
    };

    if (em) {
      await run(em);
    } else {
      await this.dataSource.transaction(run);
    }

    this.eventBus.emit(
      COMMERCE_EVENTS.INVENTORY_RESERVED,
      { variantId, orderId, quantity },
      { entityId: orderId, source: 'InventoryService.reserveForOrder' },
    );
  }

  // ── Release reserve when order is cancelled ────────────────────────────────

  async releaseForOrder(variantId: string, quantity: number, orderId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) return;

      item.reserved  = Math.max(0, item.reserved - quantity);
      item.available += quantity;
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_cancelled' as MovementType,
        delta:          quantity,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note:           `Released ${quantity} reserved units (order cancelled)`,
      }));
    });

    this.eventBus.emit(
      COMMERCE_EVENTS.INVENTORY_RELEASED,
      { variantId, orderId, quantity },
      { entityId: orderId, source: 'InventoryService.releaseForOrder' },
    );
  }

  // ── Commit reserve → committed when order is paid ───────────────────────────
  // Moves stock from "Reserved" (held for an unpaid order, subject to the
  // 15-minute checkout reservation) into "Committed" (held for a paid order,
  // awaiting fulfillment — no longer subject to expiry).

  async commitForOrder(variantId: string, quantity: number, orderId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) return;

      item.reserved  = Math.max(0, item.reserved - quantity);
      item.committed += quantity;
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_paid' as MovementType,
        delta:          0,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note:           `Committed ${quantity} units (order paid)`,
      }));
    });
  }

  // ── Release committed stock when a paid order is cancelled/refunded ────────
  // Used when an order is cancelled or refunded *after* payment but before
  // shipment — the units move from "Committed" back to "Available".

  async releaseCommittedForOrder(variantId: string, quantity: number, orderId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) return;

      item.committed = Math.max(0, item.committed - quantity);
      item.available += quantity;
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_refunded' as MovementType,
        delta:          quantity,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note:           `Released ${quantity} committed units (paid order cancelled/refunded)`,
      }));
    });

    this.eventBus.emit(
      COMMERCE_EVENTS.INVENTORY_RELEASED,
      { variantId, orderId, quantity },
      { entityId: orderId, source: 'InventoryService.releaseCommittedForOrder' },
    );
  }

  // ── Commit → sold when order ships ──────────────────────────────────────────

  async confirmSale(variantId: string, quantity: number, orderId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) return;

      item.committed = Math.max(0, item.committed - quantity);
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_shipped' as MovementType,
        delta:          -quantity,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note:           `Confirmed sale of ${quantity} units`,
      }));
    });
  }

  // ── Manual adjustment ──────────────────────────────────────────────────────

  async adjust(variantId: string, delta: number, note: string, adminId?: string): Promise<InventoryItem> {
    return this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) throw new NotFoundException(`Inventory record not found for variant ${variantId}`);

      const prevAvailable = item.available;
      const newAvailable  = item.available + delta;
      if (newAvailable < 0) throw new BadRequestException('Adjustment would result in negative stock');

      item.available = newAvailable;
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId: null,
        adminId: adminId ?? null,
        type:           'manual_adjustment' as MovementType,
        delta,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
        committedAfter: item.committed,
        note,
      }));

      if (prevAvailable === 0 && item.available > 0 && item.productId) {
        this.eventBus.emit(
          COMMERCE_EVENTS.INVENTORY_RESTOCKED,
          { productId: item.productId, variantId, newAvailable: item.available },
          { entityId: item.productId, source: 'InventoryService.adjust' },
        );
      }

      return item;
    });
  }

  async getMovements(variantId: string): Promise<InventoryMovement[]> {
    return this.movementRepo.find({
      where:  { variantId },
      order:  { createdAt: 'DESC' },
      take:   50,
    });
  }
}
