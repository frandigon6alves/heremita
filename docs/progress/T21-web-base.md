# T21-web-base progress
- Lucide SVGs (lucide-static 0.460.0, ISC) downloaded to impl/t21-lucide/ for icon paths.
- Plan: icons (shared/icons/icons.tsx + LICENSE), components: button, icon-button, link-button, field, text-field, text-area, password-field, dialog, toast (tests+Retry/Change), skeleton, empty-state, error-state, spinner, status-line, visually-hidden, app-bar (test), offline-banner (presentational; use-online = T20).
Status:
- [x] icons written
- [x] button, icon-button, link-button, visually-hidden, spinner
- [x] field, text-field, text-area, password-field (needs common.password.{show,showLabel})
- [x] dialog + confirm-dialog
- [x] skeleton, empty-state, error-state, status-line, offline-banner(presentational, prop online)
- [x] test-utils/render.tsx, vitest.setup dialog polyfill, field+dialog tests written (not run yet)
- [x] all tests written; shared suite 137 green. next: typecheck/lint/prettier/full test/build
- [x] DONE: SPEC T21 x + ID-T21 line; web typecheck/lint/test(185)/build green; prettier clean on touched files
