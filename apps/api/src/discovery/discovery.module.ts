import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { PublicTripsReader } from './public-trips.reader.js';

/** Public trips of every author; `PublicTripsReader` also serves an author's profile list (E16). */
@Module({
  imports: [TripsModule],
  controllers: [DiscoveryController],
  providers: [PublicTripsReader],
  exports: [PublicTripsReader],
})
export class DiscoveryModule {}
