import { Controller, Get, Param, Query } from '@nestjs/common';
import { resolveWindow, intParam } from '../analytics/analytics-filters';
import { ReplayAdminService } from './replay-admin.service';

/**
 * Admin-only — protected purely by the global JwtAuthGuard (see
 * app.module.ts APP_GUARD), same as every other controller under
 * admin/shop/analytics/*. No @Public() here, deliberately: this is the one
 * part of the replay feature that must never be reachable without an admin
 * session.
 */
@Controller('admin/shop/analytics/replay')
export class ReplayAdminController {
  constructor(private readonly replayAdmin: ReplayAdminService) {}

  // A distinct top-level path (not nested under sessions/:id) so it can
  // never collide with the sessions/:id route regardless of declaration
  // order.
  @Get('unread-counts')
  getUnreadCounts(
    @Query('productIds') productIds: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.replayAdmin.getUnreadCounts(
      productIds ? productIds.split(',').filter(Boolean) : [],
      resolveWindow({ days, startDate, endDate }),
    );
  }

  @Get('sessions')
  listSessions(
    @Query('productId') productId: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.replayAdmin.listSessions(
      productId,
      resolveWindow({ days, startDate, endDate }),
      intParam(limit) ?? 50,
    );
  }

  @Get('sessions/:id')
  getSessionDetail(@Param('id') id: string) {
    return this.replayAdmin.getSessionDetail(id);
  }

  @Get('sessions/:id/events')
  getSessionEvents(@Param('id') id: string) {
    return this.replayAdmin.getSessionEvents(id);
  }
}
