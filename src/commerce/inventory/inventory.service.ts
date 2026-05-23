import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../entities/inventory-item.entity';
import { InventoryMovement, MovementType } from '../entities/inventory-movement.entity';
import { CommerceEventBus } from '../events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../events/commerce-events';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryItem)     private readonly itemRepo:     Repository<InventoryItem>,
    @InjectRepository(InventoryMovement) private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource:  DataSource,
    private readonly eventBus:    CommerceEventBus,
  ) {}

  async getByVariant(variantId: string): Promise<InventoryItem | null> {
    return this.itemRepo.findOneBy({ variantId });
  }

  async listAll(): Promise<InventoryItem[]> {
    return this.itemRepo.find();
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
        note:           `Released ${quantity} reserved units (order cancelled)`,
      }));
    });

    this.eventBus.emit(
      COMMERCE_EVENTS.INVENTORY_RELEASED,
      { variantId, orderId, quantity },
      { entityId: orderId, source: 'InventoryService.releaseForOrder' },
    );
  }

  // ── Commit reserve → sold when order ships ────────────────────────────────

  async confirmSale(variantId: string, quantity: number, orderId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const item = await em
        .getRepository(InventoryItem)
        .createQueryBuilder('inv')
        .where('inv.variantId = :variantId', { variantId })
        .setLock('pessimistic_write')
        .getOne();

      if (!item) return;

      item.reserved = Math.max(0, item.reserved - quantity);
      await em.save(InventoryItem, item);

      await em.save(InventoryMovement, em.create(InventoryMovement, {
        variantId,
        orderId,
        type:           'order_shipped' as MovementType,
        delta:          -quantity,
        availableAfter: item.available,
        reservedAfter:  item.reserved,
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
