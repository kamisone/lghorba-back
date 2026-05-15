import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateVehicleFaqDto, CreateVehicleFaqSchema,
  ReorderVehicleFaqsDto, ReorderVehicleFaqsSchema,
  UpdateVehicleFaqDto, UpdateVehicleFaqSchema,
} from './dto/vehicle-faq.dto';
import { VehicleFaqsService } from './vehicle-faqs.service';

@Controller()
export class VehicleFaqsController {
  constructor(private readonly service: VehicleFaqsService) {}

  // ── Public ────────────────────────────────────────────────────────────────────

  @Public()
  @Get('public/vehicle-faqs')
  findPublic(
    @Query('entityType') entityType = 'car',
    @Query('entityId')   entityId: string,
    @Query('lang')       lang = 'fr',
  ) {
    return this.service.findPublic(entityType, entityId, lang);
  }

  // ── Admin (JWT-protected via global guard) ────────────────────────────────────
  // Define static-segment routes before the :id parameterised routes so Express
  // matches "reorder" literally before treating it as an id value.

  @Patch('admin/vehicle-faqs/reorder')
  reorder(@Body(new ZodValidationPipe(ReorderVehicleFaqsSchema)) dto: ReorderVehicleFaqsDto) {
    return this.service.reorder(dto.ids);
  }

  @Get('admin/vehicle-faqs')
  findAll(
    @Query('entityType') entityType = 'car',
    @Query('entityId')   entityId: string,
  ) {
    return this.service.findAll(entityType, entityId);
  }

  @Get('admin/vehicle-faqs/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('admin/vehicle-faqs')
  create(@Body(new ZodValidationPipe(CreateVehicleFaqSchema)) dto: CreateVehicleFaqDto) {
    return this.service.create(dto);
  }

  @Put('admin/vehicle-faqs/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVehicleFaqSchema)) dto: UpdateVehicleFaqDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch('admin/vehicle-faqs/:id/visibility')
  toggleVisibility(@Param('id') id: string) {
    return this.service.toggleVisibility(id);
  }

  @Delete('admin/vehicle-faqs/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
