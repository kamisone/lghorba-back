import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PriceRuleService, CreatePriceRuleDto } from './price-rule.service';

@Controller('admin/shop/price-rules')
export class PriceRuleAdminController {
  constructor(private readonly svc: PriceRuleService) {}

  @Get()    list()                                  { return this.svc.list(); }
  @Get(':id') findOne(@Param('id') id: string)      { return this.svc.findOne(id); }
  @Post()   create(@Body() dto: CreatePriceRuleDto) { return this.svc.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePriceRuleDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
