const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');

let A; // the absorption kernel
test.before(async () => {
	// ESM from a CommonJS test — the kernel is `.mjs` for the same three-toolchain reason
	// prose-projection.mjs is (rollup/docs, esbuild/emulator, node --test).
	A = await import('../../../lib/core/slide-absorption.mjs');
});

/** Build a slide `<section>` from markup, the shape the kernel is handed on both render paths. */
function slide(inner, cls = 'content') {
	const dom = new JSDOM(
		`<!doctype html><body><article class="lattice"><section data-class="${cls}"><div class="cell-stage">${inner}</div></section></article></body>`,
	);
	return dom.window.document.querySelector('section');
}

// ── The measurement ───────────────────────────────────────────────────────────────────────

test('prose is READ and labels are SCANNED — the split the bake-off proved load-bearing', () => {
	const m = A.measureSlide(slide('<p>one two three</p><svg><text>alpha</text><text>beta</text></svg>'));
	assert.equal(m.proseWords, 3, 'the paragraph is prose');
	assert.equal(m.labelWords, 2, 'the svg text nodes are labels, not prose');
	// Pricing labels as prose is what gave a 51-label quadrant 13.8s of silence.
	assert.ok(m.proseWords + m.labelWords === m.words, 'the split partitions the visible words');
});

test('a nested prose block is charged once, not twice', () => {
	const m = A.measureSlide(slide('<ul><li><p>alpha beta</p></li></ul>'));
	assert.equal(m.proseWords, 2, 'the li holding a p counts the innermost only');
});

test('fenced source is not readable text; INLINE code is', () => {
	const fenced = A.measureSlide(slide('<pre><code>flowchart LR\n A --> B</code></pre>'));
	assert.equal(fenced.words, 0, 'a fence is source, never words on the slide');
	const eyebrow = A.measureSlide(slide('<p><code>Q4 REVIEW</code></p><p>body text here</p>'));
	assert.equal(eyebrow.proseWords, 5, 'the eyebrow slot is `p > code` across the catalog — it is read');
});

test('slide chrome never counts as content', () => {
	const m = A.measureSlide(slide('<p>alpha beta</p><footer>page seven of nine</footer>'));
	assert.equal(m.words, 2, 'the footer is chrome');
});

// ── The diagram estimate ──────────────────────────────────────────────────────────────────

test('diagramMarksOf reads a flowchart from its source, where no browser has drawn it', () => {
	const { nodes, edges } = A.diagramMarksOf('flowchart LR\n Web["Web App"] --> API["API"]\n API --> DB[("Postgres")]');
	assert.equal(edges, 2);
	assert.equal(nodes, 3, 'a node is counted once, not once per edge it appears in');
});

test('diagramMarksOf sees grammars that declare no shape brackets', () => {
	// A classDiagram names its nodes as bare identifiers; the bracket-only rule scored it zero,
	// so a three-class diagram priced as two lonely edges.
	const { nodes, edges } = A.diagramMarksOf('classDiagram\n Animal <|-- Dog\n Animal <|-- Cat');
	assert.equal(edges, 2);
	assert.equal(nodes, 3, 'Animal, Dog, Cat');
});

test('an undrawn mermaid fence measures as a diagram, not as words', () => {
	const m = A.measureSlide(slide('<pre><code class="language-mermaid">flowchart LR\n A["x"] --> B["y"]</code></pre>', 'diagram'));
	assert.equal(m.words, 0);
	assert.equal(m.diagramEdges, 1);
	assert.ok(m.diagramNodes >= 2);
	assert.ok(m.isMedia, 'diagram is a media component — its narration skips the visual');
});

// ── The spend rule ────────────────────────────────────────────────────────────────────────

test('the arrive beat never drops below the caller floor — this model can only ADD room', () => {
	const { arriveMs } = A.spend(0, { floorMs: 1400 });
	assert.equal(arriveMs, 1400, "today's flat SLIDE_PAUSE_MS is the floor, so no slide gets faster");
});

test('exit is a RESIDUAL — narration that already covered the slide owes nothing', () => {
	const wordy = A.spend(4000, { narrationMs: 20000, floorMs: 1400 });
	assert.equal(wordy.exitMs, 0, 'twenty seconds of narration bought all the looking there was');
	const silent = A.spend(8000, { narrationMs: 1000, isMedia: true, floorMs: 1400 });
	assert.ok(silent.exitMs > 2000, 'a costly visual with one sentence of narration still owes time');
});

test('a media slide gets little credit for its narration — the voice never described the visual', () => {
	const prose = A.spend(8000, { narrationMs: 5000, isMedia: false, floorMs: 1400 });
	const media = A.spend(8000, { narrationMs: 5000, isMedia: true, floorMs: 1400 });
	assert.ok(media.exitMs > prose.exitMs, 'prose narration pays down the whole cost; media narration barely any');
});

