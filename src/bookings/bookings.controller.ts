import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
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
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) throw new BadRequestException('startDate and endDate are required');
    return this.svc.checkAvailability(carId, startDate, endDate);
  }

  @Public()
  @Get('cars/:carId/price')
  computePrice(
    @Param('carId') carId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) throw new BadRequestException('startDate and endDate are required');
    return this.svc.computePrice(carId, startDate, endDate);
  }

  @Public()
  @Post('bookings')
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
  findAll() {
    return this.svc.findAllBookings();
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
