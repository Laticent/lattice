const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let A; // the absorption kernel
test.before(async () => {
	// ESM from a CommonJS test — the kernel is `.mjs` for the same three-toolchain reason
	// prose-projection.mjs is (rollup/docs, esbuild/emulator, node --test).
	A = await import('../../../lib/core/slide-absorption.mjs');
});

/** A full slide: masthead (headline) + stage (body) + coda, the shape the engine really emits.
 *  `slide()` below builds only a stage, which is what hid the headline/coda defect for so long. */
function fullSlide(masthead, stage, coda, cls = 'content') {
	const dom = new JSDOM(
		`<!doctype html><body><article class="lattice"><section data-class="${cls}">` +
			`<header>page chrome</header>` +
			`<div class="cell-masthead"><div class="masthead-lede"><h2>${masthead}</h2></div></div>` +
			`<div class="cell-stage">${stage}</div>` +
			`<div class="cell-coda">${coda}</div>` +
			`<div class="cell-footer">footer chrome</div>` +
			`<div class="overflow-tab" data-lattice-berth aria-hidden="true"></div>` +
			`</section></article></body>`,
	);
	return dom.window.document.querySelector('section');
}

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

test('narration is credited PER CHANNEL — in full against reading, barely against looking', () => {
	// Blending the two and discounting the whole thing on a media component made a diagram's cost
	// track its CODA rather than its diagram: E's exit correlated with mark count at 0.12, i.e. its
	// differentiation was noise. The voice really does read the prose aloud, on every component.
	const look = { read: 0, look: 8000 };
	const read = { read: 8000, look: 0 };
	const lookMedia = A.spend(8000, { channels: look, narrationMs: 5000, isMedia: true, floorMs: 1400 });
	const lookProse = A.spend(8000, { channels: look, narrationMs: 5000, isMedia: false, floorMs: 1400 });
	assert.ok(lookMedia.exitMs > lookProse.exitMs, 'narration buys little looking on a media slide');

	// The READ channel is paid down in full whether or not the component is "media" — a math or
	// diagram slide whose narration reads its own coda aloud must not be charged for it again.
	const readMedia = A.spend(8000, { channels: read, narrationMs: 8000, isMedia: true, floorMs: 1400 });
	assert.equal(readMedia.exitMs, 0, 'the voice read it; the eye owes nothing more');
});

