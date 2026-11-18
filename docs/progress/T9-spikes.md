# T9-spikes progress
- plan: spike app at heremita/spikes/web (node_modules symlink → apps/web/node_modules), throwaway; delete at end, copy to scratchpad impl/t9-spike-web
- [ ] b dnd-kit  [ ] c downshift  [ ] d next-intl+nuqs+root-params build+dev  [ ] e route groups  [ ] a zod-openapi
- prod build (next build + start 3110): 19 tests x5 green, mobile+desktop chromium. Findings: nuqs URL write async (wait URL before Back); dnd-kit KeyboardSensor drops a key pressed within ms of pickup (setTimeout listener) → e2e retry step; next-intl timeZone defaults to server TZ (Europe/Madrid) → T19 set timeZone 'UTC'.
- next: dev run (StrictMode only active in dev) on 3100
- [x] b c d e done (dev+prod green, x3/x5). spike copy at impl/t9-spike-web. useId on DndContext needed (SSR id mismatch). next: (a)
- [x] a done: zod-openapi valid 3.1 (inline reuse). spikes dir removed; copies in impl/t9-spike-*. next: amend SPEC §C + T9 x
- [x] SPEC §C Spike outcomes + T9 x. DONE
