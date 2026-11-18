// Agentens väg till registret: läsa kön, sätta ett omdöme och svara på Jakobs ord.
//   npm run judge -- queue
//   npm run judge -- status <fil> <status> "<vem som dömde och varför>"
//   npm run judge -- reply <fil> "<svar>"
// Jakob själv dömer i Labbet. Reglerna för när en agent dömer står i AGENTS.md.

import { resolve } from 'node:path';
import { queue, RegistryError, setStatus, setWords, stamp } from './registry.ts';

const root = process.env.STUDIO_DATA ? resolve(process.env.STUDIO_DATA) : resolve(import.meta.dirname, '..', '..');
const [command, file, ...rest] = process.argv.slice(2);

try {
  if (command === 'queue') {
    const waiting = queue(root);
    console.log(`${waiting.length} i kö`);
    for (const entry of waiting) {
      console.log(`- ${entry.file} [${entry.status}]${entry.comment ? ` Jakob: ${entry.comment}` : ' (ingen motivering)'}`);
    }
  } else if (command === 'status' && file && rest.length === 2) {
    const entry = setStatus(root, file, rest[0]!, rest[1]!, stamp());
    console.log(`${entry.file}: ${entry.status} (${entry.statusBy})`);
  } else if (command === 'reply' && file && rest.length === 1) {
    const entry = setWords(root, file, 'reply', rest[0]!, stamp());
    console.log(`${entry.file}: svar ${entry.reply ? 'sparat' : 'borttaget'}`);
  } else {
    console.error('Använd: queue | status <fil> <status> "<vem och varför>" | reply <fil> "<svar>"');
    process.exitCode = 2;
  }
} catch (error) {
  if (!(error instanceof RegistryError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
