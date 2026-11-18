# Next steps: how to resume the build

The plan lives in the repository, not in any chat:

- `SPEC.md`: the source of truth. Section §T is the task table; the status column says
  what is done (`x`), in progress (`~`) or still to do (`.`).
- `docs/design/`: long-form design and research behind the spec (architecture, UX,
  security, providers, MapLibre, the engineering rulebook).
- `docs/progress/`: one note per task group, written by whoever worked on it: what was
  done, what is next, problems found. A note without "done" means the work was
  interrupted; read it before continuing that task.

## To resume in a new Claude Code chat

Open Claude Code in `~/Desktop/DEV/heremita` (not in another project's folder) and say:

> Continue building Heremita from SPEC.md. Read docs/NEXT-STEPS.md, the §T table and
> docs/progress/, then carry on with the next stage. Use multi-agent workflows.

## Stages

1. **Foundation, part 1** (started 2026-11-18): T8 dependencies; API lane T10–T13
   (shared contract, OpenAPI, Prisma schema, seed); web lane T9 spikes and T19 web shell.
2. **Foundation, part 2**: API lane T14–T18 (API core, auth, providers, test harness);
   web lane T21, T20, T22, T23 (base components, data layer, auth UI, walking-skeleton
   e2e). Run the two lanes in parallel; then one full verification pass (install,
   typecheck, lint, format, test, build, e2e, security spot-check).
3. **Workstreams** (T30–T67, parallel): each `[ws:*]` owns only the directories named in
   its first §T row. API: account, trips, plan, geo, routing, community. Web: UI
   components, map, trips, planner, places, settings. No package installs inside a
   workstream.
4. **Integration** (T70–T77): about/privacy pages, authorisation matrix complete, the
   e2e journeys, accessibility and mobile pass, docs, real-provider check.

## Clean-up when done

Everything in `docs/progress/`, `docs/design/`, `spikes/` and this file is temporary.
Delete each piece as soon as the work it tracks is finished (task T78 in `SPEC.md` does
the final sweep). Durable knowledge belongs in `SPEC.md`, the README, the code and the
tests.

## Rules that are easy to forget

- Ports: web 3100, api 3101, e2e 3110/3111, Postgres 5434 (`pnpm db:up`). Never 3000 or
  5433: they belong to other local projects.
- `pnpm db:reset` must be run by a person: Prisma blocks it for AI agents.
- No commits until a personal git identity is set in this repository:
  `git config user.name "…"` and `git config user.email "…"`.
- This project has no link to any employer: no code, config, accounts or names from
  other projects.
