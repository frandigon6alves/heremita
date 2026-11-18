# T20-web-data progress
- [x] read SPEC (§C, I.web.*, V53/63/65/66), T10/T19/T21 notes
- [x] lib/api/problem.ts (ApiProblemError getters + requestId/retryAfter, HttpError, isUnauthenticated), request.ts (endpointPath + typed RequestArgs), client.ts apiFetch, server.ts (serverFetch + getViewer), query-keys.ts (all keys + factories), query-client.ts 401 handler (navigation arg), routes.ts isPublicPath/loginRedirectFor — tsc green
- [x] use-online, OfflineStatus (layout), providers navigation, layout data-theme, lib/format/*, all tests written + green per file
- [x] DONE: web typecheck+lint green, test 286 green, build green, prettier clean; SPEC T20 x + ID-T20 line
Notes: web has no zod import → types derived via typeof schema.options. viewer seed into ['viewer'] left to T22 (viewer hooks).
