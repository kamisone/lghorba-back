import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CreateQuickReplyDto, CreateQuickReplySchema,
  UpdateQuickReplyDto, UpdateQuickReplySchema,
} from './dto/quick-reply.dto';
import { QuickRepliesService } from './quick-replies.service';

// All routes are admin-only: the global JWT guard protects everything not marked @Public().
@Controller('admin/quick-replies')
export class QuickRepliesController {
  constructor(private readonly service: QuickRepliesService) {}

  // Static-segment route before :id so Express matches "categories" literally.
  @Get('categories')
  categories() {
    return this.service.categories();
  }

  @Get()
  findAll(
    @Query('search')   search?: string,
    @Query('category') category?: string,
    @Query('active')   active?: string,
    @Query('carId', new ParseUUIDPipe({ optional: true })) carId?: string,
  ) {
    return this.service.findAll({
      search:   search?.trim() || undefined,
      category: category?.trim() || undefined,
      active:   active === 'true' ? true : active === 'false' ? false : undefined,
      carId,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateQuickReplySchema)) dto: CreateQuickReplyDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateQuickReplySchema)) dto: UpdateQuickReplyDto,
  ) {
    return this.service.update(id, dto);
  }

  @Patch(':id/active')
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleActive(id);
  }

  @Post(':id/track-usage')
  @HttpCode(204)
  trackUsage(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.trackUsage(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
