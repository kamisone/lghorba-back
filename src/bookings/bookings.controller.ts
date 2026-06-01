import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BookingSource, BookingStatus } from './booking.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingAdminDto, CreateBookingAdminSchema } from './dto/create-booking-admin.dto';
import { UpdateBookingAdminSchema } from './dto/update-booking-admin.dto';
import { CreateCarPricingDto, CreateCarPricingSchema, UpdateCarPricingDto, UpdateCarPricingSchema } from './dto/create-car-pricing.dto';
import { z } from 'zod';

// ── Public routes ────────────────────────────────────────────────────────────

@Controller('public')
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
  @Get('bookings/:id')
  getBooking(@Param('id') id: string) {
    return this.svc.findBooking(id);
  }

  @Public()
  @Get('cars/:carId/calendar')
  getMonthCalendar(
    @Param('carId') carId: string,
    @Query('year')  yearStr: string,
    @Query('month') monthStr: string,
  ) {
    const year  = parseInt(yearStr,  10);
    const month = parseInt(monthStr, 10);
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('year and month (1-12) are required');
    }
    return this.svc.getMonthCalendar(carId, year, month);
  }
}

// ── Admin routes ─────────────────────────────────────────────────────────────

@Controller('bookings')
export class BookingsAdminController {
  constructor(private readonly svc: BookingsService) {}

  @Get()
  findAll(
    @Query('status')    status?:    BookingStatus,
    @Query('source')    source?:    BookingSource,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?:   string,
    @Query('carId')     carId?:     string,
  ) {
    return this.svc.findAllBookings({
      status:    status    || undefined,
      source:    source    || undefined,
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
      carId:     carId     || undefined,
    });
  }

  @Get('calendar')
  getCalendar(@Query('carId') carId: string) {
    if (!carId) throw new BadRequestException('carId is required');
    return this.svc.findCalendarBookings(carId);
  }

  @Post()
  createAdmin(@Body(new ZodValidationPipe(CreateBookingAdminSchema)) dto: CreateBookingAdminDto) {
    return this.svc.createBookingAdmin(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findBooking(id);
  }

  @Put(':id')
  updateAdmin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBookingAdminSchema)) dto: CreateBookingAdminDto,
  ) {
    return this.svc.updateBookingAdmin(id, dto);
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

  @Post(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @Body() body: { endDateTime?: string },
  ) {
    const schema = z.object({ endDateTime: z.string().min(1) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.message);
    return this.svc.reactivateBooking(id, parsed.data.endDateTime);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteBooking(@Param('id') id: string) {
    return this.svc.deleteBooking(id);
  }
}

// ── Car Pricings admin ───────────────────────────────────────────────────────

@Controller('cars')
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
