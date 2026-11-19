// Prints the ledger of deliberate shortcuts: every SHORTCUT marker in the
// repository's files (tracked or new, minus what .gitignore excludes). Markdown is
// skipped: SPEC.md and the README quote markers, they do not carry them.
// Exits 1 when a marker is not a `//` or `#` line comment that names an owner in
// parentheses, then what was simplified, its ceiling and its upgrade trigger
// (the form is in SPEC.md, section "Engineering rulebook").
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const MARKER = /SHORTCUT\(/;
const WELL_FORMED = /(?:\/\/|#) ?SHORTCUT\([^)]+\): \S.* — ceiling: \S.*; upgrade: \S/;

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--deduplicate'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\0')
  .filter((file) => file && !file.endsWith('.md'))
  .sort();

function readIfPresent(file) {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

const markers = files.flatMap((file) =>
  readIfPresent(file)
    .split('\n')
    .flatMap((line, index) =>
      MARKER.test(line) ? [{ where: `${file}:${index + 1}`, text: line.trim() }] : [],
    ),
);
const malformed = markers.filter((marker) => !WELL_FORMED.test(marker.text));

for (const marker of markers) {
  process.stdout.write(`${marker.where}\n  ${marker.text}\n`);
}
process.stdout.write(`\n${markers.length} shortcut marker(s).\n`);

if (malformed.length > 0) {
  process.stderr.write(
    `\n${malformed.length} marker(s) without owner, ceiling and upgrade trigger in a // or # line comment:\n`,
  );
  for (const marker of malformed) {
    process.stderr.write(`  ${marker.where}\n`);
  }
  process.exitCode = 1;
}
