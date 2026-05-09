import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService, Period } from './analytics.service';

function parsePeriod(raw: string | undefined): Period {
  if (raw === '7d' || raw === '90d') return raw;
  return '30d';
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('overview')
  overview(@Query('period') period?: string) {
    return this.service.getOverview(parsePeriod(period));
  }

  @Get('fleet')
  fleet(@Query('period') period?: string) {
    return this.service.getFleetMetrics(parsePeriod(period));
  }

  @Get('utilization')
  utilization(@Query('period') period?: string) {
    return this.service.getUtilization(parsePeriod(period));
  }

  @Get('telemetry')
  telemetry() {
    return this.service.getTelemetry();
  }
}
