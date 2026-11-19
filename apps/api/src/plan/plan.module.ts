import { Module } from '@nestjs/common';
import { DaysController } from './days.controller.js';
import { DaysService } from './days.service.js';
import { PlanController } from './plan.controller.js';
import { PlanReader } from './plan.reader.js';
import { StopsController } from './stops.controller.js';
import { StopsService } from './stops.service.js';
import { TripPlacesController } from './trip-places.controller.js';
import { TripPlacesService } from './trip-places.service.js';

/** A trip's plan: its places, days and stops, read whole and edited under one trip lock. */
@Module({
  controllers: [PlanController, TripPlacesController, DaysController, StopsController],
  providers: [PlanReader, TripPlacesService, DaysService, StopsService],
})
export class PlanModule {}
