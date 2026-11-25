import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { SessionGuard } from './auth/session.guard.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CoreModule } from './core/core.module.js';
import { AppThrottlerGuard } from './core/http/app-throttler.guard.js';
import { ContractInterceptor } from './core/http/contract.interceptor.js';
import { CsrfGuard } from './core/http/csrf.guard.js';
import { JobsModule } from './core/jobs/jobs.module.js';
import { loggerParams } from './core/logging/logger-params.js';
import { DiscoveryModule } from './discovery/discovery.module.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { OpenApiModule } from './openapi/openapi.module.js';
import { PlacesModule } from './places/places.module.js';
import { PlanModule } from './plan/plan.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProvidersModule } from './providers/core/providers.module.js';
import { nominatimAdapter } from './providers/nominatim/nominatim.geocoder.js';
import { osrmAdapter } from './providers/osrm/osrm-router.js';
import { photonAdapter } from './providers/photon/photon.geocoder.js';
import { ReportsModule } from './reports/reports.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { RoutingModule } from './routing/routing.module.js';
import { SuggestionsModule } from './suggestions/suggestions.module.js';
import { TripsModule } from './trips/trips.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => loggerParams(env),
    }),
    PrismaModule,
    CoreModule,
    ProvidersModule.forRoot({
      photon: photonAdapter,
      nominatim: nominatimAdapter,
      osrm: osrmAdapter,
    }),
    JobsModule,
    AuthModule,
    HealthModule,
    OpenApiModule,
    MeModule,
    UsersModule,
    TripsModule,
    DiscoveryModule,
    PlanModule,
    PlacesModule,
    RoutingModule,
    SuggestionsModule,
    ReviewsModule,
    ReportsModule,
    ModerationModule,
  ],
  // Global guards run in this order: CSRF → session (sets req.user, enforces
  // the endpoint's auth) → throttler (keyed by req.user). Then the contract
  // interceptor validates input and allowlists output.
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ContractInterceptor },
  ],
})
export class AppModule {}
