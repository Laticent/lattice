const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

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

test('diagramMarksOf survives an UNSPACED link — the operator never fuses into a node', () => {
	// `Server--xClient` has no whitespace to split on. Reading identifiers either side of the arrow
	// produced the "nodes" `Server--`, `xClient`, `Worker--` — none real, participants dropped.
	const { nodes, edges } = A.diagramMarksOf(
		'sequenceDiagram\n Client-)Server: fire\n Server--xClient: dropped\n Worker-->>Queue: ack',
	);
	assert.equal(edges, 3, 'the async, cross and bold-async operators are each one message');
	assert.equal(nodes, 4, 'four participants');
});

test('mermaid YAML frontmatter is config, not two edges', () => {
	// `---` delimiters read as plain links. On the corpus's largest diagram this inflated the cost
	// by 1.8s, and it reaches six shipped decks including the gallery.
	const withFm = A.diagramMarksOf('---\ntitle: Request path\n---\nflowchart LR\n A[a] --> B[b]');
	const without = A.diagramMarksOf('flowchart LR\n A[a] --> B[b]');
	assert.deepEqual(withFm, without);
	assert.equal(withFm.edges, 1);
});

test('a `%%` comment contributes no structure', () => {
	const { nodes, edges } = A.diagramMarksOf('graph TD\n A-->B\n %% note with (parens) and [brackets]');
	assert.equal(edges, 1);
	assert.equal(nodes, 2, 'comment words are not nodes');
});

test('a declared-but-unlinked node still counts', () => {
	const { nodes } = A.diagramMarksOf('flowchart LR\n A[Start]\n B[Orphan]\n C[x]\n A-->C');
	assert.equal(nodes, 3, 'declarations win when higher than the edge bound');
});

test('the edge alternation is ORDERED longest-first and BOUNDED (no ReDoS)', () => {
	assert.equal(A.diagramMarksOf('A -->> B').edges, 1, 'a bold async arrow is one edge, not an arrow plus a stray >');
	assert.equal(A.diagramMarksOf('A <--> B').edges, 1);
	assert.equal(A.diagramMarksOf('A ----> B').edges, 1);
	// An open `{2,}` quantifier here backtracked quadratically on author-controlled fence text:
	// 50k `=` took 2.3s. Every quantifier is bounded now, so the scan is linear.
	const t0 = Date.now();
	A.diagramMarksOf('='.repeat(50000));
	assert.ok(Date.now() - t0 < 250, `50k '=' scanned in ${Date.now() - t0}ms — the alternation is unbounded again`);
});

test('one diagram is measured once, even when a wrapper and its code both match', () => {
	// `.mermaid` is the class the BROWSER render path uses, so this shape is reachable there.
	const m = A.measureSlide(
		slide('<pre class="mermaid"><code class="language-mermaid">flowchart LR\n A[a] --> B[b]</code></pre>', 'diagram'),
	);
	assert.equal(m.diagramEdges, 1, 'not two');
	assert.equal(m.diagramNodes, 2);
});

test("KaTeX's screen-reader duplicate is not more content to absorb", () => {
	// Same class of thing as `.lattice-description`. Missing it counted one formula three times:
	// a math slide measured 111 prose words where it holds 66, saturating BOTH beats (18s of silence).
	const withDup = A.measureSlide(slide('<p>the mass energy relation</p><p><span class="katex-mathml">E equals m c squared</span>E=mc2</p>'));
	const control = A.measureSlide(slide('<p>the mass energy relation</p><p>E=mc2</p>'));
	assert.equal(withDup.proseWords, control.proseWords, 'the mathml alternative adds nothing to absorb');
	assert.equal(withDup.proseWords, 5, 'four words of prose plus the one visible formula token');
});

