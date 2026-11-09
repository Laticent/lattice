// Write a localStorage seed of N saved Studio decks, for `SEED=` in react-mount-profile.mjs (and any bench that
// takes the same { key: string } map). A cold browser context has no saved decks, so a profile without a seed is a
// first visit; this one is a returning author. Each deck is one of the repo's example decks, largest first, stored
// as the Studio stores an edited deck: an index row plus its source under the source prefix (studio-store.ts).
//
// Usage (from docs/):  node scripts/seed-saved-decks.mjs [count=16] > /tmp/seed.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX_KEY = 'lattice-studio-deck-index';
const SRC_PREFIX = 'lattice-studio-src-';
const count = Number(process.argv[2] || 16);
const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../examples');
const decks = fs
	.readdirSync(examples)
	.filter((f) => f.endsWith('.md'))
	.map((f) => ({ f, size: fs.statSync(path.join(examples, f)).size }))
	.sort((a, b) => b.size - a.size || a.f.localeCompare(b.f))
	.slice(0, count);
const index = decks.map(({ f }) => ({ id: `seed-${f.replace(/\.md$/, '')}`, title: f.replace(/\.md$/, ''), builtin: false }));
const seed = { [INDEX_KEY]: JSON.stringify(index) };
for (const [i, { f }] of decks.entries()) seed[SRC_PREFIX + index[i].id] = JSON.stringify(fs.readFileSync(path.join(examples, f), 'utf8'));
process.stdout.write(`${JSON.stringify(seed)}\n`);
