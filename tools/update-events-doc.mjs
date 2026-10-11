// Rewrites the generated list of events in docs/architecture/events.md from EVENT_CATALOG.
//
//   pnpm nx build @am/contracts && node tools/update-events-doc.mjs && pnpm format
//
// Run it after adding or changing an event. `libs/contracts/src/events.spec.ts` fails until the
// file matches the catalogue.
import { closeSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderEventCatalog } = createRequire(import.meta.url)(
  join(root, 'libs', 'contracts', 'dist', 'index.js'),
);

const START = '<!-- events:start (generated from EVENT_CATALOG) -->';
const END = '<!-- events:end -->';

// One open file for the read and the write, so nothing can swap it in between.
const file = openSync(join(root, 'docs', 'architecture', 'events.md'), 'r+');
try {
  const current = readFileSync(file, 'utf8');
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if (start < 0 || end < start) throw new Error('events.md has lost its generated-section markers');
  const updated = `${current.slice(0, start + START.length)}\n\n${renderEventCatalog()}\n\n${current.slice(end)}`;
  ftruncateSync(file, 0);
  writeSync(file, updated, 0, 'utf8');
} finally {
  closeSync(file);
}
console.log('docs/architecture/events.md updated');
