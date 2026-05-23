import {
  Body, Controller, Get, Param, Post,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('admin/shop/inventory')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list() { return this.inventory.listAll(); }

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
}
