import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { CarsService, UPLOADS_DIR } from './cars.service';
import { CreateCarDto } from './dto/create-car.dto';
import { CreateRentScheduleDto } from './dto/create-rent-schedule.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { RentSchedulesService } from './rent-schedules.service';

@Controller('api/cars')
export class CarsController {
  constructor(
    private readonly carsService: CarsService,
    private readonly rentSchedulesService: RentSchedulesService,
  ) {}

  @Get()
  findAll() {
    return this.carsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.carsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCarDto) {
    return this.carsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCarDto) {
    return this.carsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.carsService.remove(id);
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('photo field is required and must be an image');
    return this.carsService.setPhoto(id, file.filename);
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const car = await this.carsService.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    res.sendFile(path.join(UPLOADS_DIR, car.photo));
  }

  @Delete(':id/photo')
  deletePhoto(@Param('id') id: string) {
    return this.carsService.removePhoto(id);
  }

  @Get(':carId/rent-schedules')
  findSchedules(@Param('carId') carId: string) {
    return this.rentSchedulesService.findAllForCar(carId);
  }

  @Post(':carId/rent-schedules')
  createSchedule(@Param('carId') carId: string, @Body() dto: CreateRentScheduleDto) {
    return this.rentSchedulesService.create(carId, dto);
  }

  @Delete(':carId/rent-schedules/:id')
  @HttpCode(204)
  removeSchedule(@Param('carId') carId: string, @Param('id') id: string) {
    return this.rentSchedulesService.remove(id, carId);
  }
}
