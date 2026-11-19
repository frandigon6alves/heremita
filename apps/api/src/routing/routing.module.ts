import { Module } from '@nestjs/common';
import { DayStopsReader } from './day-stops.reader.js';
import { LegRouter } from './leg-router.js';
import { RoutingController } from './routing.controller.js';
import { RoutingService } from './routing.service.js';

/** Day routes and stop-order suggestions over the selected routing provider. */
@Module({
  controllers: [RoutingController],
  providers: [RoutingService, DayStopsReader, LegRouter],
})
export class RoutingModule {}
