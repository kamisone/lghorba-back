import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateRentPositionDto, CreateRentPositionSchema } from './dto/create-rent-position.dto';
import { CreateRentSessionDto, CreateRentSessionSchema } from './dto/create-rent-session.dto';
import { PatchRentSessionDto, PatchRentSessionSchema } from './dto/patch-rent-session.dto';
import { RentSessionsService } from './rent-sessions.service';

@Controller('rent-sessions')
export class RentSessionsController {
  constructor(private readonly service: RentSessionsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateRentSessionSchema)) dto: CreateRentSessionDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('carId') carId: string,
    @Query('unlinked') unlinked?: string,
    @Query('includeRejected') includeRejected?: string,
  ) {
    if (unlinked === 'true') return this.service.findUnlinked();
    return this.service.findAllForCar(carId, includeRejected === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('includeRejected') includeRejected?: string) {
    return this.service.findOne(id, includeRejected === 'true');
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body(new ZodValidationPipe(PatchRentSessionSchema)) dto: PatchRentSessionDto) {
    return this.service.patch(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // Authenticated admin entry — trusted, so the plausibility filter is bypassed.
  @Post(':id/positions')
  addPosition(@Param('id') id: string, @Body(new ZodValidationPipe(CreateRentPositionSchema)) dto: CreateRentPositionDto) {
    return this.service.addPosition(id, dto, { skipFilter: true });
  }

  @Get(':id/positions')
  getPositions(@Param('id') id: string, @Query('includeRejected') includeRejected?: string) {
    return this.service.getPositions(id, includeRejected === 'true');
  }

  @Delete(':id/positions/:positionId')
  @HttpCode(204)
  removePosition(@Param('id') id: string, @Param('positionId') positionId: string) {
    return this.service.removePosition(id, positionId);
  }
}
