# T23-web-harness progress
- [x] T16 done (per T16-auth.md); read SPEC §C, I.test, V30/54/60/72
- [x] unit harness: apps/web/test/msw/handlers.ts (onEndpoint/okResponse/problemResponse/respondWith/failWith/networkErrorOn/buildMe/setupApiServer), test/render.tsx renderWithProviders, test/harness.test.tsx (8 green), src/test-utils/render.tsx exports TestIntlProvider; vitest include test/**
- decisions: Playwright starts webServer BEFORE globalSetup (runner/index.js createGlobalSetupTasks) -> DB prep script runs first in api webServer command (deviation). distDir .next-e2e for e2e build (avoid clobbering .next of other lanes). webkit project only via e2e:webkit. signup throttle 5/h/IP -> unique X-Forwarded-For per test context.
- next: playwright config + e2e/{prepare-database,fixtures,walking-skeleton}.ts, public/dev/blank-style.json
