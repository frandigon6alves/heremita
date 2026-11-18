# T14-T15-api-core progress
- [ ] T14 started (read spec + code)
- plan: core code in apps/api/src/core/{http,logging,clock,password,ids}, cursor.ts, trip-access.service.ts, rating-summary.reader.ts, block-filter.ts; E3 in src/openapi; feature modules empty src/<m>/<m>.module.ts; route-table test test/route-table.test.ts
- decisions: blocklist as .ts module (asset copy problem with tsc dev build) -> ID-T15 deviation; test env silent logger unless params overridden; providers env vars: vitest.config sets fake
- [x] env + .env.example (+ appended missing keys to local apps/api/.env), vitest env forces fake providers
- [x] core/http: api-problem, api-request, endpoint.decorator, throttles, app-throttler.guard, csrf(+guard), contract(+interceptor), input/current-user decorators, problem-details.filter (src/http removed); core/prisma-errors; core/ids/uuidv7; core/logging/logger-params; openapi module (E3); health uses @Endpoint; 10 empty feature modules; app.module + app.setup + main updated; tsc green
- next: tests (test/http-pipeline.test.ts, test/route-table.test.ts, unit tests csrf/contract/logger), then T15
- [x] T14 DONE (SPEC x + ID-T14). tests: unit csrf/contract/endpoint/throttler/logger/uuidv7, integration http-pipeline, logging, route-table (PENDING_ENDPOINTS = 48), health updated. tsc+eslint+vitest green; nest build + boot on 3101 checked, server stopped.
- [ ] T15 next: clock, cursor, trip-access, rating-summary, block-filter, password (+ blocklist), unit+integration tests
- [x] T15 DONE (SPEC x + ID-T15): core/clock/{clock,system-clock,fixed-clock}, core/cursor, core/trip-access(+service), core/block-filter, core/rating-summary.reader, core/password/{passwords,common-passwords}; CoreModule provides CLOCK/TripAccessService/RatingSummaryReader; seed uses password module. Tests unit + test/core/core-services.test.ts. api test 153/153, typecheck, lint, build green; shared 177/177.
