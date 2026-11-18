# T17-providers progress
- [x] read SPEC §C, I.providers, I.test, V38-V44, reference/*.ts, T13/T14/T16 notes
- verified: Node 24.15 global fetch honours installed undici 7 MockAgent (disableNetConnect + enableNetConnect fn) -> lockdown via setupFiles works
- plan (files in apps/api/src/providers/{core,fake}):
  core/contract.ts (types, ProviderError, tokens GEOCODING_PROVIDER/ROUTING_PROVIDER/PLACE_LOOKUP)
  core/geo.ts (+test), core/categories.ts (+test), core/estimates.ts (+test)
  core/token-bucket.ts, core/circuit-breaker.ts, core/outbound.ts (+tests w/ stub server, FixedClock, seeded RNG)
  core/provider-cache.service.ts (+cache-keys), core/place-resolver.ts
  core/providers.module.ts (forRoot adapters registry; selection by env; missing adapter = boot error)
  fake/fake-geocoder.ts, fake/fake-router.ts (+tests)
  config/env.ts refine: fake+production refused unless ALLOW_FAKE_PROVIDERS
  test/support/network-lockdown.ts + vitest setupFiles
- decisions: PHOTON_INCLUDE left to T40 (photon vocabulary); place:v1 keys provider-neutral per table
- dev server running (other lane, tsc --watch): dev .env uses photon/osrm -> adapters missing until T40/T42
