import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ProductService } from './product.service';

@Public()
@Controller('public/shop/variants')
export class VariantStockController {
  constructor(private readonly products: ProductService) {}

  @Get(':variantId/stock')
  getStock(@Param('variantId') variantId: string) {
    return this.products.getVariantStock(variantId);
  }
}
