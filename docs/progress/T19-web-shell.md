# T19-web-shell progress
Decisions:
- web has no direct `zod` dep (pnpm strict) → env validation hand-written (env.schema.ts), next-path check plain fn in lib/routes.ts; report missing dep zod.
- getViewer = T20 → layout data-theme from viewer wired via prop seam; T20 must call getViewer in layout. Deviation line ID-T19.
- app bar generic in shared/components/app-bar; SiteHeader/SiteFooter + LanguageSwitcher in app/[locale]/_components.
- [locale]/[...rest]/page.tsx → notFound() for unmatched localized URLs.
Status:
- [ ] files written  [ ] tests  [ ] typecheck/lint/test/build  [ ] browser CSP check  [ ] SPEC x
- [x] files written, unit tests 104 green, typecheck+lint green. next: build + browser CSP check
- [x] build ok; prod+dev browser probe: CSP clean (after dev style-src fix + zod jitless via instrumentation-client), theme script ok, lang switch ok. 404s are client-rendered by Next 16 (error shell) -> theme script not run on 404. next: full checks, prettier, SPEC
- [x] DONE: SPEC T19 x + ID-T19 line. checks green (web typecheck/lint/test 106/build, prettier).
