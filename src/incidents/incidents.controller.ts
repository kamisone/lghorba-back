import {
  BadRequestException, Body, Controller, Delete, Get,
  HttpCode, Param, Patch, Post, Query, Redirect, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IncidentsService } from './incidents.service';
import { IncidentType } from './entities/incident.entity';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  findAll(
    @Query('carId') carId?: string,
    @Query('type')  type?: string,
    @Query('from')  from?: string,
    @Query('to')    to?: string,
  ) {
    return this.service.findAll({ carId, type: type as IncidentType, from, to });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: Record<string, unknown>) {
    return this.service.create(dto as any);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.update(id, dto as any);
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
