# T8-deps progress
- [x] baseline checks green (typecheck/lint/test)
- [x] registry: peers/dates checked (t8-view.txt)
- [x] install done: added deps; undici ^7.30.2 (matches Node 24 bundled undici 7.24.4); msw 3.0.6 exact; pg/@types/pg moved to catalog + web devDeps (T23 globalSetup); server-only (TS6 noUncheckedSideEffectImports); @dnd-kit/utilities (direct import of CSS util); allowBuilds @swc/core,@parcel/watcher=false
- [x] config done: next.config false/false, web tsconfig geojson, eslint no-console (+instrumentation allow error), web use-server ban + react/no-danger, api new Date() ban except system-clock; console.* in init-env, seed, main.ts → process.stdout/stderr.write; rules probed with temp files (removed)
- [x] typecheck/lint/test/build green (logs t8-*.txt); prettier check of touched files ok; frozen install ok
- [x] SPEC T8 → x, ID-T8 deviation line added. DONE.
