/**
 * Integration: the browser engine loads its splitter on demand (lib/playground/index.js `splitReady`).
 *
 * Every docs page loads the ESM engine, and most never render at a size that splits. The splitter (auto-split.js,
 * carousel.js and the capacity table) was about 22 KB gz of boot weight on each of them until 2026-11-22, when the
 * getting-started route crossed its engineJsGz ceiling. Two things must hold:
 *
 *   1. BOOT. The engine entry's STATIC import closure carries none of the splitter, and its dynamic one does (so a
 *      portrait deck still splits). A later `require('./carousel')` from a boot module would put it back silently;
 *      the route budget would only catch it once a ceiling broke.
 *   2. CONTRACT. At a size that splits, `splitForPreview` before `splitReady` returns the stamped, unsplit document
 *      with `pending: true`; after it, the same call splits. At 16:9, and once the splitter has loaded, `splitReady`
 *      returns nothing, so a host awaits nothing: an await on a settled promise still yields, and that yield let a
 *      quick tab switch on a phone overtake the Playground's frame write (docs e2e, 2026-11-23). At 16:9 the call
 *      reports `applies: false`.
 *   3. FAILURE. With the splitter's chunk gone (a stale deploy, the network), `splitReady` still resolves, the call
 *      returns `pending: true` (which the Studio's webpage export refuses on), and the engine warns once that the
 *      split did not load, not that the host skipped `splitReady`.
 *
 * Builds its own engine into a temporary directory, so it needs no earlier build.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..', '..', '..');
const { ESM_OPTIONS } = require(path.join(ROOT, 'tools', 'build-playground.js'));

// The modules only a split needs. `split-envelope.js` is not here: relationship.js reads it at render time.
const SPLITTER = ['lib/core/auto-split.js', 'lib/core/carousel.js', 'lib/engine/structural-split.js'];
// The capacity table is a define inlined as a JSON string, so no metafile input names it: find it by its text, the code
// component's recipe and its intro, which only the table carries, in any form the build can emit: JSON (quoted plainly
// or escaped, whichever quote the minifier chose) or the object literal an object-valued define minifies to.
const CAPACITY_TEXT = /strategy\\?"?:\\?"code-cards\\?"?,\\?"?axis\\?"?:\\?"line/;
// The in-page measure: the preview runtime runs it, and the engine reads one list from it (headed-groups.js now),
// so it belongs in neither of the engine's closures (route budget, 2026-11-22).
const RUNTIME_ONLY = ['lib/core/fit-measure.js'];

let tmp;
let meta;

before(async () => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-split-lazy-'));
	// The whole entry set, as tools/build-playground.js builds it: its onEnd assert reads the lint entry too.
	const r = await esbuild.build({ ...ESM_OPTIONS, outdir: tmp, logLevel: 'silent' });
	meta = r.metafile;
});

after(() => {
	if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** The output files reachable from `entry`, following static imports, or static and dynamic ones. */
function outputsFrom(entry, withDynamic) {
	const outs = meta.outputs;
	const start = Object.keys(outs).find((k) => k.endsWith(`/${entry}`));
	assert.ok(start, `the build emitted ${entry}`);
	const seen = new Set();
	const stack = [start];
	while (stack.length) {
		const k = stack.pop();
		if (seen.has(k)) continue;
		seen.add(k);
		for (const i of outs[k].imports || []) if (i.kind === 'import-statement' || (withDynamic && i.kind === 'dynamic-import')) stack.push(i.path);
	}
	return seen;
}

/** Every source input in those outputs. */
function inputsFrom(entry, withDynamic) {
	const inputs = new Set();
	for (const k of outputsFrom(entry, withDynamic)) for (const name of Object.keys(meta.outputs[k].inputs)) inputs.add(name.split(path.sep).join('/'));
	return inputs;
}

/** Does any of those outputs hold the capacity table? Output paths are relative to the build's working directory. */
function carriesCapacity(entry, withDynamic) {
	return [...outputsFrom(entry, withDynamic)].some((k) => CAPACITY_TEXT.test(fs.readFileSync(path.resolve(ROOT, k), 'utf8')));
}

const has = (inputs, mod) => [...inputs].some((name) => name === mod || name.endsWith(`/${mod}`));

