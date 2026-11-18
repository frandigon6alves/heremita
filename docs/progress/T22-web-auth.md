# T22-web-auth progress
T16 not done at start -> build vs contract + MSW.
Plan/decisions:
- proxy sets REQUEST_PATH_HEADER (x-heremita-path, const in lib/routes.ts) -> ViewerGate in (app)/layout builds login?next= (layouts cannot read pathname). Deviation ID-T22.
- SiteHeader reads getViewer itself (no prop), shows AccountMenu (popover=auto: name, Settings link, LogoutButton) from features/auth. not-found.tsx updated.
- forms: RHF mode onTouched + zodResolver(shared schema); server errors via pure serverFormError(); success setQueryData viewer + router.replace(next) + router.refresh().
- logout: apiFetch logOut (401 = ok) -> queryClient.clear + router.replace(landing) + refresh; failure toast.
- ViewerGate seeds ['viewer'] via HydrationBoundary.
Status:
- [x] read spec + deps
- [x] code written: features/auth/{server-form-error,form-alert,use-signed-in,signup-form,login-form,logout-button,account-menu,gate-redirect,viewer-gate}, (auth)/{layout,auth-page,login,signup}, (app)/layout, site-header (getViewer itself), not-found, routes safeNext+REQUEST_PATH_HEADER, proxy header. next: typecheck, tests
- [x] tests written + green (features/auth 44, routes safeNext). next: full typecheck/lint/test/build, browser check, prettier, SPEC
