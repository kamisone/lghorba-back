import { Controller, Get, Query } from '@nestjs/common';
import { FleetAnalyticsService } from './fleet-analytics.service';

@Controller('fleet-analytics')
export class FleetAnalyticsController {
  constructor(private readonly service: FleetAnalyticsService) {}

  @Get('health-overview')
  healthOverview() {
    return this.service.getHealthOverview();
  }

  @Get('overdue-maintenance')
  overdueMaintenance() {
    return this.service.getOverdueMaintenance();
  }

  @Get('cost-per-vehicle')
  costPerVehicle(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getCostPerVehicle(from, to);
  }

  @Get('downtime')
  downtime(
    @Query('carId') carId?: string,
    @Query('from')  from?: string,
    @Query('to')    to?: string,
  ) {
    return this.service.getDowntime(carId, from, to);
  }

  @Get('cost-summary')
  costSummary(@Query('carId') carId: string) {
    return this.service.getCostSummary(carId);
  }
}
