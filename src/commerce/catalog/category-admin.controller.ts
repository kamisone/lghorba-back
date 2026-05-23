import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('admin/shop/categories')
export class CategoryAdminController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  list() { return this.productService.getCategories(); }

  @Post()
  create(@Body() dto: unknown) { return this.productService.createCategory(dto as any); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: unknown) {
    return this.productService.updateCategory(id, dto as any);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.productService.deleteCategory(id); }
}
