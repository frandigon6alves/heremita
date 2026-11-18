import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CLOCK } from './clock/clock.js';
import { SystemClock } from './clock/system-clock.js';
import { DEFAULT_THROTTLE } from './http/throttles.js';
import { RatingSummaryReader } from './rating-summary.reader.js';
import { TripAccessService } from './trip-access.service.js';

/** Cross-cutting services every feature module may inject. Tests replace `CLOCK` with a `FixedClock`. */
@Global()
@Module({
  imports: [
    // SHORTCUT(owner): rate-limit, login-attempt and upstream token-bucket state in API process memory — ceiling: one API instance, counters reset on restart; upgrade: before a second API instance runs, move them to a Postgres-backed store
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ...DEFAULT_THROTTLE }] }),
  ],
  providers: [{ provide: CLOCK, useClass: SystemClock }, TripAccessService, RatingSummaryReader],
  exports: [CLOCK, TripAccessService, RatingSummaryReader],
})
export class CoreModule {}
