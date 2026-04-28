import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query, UseInterceptors,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BookingStatus } from './booking.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, CreateBookingSchema } from './dto/create-booking.dto';
import { CreateCarPricingDto, CreateCarPricingSchema, UpdateCarPricingDto, UpdateCarPricingSchema } from './dto/create-car-pricing.dto';
import { z } from 'zod';

// ── Public routes ────────────────────────────────────────────────────────────

@Controller('api/public')
export class PublicBookingsController {
  constructor(private readonly svc: BookingsService) {}

  @Public()
  @Get('cars/:carId/availability')
  checkAvailability(
    @Param('carId') carId: string,
    @Query('startDateTime') startDateTime: string,
    @Query('endDateTime') endDateTime: string,
  ) {
    if (!startDateTime || !endDateTime) throw new BadRequestException('startDateTime and endDateTime are required');
    return this.svc.checkAvailability(carId, startDateTime, endDateTime);
  }

  @Public()
  @Get('cars/:carId/price')
  computePrice(
    @Param('carId') carId: string,
    @Query('startDateTime') startDateTime: string,
    @Query('endDateTime') endDateTime: string,
  ) {
    if (!startDateTime || !endDateTime) throw new BadRequestException('startDateTime and endDateTime are required');
    return this.svc.computePrice(carId, startDateTime, endDateTime);
  }

  @Public()
  @Post('bookings')
  @UseInterceptors(IdempotencyInterceptor)
  createBooking(@Body(new ZodValidationPipe(CreateBookingSchema)) dto: CreateBookingDto) {
    return this.svc.createBooking(dto);
  }

  @Public()
  @Get('bookings/:id')
  getBooking(@Param('id') id: string) {
    return this.svc.findBooking(id);
  }
}

// ── Admin routes ─────────────────────────────────────────────────────────────

@Controller('api/bookings')
export class BookingsAdminController {
  constructor(private readonly svc: BookingsService) {}

  @Get()
  findAll(
    @Query('status')    status?:    BookingStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('carId')     carId?:     string,
  ) {
    return this.svc.findAllBookings({
      status:    status    || undefined,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      carId:     carId     || undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findBooking(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: BookingStatus },
  ) {
    const schema = z.object({ status: z.nativeEnum(BookingStatus) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.svc.updateBookingStatus(id, parsed.data.status);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteBooking(@Param('id') id: string) {
    return this.svc.deleteBooking(id);
  }
}

// ── Car Pricings admin ───────────────────────────────────────────────────────

@Controller('api/cars')
export class CarPricingsController {
  constructor(private readonly svc: BookingsService) {}

  @Get(':carId/pricings')
  listPricings(@Param('carId') carId: string) {
    return this.svc.listPricings(carId);
  }

  @Post(':carId/pricings')
  createPricing(
    @Param('carId') carId: string,
    @Body(new ZodValidationPipe(CreateCarPricingSchema)) dto: CreateCarPricingDto,
  ) {
    return this.svc.createPricing(carId, dto);
  }

  @Patch(':carId/pricings/:id')
  updatePricing(
    @Param('carId') carId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCarPricingSchema)) dto: UpdateCarPricingDto,
  ) {
    return this.svc.updatePricing(carId, id, dto);
  }

  @Delete(':carId/pricings/:id')
  @HttpCode(204)
  removePricing(@Param('carId') carId: string, @Param('id') id: string) {
    return this.svc.removePricing(carId, id);
  }
}
