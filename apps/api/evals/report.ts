import { THRESHOLDS, type MetricName, type Stat } from './scorers.js';
import type { EvalReport } from './runner.js';

const LABELS: Record<MetricName, string> = {
  groundedRate: 'Ideas grounded in a real place nearby',
  noMatchRate: 'Ideas no real place matched (hallucination proxy)',
  countMet: 'Cases that got the places asked for',
  categoryMatch: 'Places of an expected category',
  tripRepeatRate: 'Ideas repeating a place already in the trip',
  refusalRate: 'Refusals',
  fitsRequest: 'Judge: place fits the request',
  reasonInLanguage: 'Judge: reason in the right language',
  reasonAccurate: 'Judge: reason true of the place',
};

const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

function bar(metric: MetricName): string {
  const { min, max } = THRESHOLDS[metric] as { min?: number; max?: number };
  return min === undefined ? `≤ ${percent(max ?? 0)}` : `≥ ${percent(min)}`;
}

function cell(value: Stat | undefined): string {
  if (!value || value.n === 0) {
    return 'n/a';
  }
  return value.ci95 > 0 ? `${percent(value.mean)} ± ${percent(value.ci95)}` : percent(value.mean);
}

export function renderMarkdown(report: EvalReport, startedAt: string): string {
  const lines = [
    `# Place suggestions eval — ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    `- Run: ${startedAt} · golden set ${report.goldenSetVersion} · generator \`${report.generator}\` · model \`${report.requestedModel}\``,
    `- Attempts: ${report.rows.length + report.errors.length} scored ${report.rows.length}, errors ${report.errors.length}` +
      (report.servedByOtherModel > 0
        ? ` · ${report.servedByOtherModel} answered by a fallback model`
        : ''),
    `- Model latency: ${report.latencyMs ? `p50 ${(report.latencyMs.p50 / 1000).toFixed(1)} s, p95 ${(report.latencyMs.p95 / 1000).toFixed(1)} s` : 'n/a'}`,
    `- Tokens: ${report.totals.inputTokens} in / ${report.totals.outputTokens} out · cost US$ ${report.totals.costUsd.toFixed(4)} (judge US$ ${report.totals.judgeCostUsd.toFixed(4)})`,
    '',
    '| Metric | Value | Bar | |',
    '| --- | --- | --- | --- |',
    ...(Object.keys(LABELS) as MetricName[])
      .filter((name) => report.metrics[name] !== undefined)
      .map(
        (name) =>
          `| ${LABELS[name]} | ${cell(report.metrics[name])} | ${bar(name)} | ${report.failing.includes(name) ? '✗' : '✓'} |`,
      ),
    '',
    `Idea outcomes: ${
      Object.entries(report.outcomes)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([outcome, count]) => `${outcome} ${count}`)
        .join(' · ') || 'none'
    }`,
    '',
    '## Cases',
    '',
    '| Case | Rep | Grounded | No match | Category | Judge fit | Places |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.rows.map((row) => {
      const s = row.scores;
      const fit = row.judge?.scores ? percent(row.judge.scores.fitsRequest) : '–';
      const places = row.run.items.map((item) => item.name).join(', ') || '–';
      return s
        ? `| ${row.run.caseId} | ${row.run.rep} | ${percent(s.groundedRate)} | ${percent(s.noMatchRate)} | ${s.categoryMatch === null ? '–' : percent(s.categoryMatch)} | ${fit} | ${places} |`
        : `| ${row.run.caseId} | ${row.run.rep} | refused | | | | |`;
    }),
  ];
  if (report.errors.length > 0) {
    lines.push(
      '',
      '## Errors (not scored)',
      '',
      ...report.errors.map(
        (error) =>
          `- ${error.caseId} rep ${error.rep}: ${error.stage} ${error.kind} — ${error.message}`,
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}
