// One realm, one build: render every deck, let the lint narrow ITS boundary parser to math-off and
// lint every deck, then render again. Prints how many renders changed. Run as a child process by
// lint-engine-equivalence.test.js, once per build, because the engine registers itself on
// globalThis and two builds cannot share one realm. Argument: the build's esm/ directory.

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decks } from './decks.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const dir = process.argv[2];
globalThis.window = globalThis;
globalThis.self = globalThis;
await import(pathToFileURL(path.join(dir, 'engine.js')).href);
const PG = globalThis.LatticePlayground;
// Export to Marp's building blocks load on demand (lib/playground/index.js `loadMarp`).
const marp = PG.marp ?? (await PG.loadMarp());
const out = (src) => {
	try {
		const r = PG.render(src, 'indaco');
		return JSON.stringify([r.html, PG.splitForPreview(r.html, src, r.width, r.height, {}), marp.bakeSplits(src)]);
	} catch (e) {
		return `ERR ${e.message}`;
	}
};
const all = decks();
const before = all.map(([, s]) => out(s));
const lint = await import(pathToFileURL(path.join(dir, 'lint.js')).href);
const vocab = require(path.join(ROOT, 'lib/authoring/lint.js')).buildVocab();
lint.setBoundaryPluginsOff(['math']);
for (const [, s] of all) lint.lintCore.lintTextWith(s, vocab);
const after = all.map(([, s]) => out(s));
const changed = all.filter((_, i) => before[i] !== after[i]).map(([n]) => n);
process.stdout.write(`${JSON.stringify({ renders: all.length, errors: before.filter((x) => x.startsWith('ERR')).length, changed })}\n`);
