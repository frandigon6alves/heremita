# T12-T13-prisma-seed — DONE (T12 x, T13 x in SPEC; ID-T12, ID-T13 lines in §C deviations)
- schema: apps/api/prisma/schema.prisma (§I.data); migration 20261118160412_v1_model (+ hand CHECKs/unaccent); dev DB migrated + seeded (6 users, 58 places, 10 trips, 91 trip places, 24 days, 86 stops, 90 reviews, 3 reports)
- tests: test/migration.test.ts (21), test/seed.test.ts (11), src/providers/fake/gazetteer.test.ts (4); api vitest 45/45 green; lint green
- typecheck/build red ONLY on pre-existing src/http/problem-details.filter.ts `code` (T14)
- seed exports (prisma/seed-database.ts): seedDatabase(prisma, env), SeedRefusedError, DEMO_USER, SEED_USERS, LISBON_TRIP_ID, seedShareToken, GAZETTEER_KEYS
- argon2 params duplicated in prisma/seed/seed-demo.ts ARGON2_OPTIONS until T15 password module exports them
