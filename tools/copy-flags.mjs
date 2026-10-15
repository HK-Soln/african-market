// Copies the country flag SVGs (country-flag-icons, 3:2) into a Next app's public/flags, where
// CountryFlag in @am/ui loads them from (/flags/AE.svg). Run by each app's dev and build scripts
// from the app's folder; the copies are git-ignored.
//
//   node ../../tools/copy-flags.mjs
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const source = join(dirname(require.resolve('country-flag-icons/package.json')), '3x2');
const target = join(process.cwd(), 'public', 'flags');

const flags = readdirSync(source).filter((file) => /^[A-Z]{2}\.svg$/.test(file));
mkdirSync(target, { recursive: true });
let copied = 0;
for (const file of flags) {
  const to = join(target, file);
  if (existsSync(to)) continue;
  cpSync(join(source, file), to);
  copied += 1;
}
if (copied > 0) console.log(`copy-flags: ${copied} flags into public/flags`);
