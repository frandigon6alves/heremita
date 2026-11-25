// Prints the first-load JavaScript (gzip) of every route of the last production
// build next to its budget in SPEC.md, section "I.web.budget". A warning, never a
// gate: it always exits 0. Run `pnpm build` first, then `pnpm budget`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const BYTES_PER_KB = 1000;
const PUBLIC_PAGE_BUDGET_KB = 180;
const PLANNER_BUDGET_KB = 240;
const PLANNER_ROUTE = '/[locale]/trips/[tripId]';

export interface Budget {
  limitKb: number;
  label: string;
}

export interface RouteSize {
  route: string;
  gzipBytes: number;
}

export interface RouteReport extends RouteSize {
  budget: Budget;
  over: boolean;
}

/** Pages without a number of their own are held to the public-page budget. */
export function budgetFor(route: string): Budget {
  if (route === PLANNER_ROUTE) {
    return { limitKb: PLANNER_BUDGET_KB, label: 'planner, before map chunk' };
  }
  return { limitKb: PUBLIC_PAGE_BUDGET_KB, label: 'page' };
}

/** The chunks a first visit loads: the shared runtime plus every client entry of the route. */
export function firstLoadFiles(
  rootMainFiles: readonly string[],
  entryJSFiles: Readonly<Record<string, readonly string[]>>,
): string[] {
  return [...new Set([...rootMainFiles, ...Object.values(entryJSFiles).flat()])].sort();
}

export function toKb(bytes: number): number {
  return bytes / BYTES_PER_KB;
}

export function evaluate(sizes: readonly RouteSize[]): RouteReport[] {
  return sizes
    .map((size) => {
      const budget = budgetFor(size.route);
      return { ...size, budget, over: toKb(size.gzipBytes) > budget.limitKb };
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.route.localeCompare(b.route));
}

export function formatReport(reports: readonly RouteReport[]): string {
  const routeWidth = Math.max('Route'.length, ...reports.map((report) => report.route.length));
  const line = (route: string, size: string, budget: string, status: string) =>
    `${route.padEnd(routeWidth)}  ${size.padStart(9)}  ${budget.padStart(8)}  ${status}`;
  const rows = reports.map((report) =>
    line(
      report.route,
      `${toKb(report.gzipBytes).toFixed(1)} KB`,
      `${report.budget.limitKb} KB`,
      `${report.over ? 'WARNING over' : 'ok'} (${report.budget.label})`,
    ),
  );
  const overCount = reports.filter((report) => report.over).length;
  const summary =
    overCount === 0
      ? 'Every route is within its first-load JS budget.'
      : `WARNING: ${overCount} of ${reports.length} route(s) over their first-load JS budget (gzip, 1 KB = ${BYTES_PER_KB} bytes).`;
  return [line('Route', 'JS gzip', 'Budget', 'Status'), ...rows, '', summary, ''].join('\n');
}

interface ClientReferenceManifest {
  entryJSFiles: Record<string, string[]>;
}

function readClientManifest(buildDir: string, entry: string): ClientReferenceManifest {
  const file = path.join(buildDir, 'server', 'app', `${entry}_client-reference-manifest.js`);
  const sandbox: { __RSC_MANIFEST?: Record<string, ClientReferenceManifest> } = {};
  runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const manifest = sandbox.__RSC_MANIFEST?.[entry];
  if (!manifest) {
    throw new Error(`${file} has no client manifest for ${entry}.`);
  }
  return manifest;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function measure(buildDir: string): RouteSize[] {
  const { rootMainFiles } = readJson<{ rootMainFiles: string[] }>(
    path.join(buildDir, 'build-manifest.json'),
  );
  const routes = readJson<Record<string, string>>(
    path.join(buildDir, 'app-path-routes-manifest.json'),
  );
  const gzipped = new Map<string, number>();
  const gzipSize = (file: string) => {
    const known = gzipped.get(file);
    if (known !== undefined) {
      return known;
    }
    const size = gzipSync(readFileSync(path.join(buildDir, file))).length;
    gzipped.set(file, size);
    return size;
  };

  return (
    Object.entries(routes)
      // Internal routes and route handlers (the app icons, the manifest) ship no page JS.
      .filter(([entry, route]) => !route.startsWith('/_') && !entry.endsWith('/route'))
      .map(([entry, route]) => ({
        route,
        gzipBytes: firstLoadFiles(rootMainFiles, readClientManifest(buildDir, entry).entryJSFiles)
          .map(gzipSize)
          .reduce((total, size) => total + size, 0),
      }))
  );
}

function main() {
  const buildDir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '.next'));
  if (!existsSync(path.join(buildDir, 'app-path-routes-manifest.json'))) {
    process.stdout.write(`No production build in ${buildDir}: run \`pnpm build\` first.\n`);
    return;
  }
  try {
    process.stdout.write(formatReport(evaluate(measure(buildDir))));
  } catch (error) {
    process.stdout.write(`WARNING: could not measure ${buildDir}: ${String(error)}\n`);
  }
}

if (import.meta.main) {
  main();
}