test('a beat is either zero or perceptible — never a stutter', () => {
	const { exitMs } = A.spend(1500, { narrationMs: 1400, floorMs: 1400 });
	assert.ok(exitMs === 0 || exitMs >= A.MIN_BEAT_MS, 'a sub-threshold residual is dropped, not rounded up');
	assert.ok(A.spend(1e9, { floorMs: 0 }).arriveMs <= A.MAX_BEAT_MS, 'one pathological slide cannot stall a delivery');
});

// ── The cost models ───────────────────────────────────────────────────────────────────────

test('every model is pure and returns a finite non-negative cost', () => {
	const m = A.measureSlide(slide('<p>alpha beta gamma</p><table><tr><td>1</td><td>2</td></tr></table>'));
	for (const [id, model] of Object.entries(A.ABSORPTION_MODELS)) {
		const c = model.cost(m);
		assert.ok(Number.isFinite(c) && c >= 0, `${id} returned ${c}`);
		assert.equal(model.cost(m), c, `${id} is not deterministic`);
	}
});

test('visual cost is LINEAR at the small end — the range the first draft got wrong', () => {
	// A five-element diagram priced at 0.7s under a blanket sqrt curve, below the 1.4s floor, so
	// the one model that can see a diagram gave every diagram in the tree nothing.
	const small = { svgMarks: 0, cells: 0, items: 0, images: 0, labelWords: 0, diagramNodes: 3, diagramEdges: 2, words: 0, proseWords: 0 };
	assert.ok(A.ABSORPTION_MODELS.visualCost.cost(small) > 1400, 'a small diagram must clear the existing flat beat');
});

test('edges cost more than marks — a diagram is its relations, not its boxes', () => {
	assert.ok(A.EDGE_MS > A.MARK_MS, 'tracing a relation is not scanning a bar');
	assert.ok(A.NODE_MS > A.MARK_MS, 'a labelled box holds words to read');
});

test('hybrid takes the SLOWER channel, never the sum', () => {
	const m = { words: 100, proseWords: 100, labelWords: 0, svgMarks: 40, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role: 'body' };
	const read = (100 / A.SILENT_READ_WPM) * 60000;
	const cost = A.ABSORPTION_MODELS.hybrid.cost(m);
	assert.ok(cost < read + 40 * A.MARK_MS, 'summing double-charges every slide that has words AND marks');
	assert.ok(cost >= read * 0.99, 'and it is at least the slower of the two');
});

// ── Cross-module invariants ───────────────────────────────────────────────────────────────

test('MEDIA_COMPONENTS stays identical to the prose projection\'s list', async () => {
	// The two must not drift: that list is exactly the set whose narration SKIPS the visual, so
	// it is exactly the set whose absorption cost the narration cannot pay for.
	const src = fs.readFileSync(path.join(ROOT, 'lib/transformers/prose-projection.mjs'), 'utf8');
	const block = src.match(/const MEDIA_COMPONENTS = new Set\(\[([\s\S]*?)\]\)/);
	assert.ok(block, 'prose-projection.mjs still declares MEDIA_COMPONENTS');
	const names = new Set((block[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)));
	assert.deepEqual([...names].sort(), [...A.MEDIA_COMPONENTS].sort());
});

test('ROLE_MULT stays identical to rehearsal.js — one content-weight model, not two', () => {
	const src = fs.readFileSync(path.join(ROOT, 'docs/src/components/studio/present/rehearsal.js'), 'utf8');
	const line = src.match(/const ROLE_MULT = \{([^}]*)\}/);
	assert.ok(line, 'rehearsal.js still declares ROLE_MULT');
	const theirs = {};
	for (const [, k, v] of line[1].matchAll(/(\w[\w-]*):\s*([\d.]+)/g)) theirs[k] = Number(v);
	assert.deepEqual(theirs, A.ROLE_MULT);
});

test('roleOf agrees with rehearsal.js on the roles it can decide without a bucket map', () => {
	assert.equal(A.roleOf('title', 0, 9, ''), 'open', 'the first slide is always the opener');
	assert.equal(A.roleOf('divider', 3, 9, ''), 'section');
	assert.equal(A.roleOf('big-number', 3, 9, ''), 'data');
	assert.equal(A.roleOf('compare-table', 3, 9, ''), 'table');
	assert.equal(A.roleOf('content', 8, 9, ''), 'close', 'the last slide closes');
	assert.equal(A.roleOf('content', 3, 9, 'Thank you'), 'close', 'a closing phrase beats position');
	assert.equal(A.roleOf('funnel', 3, 9, '', () => 'chart'), 'visual', 'bucket decides when injected');
});
