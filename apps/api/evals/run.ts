// `pnpm --filter @heremita/api eval:suggestions [options]`
//
//   --generator=claude|fake|null   default claude (needs ANTHROPIC_API_KEY)
//   --geocoder=photon|fake         default photon with claude, fake otherwise
//   --no-judge                     skip the LLM judge (on by default with claude)
//   --reps=N                       attempts per case, default 1
//   --cases=id,id                  a subset of the golden set
//
// Spends money with --generator=claude: about US$ 0.01–0.03 per case and rep
// with the default model, plus the judge. Writes evals/reports/<run>/ and
// exits 1 when a metric misses its bar.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { SystemClock } from '../src/core/clock/system-clock.js';
import type { GeocodingProvider } from '../src/providers/core/contract.js';
import { OutboundClient } from '../src/providers/core/outbound.js';
import { FakeGeocoder } from '../src/providers/fake/fake-geocoder.js';
import { PhotonGeocoder } from '../src/providers/photon/photon.geocoder.js';
import { createClaudeIdeaGenerator } from '../src/suggestions/claude-idea-generator.js';
import { FakeIdeaGenerator } from '../src/suggestions/fake-idea-generator.js';
import type { IdeaGenerator } from '../src/suggestions/idea-generator.js';
import { GOLDEN_SET } from './golden-set.js';
import { judge } from './judge.js';
import { renderMarkdown } from './report.js';
import { runEvals } from './runner.js';

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/** Answers no ideas at all: the null baseline, which must fail. */
const nullGenerator: IdeaGenerator = {
  id: 'fake',
  generate: () => Promise.resolve({ ideas: [], model: 'null', usage: null }),
};

async function main(): Promise<void> {
  const generatorName = option('generator') ?? 'claude';
  const model = process.env['AI_MODEL'] ?? 'claude-opus-5-5';
  const judgeModel = process.env['EVAL_JUDGE_MODEL'] ?? model;
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
  if (generatorName === 'claude' && apiKey.trim() === '') {
    throw new Error('Set ANTHROPIC_API_KEY (apps/api/.env or the environment) to run with Claude');
  }
  const generator: IdeaGenerator =
    generatorName === 'claude'
      ? createClaudeIdeaGenerator(apiKey, model)
      : generatorName === 'null'
        ? nullGenerator
        : new FakeIdeaGenerator();

  const geocoderName = option('geocoder') ?? (generatorName === 'claude' ? 'photon' : 'fake');
  let geocoder: GeocodingProvider;
  if (geocoderName === 'photon') {
    const outbound = new OutboundClient({
      publicSiteUrl: process.env['PUBLIC_SITE_URL'] ?? 'http://localhost:3100',
      clock: new SystemClock(),
      logger: new Logger('eval'),
    });
    const noCache = {
      remember: <T>(_key: string, _schema: unknown, load: () => Promise<T>) => load(),
    };
    geocoder = new PhotonGeocoder({
      photonUrl: process.env['PHOTON_URL'] ?? 'https://photon.komoot.io',
      outbound,
      cache: noCache,
    });
  } else {
    geocoder = new FakeGeocoder();
  }

  const useJudge = generatorName === 'claude' && !process.argv.includes('--no-judge');
  const client = useJudge ? new Anthropic({ apiKey, maxRetries: 3 }) : null;
  const ids = option('cases')?.split(',');
  const cases = ids ? GOLDEN_SET.filter((evalCase) => ids.includes(evalCase.id)) : GOLDEN_SET;
  if (cases.length === 0) {
    throw new Error(`No golden case matches --cases=${ids?.join(',')}`);
  }

  const startedAt = new Date().toISOString();
  const report = await runEvals(
    { cases, reps: Number(option('reps') ?? 1), requestedModel: model },
    {
      generator,
      geocoder,
      judge: client ? (evalCase, items) => judge(client, judgeModel, evalCase, items) : null,
      now: () => performance.now(),
    },
  );

  const dir = path.join(
    import.meta.dirname,
    'reports',
    `${startedAt.replaceAll(':', '-').slice(0, 19)}-${generatorName}`,
  );
  mkdirSync(dir, { recursive: true });
  const jsonl = (items: readonly unknown[]) => items.map((item) => JSON.stringify(item)).join('\n');
  writeFileSync(path.join(dir, 'results.jsonl'), `${jsonl(report.rows)}\n`);
  writeFileSync(
    path.join(dir, 'errors.jsonl'),
    report.errors.length ? `${jsonl(report.errors)}\n` : '',
  );
  const summary = Object.fromEntries(
    Object.entries(report).filter(([key]) => key !== 'rows' && key !== 'errors'),
  );
  writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const markdown = renderMarkdown(report, startedAt);
  writeFileSync(path.join(dir, 'report.md'), markdown);

  process.stdout.write(markdown);
  process.stdout.write(`\nWritten to ${path.relative(process.cwd(), dir)}\n`);
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