test('the counted mark sets are DISJOINT', () => {
	// An svg `<text>` was both a mark and a label word; a `tr` was both an item and its cells.
	const svg = A.measureSlide(slide('<svg><rect/><text>alpha beta</text></svg>'));
	assert.equal(svg.svgMarks, 1, 'the rect only — svg text is charged as label words');
	assert.equal(svg.labelWords, 2);
	const table = A.measureSlide(slide('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'));
	assert.equal(table.cells, 2);
	assert.equal(table.items, 0, 'a row is not an item — its cells already count');
	const fig = A.measureSlide(slide('<figure><img src="x.png" alt=""><figcaption>a caption</figcaption></figure>'));
	assert.equal(fig.images, 1, 'a figure wraps an image, it is not a second one');
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

test('the floor is honored even above the ceiling, and a bad share cannot zero the beat', () => {
	// clampBeat applies MIN then MAX, so a floor above MAX_BEAT_MS came back clamped DOWN — quietly
	// breaking the invariant this function advertises. Unreachable at today's 1400ms preset; a
	// slower future preset would reach it.
	assert.equal(A.spend(1000, { floorMs: 12000 }).arriveMs, 12000);
	assert.equal(A.spend(8000, { floorMs: 1400, arriveShare: Number.NaN }).arriveMs >= 1400, true);
});

test('no model returns NaN on a partial measure, and none is silently zeroed', () => {
	// scanTimeMs guarded only labelWords, so visualCost and hybrid returned NaN on a hand-built
	// measure — and spend's finiteness guard turned that into cost 0, giving the slide no
	// absorption instead of failing loudly.
	const partial = { words: 10, role: 'body' };
	for (const [id, model] of Object.entries(A.ABSORPTION_MODELS)) {
		const c = model.cost(partial);
		assert.ok(Number.isFinite(c) && c >= 0, `${id} returned ${c} on a partial measure`);
	}
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
	assert.ok(A.NODE_MS > A.MARK_MS, 'a labeled box holds words to read');
});

test('hybrid takes the SLOWER channel, never the sum', () => {
	const m = { words: 100, proseWords: 100, labelWords: 0, svgMarks: 40, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role: 'body' };
	const read = (100 / A.SILENT_READ_WPM) * 60000;
	const cost = A.ABSORPTION_MODELS.hybrid.cost(m);
	assert.ok(cost < read + 40 * A.MARK_MS, 'summing double-charges every slide that has words AND marks');
	assert.ok(cost >= read * 0.99, 'and it is at least the slower of the two');
});

// ── Cross-module invariants ───────────────────────────────────────────────────────────────

test('MEDIA_COMPONENTS is IDENTICAL to the prose projection\'s, by import not by scrape', async () => {
	// The kernel cannot import this list — `kernel-no-transformer-imports` bars lib/core from
	// reaching lib/transformers — so this test is the seam. It compares the two VALUES: an earlier
	// version regex-scraped prose-projection.mjs, which failed loudly on a double-quote reformat and,
	// worse, passed silently on `new Set([...SPATIAL, 'funnel'])` while the lists diverged.
	const { MEDIA_COMPONENTS } = await import('../../../lib/transformers/prose-projection.mjs');
	assert.deepEqual([...MEDIA_COMPONENTS].sort(), [...A.MEDIA_COMPONENTS].sort());
});

test('ROLE_MULT and TABLE_COMPS are IDENTICAL to rehearsal.js\'s, by import', async () => {
	// Same reasoning. The scrape here parsed `open: 1.12 * TUNE` as `1.12` and passed while the
	// runtime value diverged. TABLE_COMPS had no pin at all, though the kernel copies it verbatim.
	const rehearsal = await import('../../../docs/src/components/studio/present/rehearsal.js');
	assert.deepEqual(rehearsal.ROLE_MULT, A.ROLE_MULT);
	assert.deepEqual([...rehearsal.TABLE_COMPS].sort(), [...A.TABLE_COMPONENTS].sort());
});

test('the item rule matches collections.js — direct `li` children of the first list', () => {
	// The kernel mirrors `domItemElements` rather than importing it (collections.js is CJS and
	// Rollup will not resolve it from an .mjs outside its root). HARD RULE #5 makes a card a NESTED
	// list, so a depth-blind count reads every card twice — which is what a hardcoded 'li, dt, tr'
	// did on 46 of 60 catalog-backed slides.
	const { domItemElements } = require('../../../lib/core/collections.js');
	const cards = '<ul><li>One<ul><li>body</li></ul></li><li>Two<ul><li>body</li></ul></li></ul>';
	const section = slide(cards);
	const stage = section.querySelector('.cell-stage');
	assert.equal(domItemElements(stage).length, 2, 'the canonical rule sees two cards');
	assert.equal(A.measureSlide(section).items, 2, 'and so does the kernel — not four');
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
