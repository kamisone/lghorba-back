import {
  Body, Controller, Delete, Get,
  HttpCode, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceStatus } from './entities/maintenance-record.entity';

const CreateRecordSchema = z.object({
  carId:               z.string().uuid(),
  maintenanceTypeId:   z.string().uuid(),
  title:               z.string().min(1).max(300),
  status:              z.enum(['planned','scheduled','in_progress','waiting_parts','completed','cancelled']).optional(),
  scheduledDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description:         z.string().max(2000).optional(),
  supplierId:          z.string().uuid().optional(),
  costEur:             z.number().min(0).optional(),
  invoiceRef:          z.string().max(200).optional(),
  odometerAtServiceKm: z.number().int().min(0).optional(),
  notes:               z.string().max(2000).optional(),
});

const UpdateRecordSchema = z.object({
  title:               z.string().min(1).max(300).optional(),
  description:         z.string().max(2000).nullish(),
  scheduledDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  supplierId:          z.string().uuid().nullish(),
  costEur:             z.number().min(0).nullish(),
  invoiceRef:          z.string().max(200).nullish(),
  odometerAtServiceKm: z.number().int().min(0).nullish(),
  notes:               z.string().max(2000).nullish(),
});

const TransitionSchema = z.object({
  status: z.enum(['planned','scheduled','in_progress','waiting_parts','completed','cancelled']),
});

const CreateTypeSchema = z.object({
  name:           z.string().min(1).max(200),
  code:           z.string().min(1).max(100),
  description:    z.string().max(1000).optional(),
  defaultCostEur: z.number().min(0).optional(),
  intervalDays:   z.number().int().min(1).optional(),
  intervalKm:     z.number().int().min(1).optional(),
});

const CreateSupplierSchema = z.object({
  name:      z.string().min(1).max(200),
  address:   z.string().max(500).optional(),
  phone:     z.string().max(50).optional(),
  email:     z.string().email().optional(),
  specialty: z.string().max(200).optional(),
  notes:     z.string().max(2000).optional(),
});

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // ── Records ───────────────────────────────────────────────────────────────

  @Get()
  findAll(
    @Query('carId')  carId?: string,
    @Query('status') status?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
  ) {
    return this.service.findAll({ carId, status: status as MaintenanceStatus, from, to });
  }

  @Get('overdue')
  findOverdue() {
    return this.service.findOverdue();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateRecordSchema)) dto: z.infer<typeof CreateRecordSchema>) {
    return this.service.create(dto as any);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRecordSchema)) dto: z.infer<typeof UpdateRecordSchema>,
  ) {
    // If status is provided, handle as transition
    return this.service.update(id, dto as any);
  }

  @Post(':id/transition')
  @HttpCode(200)
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TransitionSchema)) dto: z.infer<typeof TransitionSchema>,
  ) {
    return this.service.transitionStatus(id, dto.status);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  @Get('types/all')
  findAllTypes() {
    return this.service.findAllTypes();
  }

  @Post('types')
  createType(@Body(new ZodValidationPipe(CreateTypeSchema)) dto: z.infer<typeof CreateTypeSchema>) {
    return this.service.createType(dto);
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateType(id, dto as any);
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  @Get('suppliers/all')
  findAllSuppliers() {
    return this.service.findAllSuppliers();
  }

  @Post('suppliers')
  createSupplier(@Body(new ZodValidationPipe(CreateSupplierSchema)) dto: z.infer<typeof CreateSupplierSchema>) {
    return this.service.createSupplier(dto);
  }

  @Put('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateSupplier(id, dto as any);
  }

  @Delete('suppliers/:id')
  @HttpCode(204)
  removeSupplier(@Param('id') id: string) {
    return this.service.removeSupplier(id);
  }
}
