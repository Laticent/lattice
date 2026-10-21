/**
 * The Studio's glyph subsetter is assembled from TWO installs, and they must agree.
 *
 * `tools/build-player-prune.js` bundles `subset-font` and HarfBuzz's JavaScript glue from the ROOT
 * `node_modules`; the Studio fetches HarfBuzz's wasm through Vite (`harfbuzzjs/hb-subset.wasm?url`
 * in docs/src/components/studio/player-prune-browser.ts), which resolves from the DOCS
 * `node_modules`, pinned by a separate lockfile. The CLI uses the root copy of both. If the two
 * lockfiles drift to different HarfBuzz releases, the Studio subsets with another build than the
 * CLI and its exports stop matching the CLI's bytes, while the host-parity test (which serves the
 * root wasm) stays green. Found by the checker on the host-parity PR
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §11).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const harfbuzzIn = (lock) => JSON.parse(fs.readFileSync(path.join(ROOT, lock), 'utf8')).packages?.['node_modules/harfbuzzjs']?.version;

test('the root and docs lockfiles pin the same harfbuzzjs, so both hosts subset with one HarfBuzz', () => {
	const root = harfbuzzIn('package-lock.json');
	const docs = harfbuzzIn('docs/package-lock.json');
	assert.ok(root, 'the root lockfile pins harfbuzzjs (the CLI subsetter and the bundled glue)');
	assert.ok(docs, 'the docs lockfile pins harfbuzzjs (the wasm the Studio fetches)');
	assert.equal(docs, root, `docs pins harfbuzzjs ${docs}, root pins ${root}: bump them together`);
});
