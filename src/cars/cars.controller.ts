import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CarsService } from './cars.service';
import { CreateCarDto, CreateCarSchema } from './dto/create-car.dto';
import { CreateRentScheduleDto, CreateRentScheduleSchema } from './dto/create-rent-schedule.dto';
import { UpdateRentScheduleDto, UpdateRentScheduleSchema } from './dto/update-rent-schedule.dto';
import { UpdateCarDto, UpdateCarSchema } from './dto/update-car.dto';
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
  create(@Body(new ZodValidationPipe(CreateCarSchema)) dto: CreateCarDto) {
    return this.carsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCarSchema)) dto: UpdateCarDto) {
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
    return this.carsService.setPhoto(id, file);
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const car = await this.carsService.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    res.redirect(302, await this.carsService.getPhotoUrl(car.photo));
  }

  @Delete(':id/photo')
  deletePhoto(@Param('id') id: string) {
    return this.carsService.removePhoto(id);
  }

  @Get(':id/photos')
  listPhotos(@Param('id') id: string) {
    return this.carsService.listPhotos(id);
  }

  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('photo'))
  addPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('photo field is required and must be an image');
    return this.carsService.addPhoto(id, file);
  }

  @Get(':id/photos/:photoId')
  async getPhotoById(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    const url = await this.carsService.getPhotoByIdUrl(id, photoId);
    res.redirect(302, url);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  deletePhotoById(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.carsService.deletePhotoById(id, photoId);
  }

  @Get(':carId/rent-schedules')
  findSchedules(@Param('carId') carId: string) {
    return this.rentSchedulesService.findAllForCar(carId);
  }

  @Post(':carId/rent-schedules')
  createSchedule(
    @Param('carId') carId: string,
    @Body(new ZodValidationPipe(CreateRentScheduleSchema)) dto: CreateRentScheduleDto,
  ) {
    return this.rentSchedulesService.create(carId, dto);
  }

  @Patch(':id/rent-schedules/:scheduleId')
  updateSchedule(
    @Param('id') carId: string,
    @Param('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(UpdateRentScheduleSchema)) dto: UpdateRentScheduleDto,
  ) {
    return this.rentSchedulesService.update(carId, scheduleId, dto);
  }

  @Delete(':carId/rent-schedules/:id')
  @HttpCode(204)
  removeSchedule(@Param('carId') carId: string, @Param('id') id: string) {
    return this.rentSchedulesService.remove(id, carId);
  }
}