describe('the engine loads its splitter on demand', () => {
	test('BOOT: the static closure of esm/engine.js carries no splitter; the dynamic closure carries all of it, and no measure', () => {
		const boot = inputsFrom('engine.js', false);
		const all = inputsFrom('engine.js', true);
		for (const mod of SPLITTER) {
			assert.equal(has(boot, mod), false, `${mod} is back in the engine's boot closure`);
			assert.equal(has(all, mod), true, `${mod} is missing from the engine altogether, so nothing would split`);
		}
		for (const mod of RUNTIME_ONLY) assert.equal(has(all, mod), false, `${mod} is bundled into the engine`);
		assert.equal(carriesCapacity('engine.js', false), false, 'the capacity table is back in the boot closure (an object-valued define is hoisted into the shared runtime chunk)');
		assert.equal(carriesCapacity('engine.js', true), true, 'the capacity table is missing from the engine altogether');
	});

	test('CONTRACT: pending before splitReady, split after it; 16:9 never needs the splitter', () => {
		const deck = ['---', 'theme: indaco', 'size: portrait', '---', '', '<!-- _class: checklist -->', '', '# Launch checklist', '', '- Book the venue', '- Send the invites', '- Print the badges', '- Brief the speakers', ''].join('\n');
		const wide = deck.replace('size: portrait', 'size: 16:9');
		const probe = `
			globalThis.window = globalThis;
			globalThis.self = globalThis;
			await import(${JSON.stringify(path.join(tmp, 'engine.js'))});
			const PG = globalThis.LatticePlayground;
			const warn = console.warn;
			console.warn = () => {};
			const w = PG.render(${JSON.stringify(wide)}, 'indaco');
			// Nothing to load, so nothing to await: a settled promise would still yield the host's turn.
			const wideReturn = PG.splitReady(w.width, w.height);
			const wideCut = PG.splitForPreview(w.html, ${JSON.stringify(wide)}, w.width, w.height, {});
			const p = PG.render(${JSON.stringify(deck)}, 'indaco');
			const early = PG.splitForPreview(p.html, ${JSON.stringify(deck)}, p.width, p.height, {});
			await PG.splitReady(p.width, p.height);
			const late = PG.splitForPreview(p.html, ${JSON.stringify(deck)}, p.width, p.height, {});
			const loadedReturn = PG.splitReady(p.width, p.height);
			console.warn = warn;
			const count = (h) => (h.match(/<section\\b/g) || []).length;
			process.stdout.write(JSON.stringify({
				wide: { applies: wideCut.applies, changed: wideCut.changed, stamped: wideCut.html.includes('data-lattice-slide="1"'), returned: wideReturn === undefined ? 'nothing' : typeof wideReturn },
				loadedReturn: loadedReturn === undefined ? 'nothing' : typeof loadedReturn,
				early: { pending: early.pending === true, changed: early.changed, sections: count(early.html), stamped: early.html.includes('data-lattice-slide="1"') },
				late: { pending: late.pending === true, changed: late.changed, sections: count(late.html) },
			}));
		`;
		const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: ROOT, encoding: 'utf8' }));
		assert.deepEqual(out.wide, { applies: false, changed: 0, stamped: true, returned: 'nothing' }, '16:9 stamps, never splits, and gives the host nothing to await');
		assert.equal(out.loadedReturn, 'nothing', 'once the splitter has loaded, splitReady gives the host nothing to await');
		assert.equal(out.early.pending, true, 'before splitReady the call says it is pending');
		assert.equal(out.early.changed, 0);
		assert.equal(out.early.stamped, true, 'the unsplit document is still stamped, so the host can index its slides');
		assert.equal(out.late.pending, false);
		assert.equal(out.late.changed, 1, 'after splitReady the checklist splits');
		assert.ok(out.late.sections > out.early.sections, `the split emits more pages (${out.late.sections}) than the one slide (${out.early.sections})`);
	});

	test('FAILURE: a splitter chunk that will not load leaves the call pending, with one honest warning', () => {
		// A copy of the build without the chunk that carries the splitter.
		const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-split-broken-'));
		try {
			fs.cpSync(tmp, broken, { recursive: true });
			const chunk = Object.keys(meta.outputs).find((k) => Object.keys(meta.outputs[k].inputs).some((n) => n.endsWith('lib/core/carousel.js')));
			assert.ok(chunk, 'the build has a chunk carrying the splitter');
			fs.rmSync(path.join(broken, path.basename(chunk)));
			const deck = ['---', 'theme: indaco', 'size: portrait', '---', '', '<!-- _class: checklist -->', '', '# Launch checklist', '', '- Book the venue', '- Send the invites', '- Print the badges', ''].join('\n');
			const probe = `
				globalThis.window = globalThis;
				globalThis.self = globalThis;
				await import(${JSON.stringify(path.join(broken, 'engine.js'))});
				const PG = globalThis.LatticePlayground;
				const warnings = [];
				console.warn = (m) => warnings.push(String(m));
				const p = PG.render(${JSON.stringify(deck)}, 'indaco');
				await PG.splitReady(p.width, p.height);
				const r = PG.splitForPreview(p.html, ${JSON.stringify(deck)}, p.width, p.height, {});
				process.stdout.write(JSON.stringify({ pending: r.pending === true, changed: r.changed, warnings }));
			`;
			const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: ROOT, encoding: 'utf8' }));
			assert.equal(out.pending, true, 'the result says the split is pending, so an export can refuse');
			assert.equal(out.changed, 0);
			assert.equal(out.warnings.filter((w) => w.includes('did not load')).length, 1, `one load failure warning (${JSON.stringify(out.warnings)})`);
			assert.equal(out.warnings.filter((w) => w.includes('before splitReady')).length, 0, 'the host did await splitReady');
		} finally {
			fs.rmSync(broken, { recursive: true, force: true });
		}
	});
});
