/**
 * Unit: the engine's ESM build names its chunks the same wherever the repo is checked out
 * (followups.d/2708-p1, now fixed). esbuild keys a module outside the `file` namespace by the path
 * text a plugin returned, and those keys feed every `chunk-[hash]` name; two plugins in
 * tools/build-playground.js returned absolute paths, so the chunk names, the engine's asset version
 * and every docs route that names it moved by a few bytes between two checkouts of one commit.
 * measure-route-base.sh builds the base in a temp worktree, so the route budget charged PRs for it.
 *
 * `assertCheckoutIndependent` runs on every build (the lint-entry plugin's onEnd hook). These cases
 * check that it refuses a leak, and that the shipped options really build with no leak (about 0.3s).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { ESM_OPTIONS, assertCheckoutIndependent } = require(path.join(ROOT, 'tools', 'build-playground.js'));

test('a plugin key that names the checkout fails the build', () => {
	const inputs = { 'lib/core/a.js': {}, [`lint-boundary-parser:${ROOT}/lib/core/boundary-parser.mjs`]: {} };
	assert.throws(() => assertCheckoutIndependent({ inputs }), /name the checkout/);
});

test('a checkout at a short path does not trip on ordinary keys', () => {
	// The first cut searched keys for ROOT's text, so a checkout at /src failed on docs/src/….
	const inputs = { 'docs/src/lib/a.js': {}, 'lib/components/code/x.js': {}, 'node_modules/mdurl/build/index.cjs.js': {} };
	assert.doesNotThrow(() => assertCheckoutIndependent({ inputs }));
});

test('repo-relative keys pass', () => {
	const inputs = { 'lib/core/a.js': {}, 'lint-boundary-parser:lib/core/boundary-parser.mjs': {}, 'lattice-lint:lint': {} };
	assert.doesNotThrow(() => assertCheckoutIndependent({ inputs }));
});

test('the shipped ESM build keys no module by an absolute path', async () => {
	// write:false still runs the onEnd hook, so a leak would reject here as well as in the assert below.
	const result = await esbuild.build({ ...ESM_OPTIONS, outdir: path.join(ROOT, '.scratch', 'esm-determinism'), write: false, logLevel: 'silent' });
	const keys = Object.keys(result.metafile.inputs);
	assert.ok(keys.some((k) => k.startsWith('lint-boundary-parser:')), 'the lint parser copy is missing, so this case stopped measuring a plugin namespace');
	assert.ok(keys.some((k) => k.startsWith('lazy-chart-registry:')), 'the lazy chart registry is missing, so this case stopped measuring a plugin namespace');
	assert.deepEqual(keys.filter((k) => path.isAbsolute(k.replace(/^[\w-]+:/, ''))), []);
});
