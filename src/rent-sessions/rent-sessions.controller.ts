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

@Controller('api/rent-sessions')
export class RentSessionsController {
  constructor(private readonly service: RentSessionsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateRentSessionSchema)) dto: CreateRentSessionDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('carId') carId: string, @Query('unlinked') unlinked?: string) {
    if (unlinked === 'true') return this.service.findUnlinked();
    return this.service.findAllForCar(carId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
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

  @Post(':id/positions')
  addPosition(@Param('id') id: string, @Body(new ZodValidationPipe(CreateRentPositionSchema)) dto: CreateRentPositionDto) {
    return this.service.addPosition(id, dto);
  }

  @Get(':id/positions')
  getPositions(@Param('id') id: string) {
    return this.service.getPositions(id);
  }
}
