import {
  BadRequestException, Body, Controller, Delete, Get,
  HttpCode, Param, Post, Query, Redirect, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InspectionsService } from './inspections.service';
import { InspectionType } from './entities/inspection.entity';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  @Get()
  findAll(
    @Query('carId')     carId?: string,
    @Query('type')      type?: string,
    @Query('bookingId') bookingId?: string,
    @Query('from')      from?: string,
    @Query('to')        to?: string,
  ) {
    return this.service.findAll({ carId, type: type as InspectionType, bookingId, from, to });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: Record<string, unknown>) {
    return this.service.create(dto as any);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('photo'))
  addPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    if (!file) throw new BadRequestException('photo field is required');
    return this.service.addPhoto(id, file, caption);
  }

  @Get(':id/photos/:photoId')
  @Redirect()
  async getPhoto(@Param('id') _id: string, @Param('photoId') photoId: string) {
    const url = await this.service.getPhotoUrl(photoId);
    return { url, statusCode: 302 };
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  removePhoto(@Param('id') _id: string, @Param('photoId') photoId: string) {
    return this.service.removePhoto(photoId);
  }
}
