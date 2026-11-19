import { Module } from '@nestjs/common';
import { PreviewPointsReader } from './preview-points.reader.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

/** Trips as a resource: list, create, read, edit, share, copy, delete. */
@Module({
  controllers: [TripsController],
  providers: [TripsService, PreviewPointsReader],
  exports: [PreviewPointsReader],
})
export class TripsModule {}
