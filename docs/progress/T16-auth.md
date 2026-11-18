# T16-auth progress
- [x] read spec (§C, E4-E8, V30-V34, mechanics Sessions/Login) + T14/T15 notes + code
- plan: apps/api/src/auth/{auth.module,auth.controller,auth.service,session.service,session.guard,session-cookie(+test),login-attempts(+test),me.mapper}.ts; core/jobs/{purge.job,jobs.module}.ts; register AuthModule+JobsModule+SessionGuard(APP_GUARD between Csrf and Throttler) in app.module; route-table PENDING drop signUp..getMe; tests test/auth/*.test.ts
- next: write code
- [x] code written: src/auth/{session-cookie,session-cookies,session.service,session.guard,login-attempts,me.mapper,auth.service,auth.controller,auth.module}.ts, src/core/jobs/{purge.job,jobs.module}.ts; app.module registers JobsModule+AuthModule+SessionGuard (useExisting); route-table PENDING minus E4-E8. typecheck green; unit tests (16) green
- next: integration tests test/auth/{auth,sessions,purge-job}.test.ts (distinct X-Forwarded-For per test to dodge signup/auth throttles)
- [x] integration tests test/auth/{auth,sessions,session-guard,purge-job}.test.ts + helper auth-app.ts; api typecheck/lint/test (26 files, 222 tests)/build green; smoke via running dev server on 3101 (another lane's `pnpm dev`, serving the fresh dist): login 201+cookie, /me 200, logout 204+clear, /me 401
- [x] T16 DONE: SPEC x + ID-T16 deviation line