test('the floor is honored even above the ceiling, and a bad share cannot zero the beat', () => {
	// clampBeat applies MIN then MAX, so a floor above MAX_BEAT_MS came back clamped DOWN — quietly
	// breaking the invariant this function advertises. Unreachable at today's 1400ms preset; a
	// slower future preset would reach it.
	assert.equal(A.spend(1000, { floorMs: 12000 }).arriveMs, 12000);
	// `arriveShare` no longer exists — the arrival beat comes from the model's `arriveCost`. The
	// old assertion passed for every value because the option was ignored, pinning nothing.
	assert.ok(A.spend(8000, { floorMs: 1400, arriveCostMs: Number.NaN }).arriveMs >= 1400);
	assert.ok(A.spend(8000, { floorMs: 1400, arriveCostMs: -5000 }).arriveMs >= 1400);
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
	// The old fixture yielded a residual of MINUS 1300, so it never constructed a sub-threshold
	// POSITIVE residual and passed with the threshold removed entirely. These sweep the band where
	// the rule actually bites: a residual between 1 ms and MIN_BEAT_MS must collapse to 0.
	for (let residual = 10; residual < A.MIN_BEAT_MS; residual += 10) {
		const cost = 1400 + residual; // arrive takes the 1400 floor, so the rest is the residual
		const { exitMs } = A.spend(cost, { channels: { read: 0, look: cost }, arriveCostMs: 0, narrationMs: 0, floorMs: 1400 });
		assert.equal(exitMs, 0, `residual ${residual}ms should collapse to 0, got ${exitMs}`);
	}
	const big = 1400 + A.MIN_BEAT_MS + 500;
	const clears = A.spend(big, { channels: { read: 0, look: big }, arriveCostMs: 0, narrationMs: 0, floorMs: 1400 });
	assert.ok(clears.exitMs >= A.MIN_BEAT_MS, 'and a residual above the threshold survives');
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
	// This test used to compute its upper bound LINEARLY (`read + 40 * MARK_MS`) while `scanTimeMs`
	// applies the knee, so the sum landed 71 ms UNDER the bound and the assertion passed with `max`
	// replaced by `+`. It asserted nothing about the design claim it was named for. The bound is now
	// derived from the two channel values themselves.
	const m = { words: 100, proseWords: 100, labelWords: 0, svgMarks: 40, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role: 'body' };
	const readOnly = A.ABSORPTION_MODELS.hybrid.cost({ ...m, svgMarks: 0 });
	const scanOnly = A.ABSORPTION_MODELS.hybrid.cost({ ...m, words: 0, proseWords: 0 });
	const both = A.ABSORPTION_MODELS.hybrid.cost(m);
	assert.equal(Math.round(both), Math.round(Math.max(readOnly, scanOnly)), 'exactly the slower channel');
	assert.ok(both < readOnly + scanOnly - 1, 'and strictly less than their sum — a sum double-charges');
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

// ── The live runtime's DOM shape ──────────────────────────────────────────────────────────

test('a diagram drawn by the runtime is measured ONCE, from the SVG, not again from its source', () => {
	// The exact shape `lib/runtime/index.js:474-500` produces: the source `<code>` is defanged to
	// `language-mermaid-source`, and the SVG lands in a SIBLING `<div class="mermaid">`. The old
	// guard looked for an SVG INSIDE the source element and matched the class by SUBSTRING, so it
	// found neither — and charged the hidden source block as a whole second diagram on top of the
	// SVG that replaced it (+82% cost, +2.97s on a five-node flowchart, on the live surface).
	const drawn = slide(
		'<pre data-mermaid-state="rendered"><code class="language-mermaid-source">flowchart LR\n A["a"] --> B["b"]\n B --> C["c"]</code></pre>' +
			'<div class="mermaid" aria-hidden="true"><svg><path/><path/><rect/></svg></div>',
		'diagram',
	);
	const m = A.measureSlide(drawn);
	assert.equal(m.diagramEdges, 0, 'the source block is not re-counted once a sibling SVG exists');
	assert.equal(m.diagramNodes, 0);
	assert.equal(m.svgMarks, 3, 'the drawn marks ARE counted');
});

test('aria-hidden is not a skip signal — it means "do not announce", not "do not paint"', () => {
	// The runtime marks every drawn diagram `aria-hidden` because the source carries the accessible
	// text. Treating that as hidden would erase the rendered diagram from the measurement.
	const m = A.measureSlide(slide('<div class="mermaid" aria-hidden="true"><svg><rect/><circle/></svg></div>', 'diagram'));
	assert.equal(m.svgMarks, 2);
});

test('an undrawn source fence is still measured — both render paths, one kernel', () => {
	const m = A.measureSlide(slide('<pre><code class="language-mermaid">flowchart LR\n A["a"] --> B["b"]</code></pre>', 'diagram'));
	assert.equal(m.diagramEdges, 1);
	assert.equal(m.words, 0, 'and its DSL is never words');
});


// ── The measurement roots and skips ───────────────────────────────────────────────────────

test('the HEADLINE and CODA are counted — they live OUTSIDE .cell-stage', () => {
	// The defect that invalidated the first bake-off. The engine puts the headline in a sibling
	// `.cell-masthead > .masthead-lede > h2` and a harvested insight in a sibling `.cell-coda`;
	// rooting the measurement at `.cell-stage` dropped both on 1065 of 1602 slides and left 141
	// measuring ZERO words while showing visible prose.
	const m = A.measureSlide(fullSlide('One two three', '<p>four five</p>', '<p>six seven eight</p>'));
	assert.equal(m.proseWords, 8, 'headline (3) + stage (2) + coda (3)');
});

test('slide chrome outside the stage is still excluded', () => {
	const m = A.measureSlide(fullSlide('Title here', '<p>body</p>', ''));
	assert.equal(m.words, 3, 'the header, footer and berth tabs contribute nothing');
});

test('a slide whose only content is a headline and coda is not measured at zero', () => {
	// `examples/form.md` slide 6 has an EMPTY stage; under the old root it measured 0 words and got
	// today's flat beat with no exit — it "did not breathe", which is the complaint this exists to fix.
	const m = A.measureSlide(fullSlide('When it is a lot', '', '<p>a wall of numbers becomes a shape</p>'));
	assert.ok(m.proseWords >= 10, `expected the lede+coda to be counted, got ${m.proseWords}`);
});

test('invisible SVG title/desc is not on-slide content', () => {
	// The SVG spelling of `.lattice-description`: a tooltip and an accessible name, never painted.
	// A world basemap carries one <title> per country — map.md#3 measured 257 words, 17 visible.
	const m = A.measureSlide(slide('<svg><title>Map</title><desc>Key — United States 42, India 38</desc><path><title>Angola</title></path><text>Visible label</text></svg>'));
	assert.equal(m.labelWords, 2, 'only the painted <text> counts');
});

test('a rendered KaTeX formula is ONE look, not one word per glyph', () => {
	// KaTeX sets every symbol in its own span, so a TreeWalker charged `f : [ a , b ] -> R` as eight
	// words at reading speed. cat-ink-tier.md#1 measured 200 prose words where ~123 is text, and both
	// its beats pinned at the ceiling — 18s of silence, the exact symptom skipping `.katex-mathml`
	// was supposed to have closed.
	const withMath = A.measureSlide(slide('<p>the relation</p><span class="katex"><span class="katex-mathml">E equals m c squared</span><span class="katex-html"><span class="mord">E</span><span class="mord">=</span><span class="mord">m</span><span class="mord">c</span><span class="mord">2</span></span></span>'));
	assert.equal(withMath.proseWords, 2, 'the prose');
	assert.equal(withMath.labelWords, 1, 'the whole formula is a single look');
});

test('a uniform run of marks is one picture, not one look per mark', () => {
	// examples/map.md renders a world basemap as 175 identically-classed <path class="map-region">.
	// Charging each as a fixation gave every map slide both beats at the ceiling.
	const many = `<svg>${'<path class="map-region"/>'.repeat(175)}</svg>`;
	const few = `<svg>${'<path class="map-region"/>'.repeat(10)}</svg>`;
	const mMany = A.measureSlide(slide(many));
	const mFew = A.measureSlide(slide(few));
	assert.equal(mFew.svgMarks, 10, 'a small uniform run is charged in full');
	assert.ok(mMany.svgMarks < 40, `175 identical paths should not cost 175 looks, got ${mMany.svgMarks}`);
	assert.ok(mMany.svgMarks > mFew.svgMarks, 'but a bigger picture still costs more than a smaller one');
});

test('distinctly-classed marks are NOT discounted — a 20-series chart is twenty things', () => {
	const varied = `<svg>${Array.from({ length: 20 }, (_, i) => `<rect class="bar cat-${i}"/>`).join('')}</svg>`;
	assert.equal(A.measureSlide(slide(varied)).svgMarks, 20);
});

test("a table cell's text is not billed on top of the cell", () => {
	const m = A.measureSlide(slide('<table><tbody><tr><td>alpha beta</td><td>gamma</td></tr></tbody></table>'));
	assert.equal(m.cells, 2);
	assert.equal(m.labelWords, 0, 'the cell is the unit; its text is already paid for');
});

test('an unregistered role cannot poison the cost — Object.prototype keys included', () => {
	// `ROLE_MULT[role] || 1` returns a truthy FUNCTION for `toString`/`constructor`, so `|| 1` never
	// fires and the cost comes back NaN — which spend()'s finiteness guard turns into cost 0,
	// silently giving the slide no absorption. The same defect the numeric guard was added to close.
	for (const role of ['toString', 'constructor', 'valueOf', '__proto__', 'nonsense']) {
		for (const [id, model] of Object.entries(A.ABSORPTION_MODELS)) {
			const c = model.cost({ words: 10, proseWords: 10, labelWords: 0, svgMarks: 0, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role });
			assert.ok(Number.isFinite(c) && c >= 0, `${id} returned ${c} for role "${role}"`);
		}
	}
});

test('measureSlide survives an unusable argument instead of taking down the loop', () => {
	for (const bad of [null, undefined, {}, 'not an element', 42]) {
		const m = A.measureSlide(bad);
		assert.equal(m.words, 0);
		assert.equal(m.role, 'body');
	}
});

// ── Diagram source: labels, comments, axes, and grammars without arrows ───────────────────

test('an arrow inside a LABEL is text, not an edge', () => {
	assert.deepEqual(A.diagramMarksOf('flowchart LR\n A["step --> step"] --> B["b"]'), { nodes: 2, edges: 1 });
});

test('a trailing %% comment contributes no structure', () => {
	// The strip was line-anchored; Mermaid allows a comment after content.
	assert.deepEqual(A.diagramMarksOf('graph TD\n A-->B %% note --> more --> yet'), { nodes: 2, edges: 1 });
});

test('a bare --- rule inside the body is not an edge', () => {
	assert.equal(A.diagramMarksOf('flowchart LR\nA-->B\n---\nC-->D\n---\nE-->F').edges, 3);
});

test("xychart's axis RANGE operator is not a link", () => {
	// `-->` in `x-axis "Trial" 1 --> 5` is a range, so an xychart's absorption cost was a count of
	// how many axes declared one.
	const { edges } = A.diagramMarksOf('xychart-beta\n x-axis "Trial" 1 --> 5\n y-axis "Score" 0 --> 10\n bar [1,2,3]');
	assert.equal(edges, 0);
});

test('grammars with no arrows are measured by their rows, not scored at zero', () => {
	// Eleven grammars scored {0,0} — no absorption at all on a component whose narration skips the
	// visual. 15 shipped fences, including every chart in examples/xychart-narration.md.
	for (const src of [
		'xychart-beta\n bar [1,2,3]\n line [4,5,6]',
		'gitGraph\n commit\n branch dev\n commit',
		'timeline\n 2021 : launch\n 2022 : scale',
		'gantt\n dateFormat YYYY-MM-DD\n section A\n task :a1, 2024-01-01, 30d',
	]) {
		const { nodes, edges } = A.diagramMarksOf(src);
		assert.ok(nodes + edges > 0, `scored zero: ${src.split('\n')[0]}`);
	}
});

test('the arrival beat is paid from the LOOK channel, never as a share of the whole cost', () => {
	// The correction that changed the answer. A blanket share made arrive a plain additive pause:
	// 78% of everything the model added was arrival silence, and 84% of THAT landed on prose slides
	// — a slide with 83 prose words took 8.5s of silence before the voice read those same words.
	// Prose is exactly what the voice is about to say, so pre-reading silence buys nothing.
	const wordy = { words: 200, proseWords: 200, labelWords: 0, svgMarks: 0, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role: 'body', isVisual: false };
	const visual = { ...wordy, words: 0, proseWords: 0, svgMarks: 30, role: 'visual', isVisual: true };
	const E = A.ABSORPTION_MODELS.hybrid;
	assert.equal(E.arriveCost(wordy), 0, 'a prose slide owes no arrival silence');
	assert.ok(E.arriveCost(visual) > 0, 'a visual slide does');

	const proseBeat = A.spend(E.cost(wordy), { arriveCostMs: E.arriveCost(wordy), channels: E.channels(wordy), floorMs: 1400, narrationMs: 0 });
	assert.equal(proseBeat.arriveMs, 1400, 'so it gets exactly the beat it gets today, and no more');
});

test('the flat control does NOT take part in the residual', () => {
	// Not knowing the narration time is the whole point of the control. Running it through the
	// residual would test a weaker rule than the one proposed and flatter every model it exists to
	// hold to account.
	const visual = { words: 0, proseWords: 0, labelWords: 0, svgMarks: 5, cells: 0, items: 0, images: 0, diagramNodes: 0, diagramEdges: 0, role: 'visual', isVisual: true, isMedia: true };
	const [scored] = A.scoreDeck([{ ...visual, index: 0 }], 'flatVisual', { narrationFor: () => 600000, floorMs: 1400 });
	assert.equal(scored.exitMs, 3000, 'ten minutes of narration does not erode the flat hold');
});

test('the deck pace register scales the model rather than being outgrown by it', () => {
	// `resolve-pace.mjs` argues delivery rhythm is the author's choice and travels with the deck.
	// An arrival beat of `max(floor, cost x share)` stops consulting the floor once the cost term
	// outgrows it — above ~27 prose words `brisk`, `natural` and `deliberate` played identically.
	const opts = { arriveCostMs: 6000, channels: { read: 0, look: 20000 }, narrationMs: 0, floorMs: 1400 };
	const brisk = A.spend(20000, { ...opts, paceScale: 800 / 1400 });
	const natural = A.spend(20000, { ...opts, paceScale: 1 });
	const deliberate = A.spend(20000, { ...opts, paceScale: 2200 / 1400 });
	assert.ok(brisk.arriveMs < natural.arriveMs, 'brisk is briskER');
	assert.ok(deliberate.arriveMs > natural.arriveMs, 'and deliberate is slower');
	assert.ok(brisk.exitMs < deliberate.exitMs, 'the register reaches both beats, not just the floor');
});

// ── The second trio's findings ────────────────────────────────────────────────────────────

test('a photo painted as a CSS background is an image — IMAGE_MS fired on nothing before', () => {
	// The `image` component renders onto `.lattice-bg` with no <img> (its docs say so), and `scene`
	// uses the same panel. So `images` was 0 corpus-wide, a constant documented as "a photo…
	// charged as one substantial look" never described a photo, and 10 of 41 visual slides were
	// structurally unable to earn a beat.
	const bg = A.measureSlide(slide('<div class="lattice-bg lattice-bg-full" style="background-image:url(\'p.jpg\')"></div>', 'image'));
	assert.equal(bg.images, 1);
	const empty = A.measureSlide(slide('<div class="lattice-bg"></div>', 'image'));
	assert.equal(empty.images, 0, 'a panel with nothing painted is a container, not a picture');
});

test('total silence never exceeds the model own cost — the arrival beat is credited to BOTH channels', () => {
	// Charging arrive only against the look channel let a 6000/6000 slide bill arrive 2100 + exit
	// 6000 = 8100 for a cost of 6000, contradicting spend()'s own docstring.
	for (const [read, look] of [[6000, 6000], [2000, 2000], [9000, 1000], [1000, 9000]]) {
		const cost = Math.max(read, look);
		const b = A.spend(cost, { channels: { read, look }, arriveCostMs: look * 0.35, narrationMs: 0, floorMs: 0 });
		assert.ok(b.arriveMs + b.exitMs <= cost + 1, `read=${read} look=${look}: ${b.arriveMs}+${b.exitMs} > ${cost}`);
	}
});

test('a row grammar sees its DATA, not just its statement count', () => {
	// `stripDiagramText` removes `bar [42, 58, 71]` before the row count, so an xychart measured
	// identically at 4 bars and at 400, and a 13-point line scored the same as a 2-point bar.
	const chart = (n) =>
		`xychart-beta\n  title "t"\n  x-axis [${Array.from({ length: n }, (_, i) => `p${i}`).join(', ')}]\n  bar [${Array.from({ length: n }, (_, i) => i).join(', ')}]`;
	const small = A.diagramMarksOf(chart(2)).nodes;
	const mid = A.diagramMarksOf(chart(13)).nodes;
	const big = A.diagramMarksOf(chart(40)).nodes;
	assert.ok(mid > small, `13 points (${mid}) must outweigh 2 (${small})`);
	assert.ok(big > mid, `40 points (${big}) must outweigh 13 (${mid})`);
});

test('an apostrophe in a label does not eat the arrow beside it', () => {
	// A single-quote strip paired one label's apostrophe with the next and deleted the link
	// between them: a chained single-line diagram lost half its edges.
	assert.equal(A.diagramMarksOf("flowchart LR\n A[Bob's data] --> B[Alice's report]\n B --> C[Done]").edges, 2);
	assert.equal(A.diagramMarksOf("flowchart LR\n A[a's] --> B[b's] --> C[c's] --> D[d's]").edges, 3);
});

test('an init directive is config, and a percent inside a label is not a comment', () => {
	// Order matters: the directive is stripped as its own form (it is full of quotes and braces),
	// and line comments go LAST so `A[50%% done]` cannot delete its own line's link.
	assert.equal(A.diagramMarksOf("%%{init: {'theme':'forest'}}%%\nflowchart LR\n A[a] --> B[b]").edges, 1);
	assert.equal(A.diagramMarksOf('flowchart LR\n A[50%% done] --> B[b]').edges, 1);
	assert.equal(A.diagramMarksOf('graph TD\n A-->B %% note --> more --> yet').edges, 1);
});

test('a math slide is weighted as visual, not as prose', () => {
	// `math` is in VISUAL_BUCKETS, so the metric scored it visual while roleOf returned `body` and
	// weighted it 1.0 instead of visual's 1.16 — one slide in the corpus disagreed with itself.
	assert.equal(A.roleOf('theorem', 3, 9, '', () => 'math'), 'visual');
	assert.equal(A.roleOf('piechart', 3, 9, '', () => 'chart'), 'visual');
});

test('every chrome test is bounded to the slide — no counter consults the page', () => {
	// walkSlide was bounded while items, marks and diagrams used a bare closest(), so marking the
	// section itself hidden left words counted in full and everything else at zero.
	const dom = new JSDOM(
		'<!doctype html><body><div class="lattice-notes"><article class="lattice">' +
			'<section data-class="content"><div class="cell-stage"><ul><li>one</li><li>two</li></ul>' +
			'<table><tbody><tr><td>a</td></tr></tbody></table></div></section></article></div></body>',
	);
	const section = dom.window.document.querySelector('section');
	const m = A.measureSlide(section);
	assert.equal(m.items, 2, 'an ancestor OUTSIDE the slide must not blank the slide');
	assert.equal(m.cells, 1);
});

test('a component-declared domSelector is counted, and bounded to the slide too', () => {
	// `countVisible` runs only for the components that declare their own `density.domSelector`, so
	// the bounded-chrome test above never reached it.
	const dom = new JSDOM(
		'<!doctype html><body><div class="lattice-notes"><article class="lattice">' +
			'<section data-class="roadmap"><div class="cell-stage">' +
			'<div class="lane">a</div><div class="lane">b</div><div class="lane">c</div>' +
			'</div></section></article></div></body>',
	);
	const section = dom.window.document.querySelector('section');
	const catalog = { roadmap: { axis: 'item', domSelector: '.lane', soft: 6, hard: 10 } };
	assert.equal(A.measureSlide(section, { catalog }).items, 3, 'an ancestor outside the slide must not blank it');
});
