import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post,
  Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService, TrackUsageDto } from './media.service';
import { MediaEntityType } from './media-usage.entity';

@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @Query('search')   search?:   string,
    @Query('mimeType') mimeType?: string,
    @Query('tag')      tag?:      string,
    @Query('limit')    limit?:    string,
    @Query('offset')   offset?:   string,
  ) {
    return this.media.list({
      search,
      mimeType,
      tag,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('altText')    altText?:    string,
    @Body('uploadedBy') uploadedBy?: string,
  ) {
    if (!file) throw new Error('No file provided');
    return this.media.upload(file, altText, uploadedBy);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.media.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id:   string,
    @Body() dto: { altText?: string; tags?: string[] },
  ) {
    return this.media.updateMetadata(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.media.delete(id);
  }

  @Get(':id/usage')
  getUsage(@Param('id') id: string) {
    return this.media.getUsage(id);
  }

  @Post(':id/usage')
  trackUsage(@Param('id') assetId: string, @Body() dto: TrackUsageDto) {
    return this.media.trackUsage(assetId, dto);
  }

  @Delete(':id/usage')
  @HttpCode(204)
  removeUsage(
    @Param('id') assetId: string,
    @Body('entityType') entityType: MediaEntityType,
    @Body('entityId')   entityId:   string,
    @Body('field')      field:      string,
  ) {
    return this.media.removeUsage(assetId, entityType, entityId, field);
  }
}
