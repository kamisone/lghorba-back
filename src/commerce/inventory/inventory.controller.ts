import {
  Body, Controller, Get, HttpCode, Param, Patch, Post,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('admin/shop/inventory')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  /** Enriched list — joined product/variant/option data for the admin inventory page. */
  @Get()
  list() { return this.inventory.listAllEnriched(); }

  @Get(':variantId')
  getOne(@Param('variantId') variantId: string) {
    return this.inventory.getByVariant(variantId);
  }

  @Get(':variantId/movements')
  movements(@Param('variantId') variantId: string) {
    return this.inventory.getMovements(variantId);
  }

  @Post(':variantId/adjust')
  adjust(
    @Param('variantId') variantId: string,
    @Body('delta') delta: number,
    @Body('note')  note: string,
  ) {
    return this.inventory.adjust(variantId, delta, note);
  }

  /** Update low-stock threshold or incoming quantity for a SKU. */
  @Patch(':variantId')
  updateSettings(
    @Param('variantId') variantId: string,
    @Body() dto: { lowStockThreshold?: number; incoming?: number },
  ) {
    return this.inventory.updateSettings(variantId, dto);
  }

  /** Bulk stock adjustment — applied sequentially with per-item error isolation. */
  @Post('bulk-adjust')
  @HttpCode(200)
  bulkAdjust(
    @Body() body: { adjustments: Array<{ variantId: string; delta: number; note?: string }> },
  ) {
    return this.inventory.bulkAdjust(body.adjustments ?? []);
  }
}
