import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Leg, LngLat, TravelMode } from '@heremita/shared';
import { CACHE_TTL_MS, cacheKeys, cachedLegSchema } from '../providers/core/cache-keys.js';
import {
  ProviderError,
  ROUTING_PROVIDER,
  type RouteResult,
  type RoutingProvider,
} from '../providers/core/contract.js';
import { estimateLeg } from '../providers/core/estimates.js';
import { ProviderCacheService, type CacheEntry } from '../providers/core/provider-cache.service.js';

/** One leg to route: from a stop to the next, in its effective mode. */
export interface PlannedLeg {
  fromStopId: string;
  toStopId: string;
  mode: TravelMode;
  from: LngLat;
  to: LngLat;
}

/** Consecutive uncached legs of one mode: one provider call. */
interface Run {
  mode: TravelMode;
  /** Indexes into the planned legs, consecutive. */
  legs: number[];
}

/**
 * Legs of a day in order (§I.providers "Day route algorithm"): cached legs from
 * one cache read; misses grouped into same-mode runs, one provider call each;
 * routed legs cached after the provider answered; anything else a straight-line
 * estimate. Without `upstream` (anonymous viewers) misses are estimates at once.
 */
@Injectable()
export class LegRouter {
  private readonly logger = new Logger(LegRouter.name);

  constructor(
    @Inject(ROUTING_PROVIDER) private readonly router: RoutingProvider,
    private readonly cache: ProviderCacheService,
  ) {}

  async route(planned: readonly PlannedLeg[], options: { upstream: boolean }): Promise<Leg[]> {
    const keys = planned.map((leg) => cacheKeys.leg(this.router.id, leg.mode, leg.from, leg.to));
    const cached = await this.cache.getMany(keys, cachedLegSchema);
    const legs: (Leg | undefined)[] = planned.map((leg, i) => {
      const hit = cached.get(keys[i]!);
      return (
        hit && {
          ...ends(leg),
          distanceMeters: hit.distanceMeters,
          durationSeconds: hit.durationSeconds,
          polyline: hit.polyline,
          estimated: false,
          provider: this.router.id,
          unroutable: false,
        }
      );
    });
    const runs = options.upstream ? this.runsOfMisses(planned, legs) : [];
    const results = await Promise.allSettled(runs.map((run) => this.routeRun(planned, run)));
    const fresh: CacheEntry[] = [];
    results.forEach((result, r) => {
      const run = runs[r]!;
      if (result.status === 'rejected') {
        this.logFailure(result.reason);
        const badStop =
          result.reason instanceof ProviderError ? result.reason.stopIndex : undefined;
        run.legs.forEach((index, k) => {
          legs[index] = estimated(planned[index]!, badStop === k || badStop === k + 1);
        });
        return;
      }
      const route = result.value;
      run.legs.forEach((index, k) => {
        const leg = planned[index]!;
        const routed = route.legs[k]!;
        const from = route.snapped[k]!;
        const to = route.snapped[k + 1]!;
        if (routed.estimated) {
          legs[index] = estimated(leg, !from.routable || !to.routable);
          return;
        }
        legs[index] = {
          ...ends(leg),
          distanceMeters: routed.distanceMeters,
          durationSeconds: routed.durationSeconds,
          polyline: routed.polyline,
          estimated: false,
          provider: route.provider,
          unroutable: false,
        };
        fresh.push({
          key: keys[index]!,
          value: {
            distanceMeters: routed.distanceMeters,
            durationSeconds: routed.durationSeconds,
            polyline: routed.polyline,
            snapped: [from, to],
          },
          ttlMs: CACHE_TTL_MS.leg,
        });
      });
    });
    await this.cache.setMany(fresh);
    return planned.map((leg, i) => legs[i] ?? estimated(leg, false));
  }

  /** Maximal runs of consecutive uncached legs sharing a mode, cut at the provider's stop limit. */
  private runsOfMisses(planned: readonly PlannedLeg[], legs: readonly (Leg | undefined)[]): Run[] {
    const maxLegs = this.router.capabilities.maxStops - 1;
    const runs: Run[] = [];
    for (const [index, leg] of planned.entries()) {
      if (legs[index]) {
        continue;
      }
      const current = runs.at(-1);
      if (
        current?.mode === leg.mode &&
        current.legs.at(-1) === index - 1 &&
        current.legs.length < maxLegs
      ) {
        current.legs.push(index);
      } else {
        runs.push({ mode: leg.mode, legs: [index] });
      }
    }
    return runs;
  }

  private routeRun(planned: readonly PlannedLeg[], run: Run): Promise<RouteResult> {
    const first = planned[run.legs[0]!]!;
    const stops = [first.from, ...run.legs.map((index) => planned[index]!.to)];
    return this.router.route({ mode: run.mode, stops });
  }

  private logFailure(reason: unknown): void {
    if (reason instanceof ProviderError) {
      this.logger.warn(`Route legs estimated: ${reason.provider} failed (${reason.kind})`);
      return;
    }
    throw reason;
  }
}

function ends(leg: PlannedLeg): Pick<Leg, 'fromStopId' | 'toStopId' | 'mode'> {
  return { fromStopId: leg.fromStopId, toStopId: leg.toStopId, mode: leg.mode };
}

function estimated(leg: PlannedLeg, unroutable: boolean): Leg {
  return {
    ...ends(leg),
    ...estimateLeg(leg.mode, leg.from, leg.to),
    provider: 'estimate',
    unroutable,
  };
}
