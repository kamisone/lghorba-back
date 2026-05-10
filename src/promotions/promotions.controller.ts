import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PromotionsService } from './promotions.service';
import { CreatePromotionSchema, CreatePromotionDto, UpdatePromotionSchema, UpdatePromotionDto } from './dto/create-promotion.dto';
import { ValidateCouponSchema, ValidateCouponDto } from './dto/validate-coupon.dto';

// ── Admin CRUD ──────────────────────────────────────────────────────────────

@Controller('promotions')
export class PromotionsAdminController {
  constructor(private readonly svc: PromotionsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreatePromotionSchema)) dto: CreatePromotionDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePromotionSchema)) dto: UpdatePromotionDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/usages')
  usages(@Param('id') id: string) {
    return this.svc.findUsages(id);
  }
}

// ── Public coupon preview endpoint ──────────────────────────────────────────

@Controller('public/promotions')
export class PublicPromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  @Public()
  @Post('validate')
  async validate(
    @Body(new ZodValidationPipe(ValidateCouponSchema)) dto: ValidateCouponDto,
    @Query('userId') userId?: string,
  ) {
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(dto.endDateTime).getTime() - new Date(dto.startDateTime).getTime()) / 86_400_000,
      ),
    );
    return this.svc.previewCoupon({
      code:          dto.code,
      carId:         dto.carId,
      subtotal:      0, // caller must pass subtotal; fetch from price endpoint first
      deliveryFee:   0,
      days,
      userId:        userId ?? null,
      customerEmail: dto.customerEmail ?? null,
    });
  }

  // Richer validation with actual subtotal provided by caller
  @Public()
  @Post('validate-price')
  async validateWithPrice(
    @Body() body: {
      code:          string;
      carId:         string;
      subtotal:      number;
      deliveryFee?:  number;
      days:          number;
      customerEmail?: string;
    },
    @Query('userId') userId?: string,
  ) {
    return this.svc.previewCoupon({
      code:          body.code,
      carId:         body.carId,
      subtotal:      Number(body.subtotal),
      deliveryFee:   Number(body.deliveryFee ?? 0),
      days:          body.days,
      userId:        userId ?? null,
      customerEmail: body.customerEmail ?? null,
    });
  }
}
