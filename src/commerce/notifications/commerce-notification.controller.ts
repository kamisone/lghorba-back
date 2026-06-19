import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CommerceNotificationService, CommerceNotifSettings } from './commerce-notification.service';

@Controller('admin/shop/notifications')
export class CommerceNotificationController {
  constructor(private readonly service: CommerceNotificationService) {}

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Partial<CommerceNotifSettings>) {
    return this.service.updateSettings(body);
  }

  @Get('logs')
  getLogs(
    @Query('channel') channel?: string,
    @Query('event')   event?: string,
    @Query('status')  status?: string,
    @Query('limit')   limit?: string,
    @Query('offset')  offset?: string,
  ) {
    return this.service.getLogs({
      channel,
      event,
      status,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
