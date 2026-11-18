// Creates each workspace's .env from its .env.example. An existing .env is never
// overwritten, so local edits survive a second run.
import { constants, copyFileSync, globSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const examples = globSync('{apps,packages}/*/.env.example', { cwd: root }).sort();

for (const example of examples) {
  const target = path.join(path.dirname(example), '.env');
  try {
    copyFileSync(path.join(root, example), path.join(root, target), constants.COPYFILE_EXCL);
    process.stdout.write(`created ${target} from ${example}\n`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    process.stdout.write(`kept    ${target} (already exists)\n`);
  }
}
