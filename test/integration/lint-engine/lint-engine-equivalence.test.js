/**
 * Integration (nightly): the lint core and the engine share one ESM build, and stay apart where it
 * matters. engineering/decisions/2026-10-14-engine-spine.md §10.
 *
 * The docs site loads the lint core as `esm/lint.js`, an entry of the engine's own esbuild build
 * (tools/build-playground.js), so the two share every chunk but one: the lint gets its own module
 * instance of lib/core/boundary-parser.mjs, because it narrows that parser per deck to the deck's
 * plugin admission. `assertLintParserIsolated` pins the module GRAPH at build time. These two checks
 * pin the BEHAVIOR, so a new shared singleton that the graph check cannot see still fails here:
 *
 *   1. PARITY. The browser lint (`esm/lint.js`) and the Node source (lib/authoring/*) give the same
 *      lint findings, review, scorecard and notes for every deck and a perturbed copy of each, with
 *      the default admission and with math off.
 *   2. ISOLATION. In one realm, narrowing the lint's parser leaves every engine render, preview
 *      split and Marp bake as it was. A CONTROL build whose lint shares the engine's parser must
 *      change at least one deck, or this check has stopped measuring anything.
 *
 * Each check builds its own engine into a temporary directory, so it needs no earlier build.
 * Nightly only (`test:integration:nightly`): it renders every deck several times, which is minutes
 * of work for a defect a build-time assert already makes unlikely.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { ESM_OPTIONS } = require(path.join(ROOT, 'tools', 'build-playground.js'));
const { ENTRY_CONTENTS, SRC_DIR } = require(path.join(ROOT, 'tools', 'build-authoring-core.js'));

/** The shipped lint entry minus its own parser: the shape §9 rejected, kept as a control. */
const sharedParserLintEntry = {
	name: 'lint-entry-shared-parser',
	setup(build) {
		build.onResolve({ filter: /^lattice-lint$/ }, () => ({ path: 'lint', namespace: 'lattice-lint' }));
		build.onLoad({ filter: /.*/, namespace: 'lattice-lint' }, () => ({ contents: ENTRY_CONTENTS, resolveDir: SRC_DIR, loader: 'js' }));
	},
};

let tmp;
let shipped;
let control;

before(async () => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-engine-'));
	shipped = path.join(tmp, 'shipped');
	control = path.join(tmp, 'control');
	// The shipped options run assertLintParserIsolated on every build (its onEnd hook).
	await esbuild.build({ ...ESM_OPTIONS, outdir: shipped, logLevel: 'silent' });
	const plugins = ESM_OPTIONS.plugins.map((p) => (p.name === 'lint-entry' ? sharedParserLintEntry : p));
	assert.equal(plugins.filter((p) => p === sharedParserLintEntry).length, 1, 'the control build found no lint-entry plugin to replace');
	await esbuild.build({ ...ESM_OPTIONS, plugins, outdir: control, logLevel: 'silent' });
});

after(() => {
	if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('lint core in the ESM engine build', () => {
	test('parity: esm/lint.js matches the Node source on every deck, under both admissions', async () => {
		const { decks, perturb } = await import(pathToFileURL(path.join(__dirname, 'decks.mjs')).href);
		const lint = await import(pathToFileURL(path.join(shipped, 'lint.js')).href);
		const node = {
			lintCore: require(path.join(ROOT, 'lib/authoring/lint-core.js')),
			reviewCore: require(path.join(ROOT, 'lib/authoring/review-core.js')),
			scorecard: require(path.join(ROOT, 'lib/authoring/scorecard.js')),
			notesCore: require(path.join(ROOT, 'lib/authoring/notes-core.js')),
			setBoundaryPluginsOff: require(path.join(ROOT, 'lib/core/boundary-parser.js')).setBoundaryPluginsOff,
		};
		const vocab = require(path.join(ROOT, 'lib/authoring/lint.js')).buildVocab();
		const safe = (f) => {
			try {
				return f();
			} catch (e) {
				return `ERR ${e.message}`;
			}
		};
		const run = (m, src) =>
			JSON.stringify({
				lint: m.lintCore.lintTextWith(src, vocab),
				review: safe(() => m.reviewCore.reviewText(src)),
				score: safe(() => m.scorecard.scoreDeck(src)),
				notes: safe(() => m.notesCore.extractSlideNotes(src)),
			});

		const byAdmission = {};
		const diffs = [];
		let findings = 0;
		try {
			for (const off of [[], ['math']]) {
				lint.setBoundaryPluginsOff(off);
				node.setBoundaryPluginsOff(off);
				const seen = (byAdmission[off.join() || 'default'] = []);
				for (const [name, base] of decks()) {
					for (const [variant, src] of [['as written', base], ['perturbed', perturb(base)]]) {
						const browser = run(lint, src);
						if (browser !== run(node, src)) diffs.push(`${name} (${variant}, off: [${off}])`);
						findings += JSON.parse(browser).lint.length;
						seen.push(browser);
					}
				}
			}
		} finally {
			node.setBoundaryPluginsOff([]);
		}
		assert.deepEqual(diffs.slice(0, 10), [], `${diffs.length} deck run(s) differ between esm/lint.js and lib/authoring`);
		assert.ok(findings > 1000, `only ${findings} findings: the perturbed decks no longer give the lint anything to say`);
		const live = byAdmission.default.filter((r, i) => r !== byAdmission.math[i]).length;
		assert.ok(live > 0, 'math off changed no lint result, so the admission arm tests nothing');
	});

	test('isolation: narrowing the lint parser changes no engine output; a shared parser does', () => {
		const probe = path.join(__dirname, 'isolation-probe.mjs');
		const measure = (dir) => JSON.parse(execFileSync(process.execPath, [probe, dir], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').pop());
		const real = measure(shipped);
		assert.equal(real.errors, 0, 'a deck failed to render');
		assert.deepEqual(real.changed, [], 'narrowing the lint core\'s parser changed engine output');
		const shared = measure(control);
		assert.ok(shared.changed.length > 0, 'the shared-parser control changed nothing, so this check no longer measures isolation');
	});
});
