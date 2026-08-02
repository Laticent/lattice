const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { nextRenderSeq, resetRenderIds, renderIdPrefix, setRenderSection } = require('../../../lib/core/render-ids');
const engine = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '../../..');

// RENDER DETERMINISM — the property every render-cache design is guarded by, and which the
// engine did not have.
//
// Several chart kernels mint SVG `<defs>` ids (gradients, spines) from a shared sequence, because
// a duplicate id inside one document makes every reference resolve to the first one. Those
// sequences used to be MODULE-level, i.e. scoped to the process rather than the render, so they
// kept climbing: rendering the same deck twice in one process produced different bytes — measured
// at 24 of 112 committed decks (`gantt-fill-pass-1` → `-2`, `pie-wedge-1` → `-6`, `radar-area-1`
// → `-4`). Nothing broke visibly, because ids and their references are minted together, which is
// exactly why it survived unnoticed.
//
// It matters because `engineering/decisions/2026-07-15-incremental-per-slide-render-cache.md`
// guards its whole design with an `incrementalRender === wholeRender` property test. Against a
// non-deterministic renderer that test is only writable with a normalizer over the ids — and a
// normalizer broad enough to hide this drift hides real drift of the same shape. Determinism is
// what lets the guard be a plain byte comparison.

test('render-ids: sequences are per-render, not per-process', () => {
	// STRINGS, not numbers — the discriminator carries the slide when one is in scope, and every call
	// site templates it verbatim so the id shape stays readable in an export diff.
	resetRenderIds();
	assert.equal(nextRenderSeq('a'), '1');
	assert.equal(nextRenderSeq('a'), '2');
	assert.equal(nextRenderSeq('b'), '1', 'families are independent');
	resetRenderIds();
	assert.equal(nextRenderSeq('a'), '1', 'reset starts a fresh id space');
});

test('render-ids: a slide in scope restarts the sequence and stamps its absolute position', () => {
	resetRenderIds();
	setRenderSection(0);
	assert.equal(nextRenderSeq('a'), '1-1');
	assert.equal(nextRenderSeq('a'), '1-2');
	setRenderSection(1);
	assert.equal(nextRenderSeq('a'), '2-1', 'the per-slide sequence restarts, which is what makes a slice match its deck section');
	setRenderSection(null);
	assert.equal(nextRenderSeq('a'), '1', 'leaving slide scope returns the bare document-start ordinal (the browser DOM path)');
});

test('render-ids: the slide OFFSET shifts the numbering, so a slice lands on its deck position', () => {
	// THE PROPERTY THE WHOLE CHANGE EXISTS FOR. Section 0 of a document rendered at offset 2 IS
	// slide 3 of the deck, so it must mint exactly what slide 3 minted in the whole-deck render.
	resetRenderIds(undefined, 2);
	setRenderSection(0);
	const slice = [nextRenderSeq('a'), nextRenderSeq('a')];
	resetRenderIds();
	setRenderSection(0);
	setRenderSection(1);
	setRenderSection(2); // the deck walks its way to section 2 == slide 3
	const deck = [nextRenderSeq('a'), nextRenderSeq('a')];
	assert.deepEqual(slice, deck);
	assert.deepEqual(slice, ['3-1', '3-2']);
});

test('render-ids: a non-integer or negative offset is ignored rather than trusted', () => {
	for (const bad of [-1, 1.5, Number.NaN, '2', null, undefined]) {
		resetRenderIds(undefined, bad);
		setRenderSection(0);
		assert.equal(nextRenderSeq('a'), '1-1', String(bad));
	}
});

test('engine: rendering the same deck twice yields byte-identical html', () => {
	// The gallery is the deck that exercises every chart kernel, so it is the one that broke.
	const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
	const a = engine.render(src, 'lattice');
	const b = engine.render(src, 'lattice');
	assert.equal(a.html, b.html, 'second render of the same deck differs — an id sequence is process-scoped again');
	assert.equal(a.css, b.css);
});

test('engine: determinism survives an interleaved render with a different theme', () => {
	// Guards the sequence being reset per render rather than merely once: a render with another
	// key in between must not shift the ids of the render after it.
	const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
	const first = engine.render(src, 'lattice').html;
	engine.render(src, 'indaco');
	assert.equal(engine.render(src, 'lattice').html, first);
});

test('engine: every committed example deck renders identically twice', () => {
	// Breadth, because the failure was concentrated in chart-bearing decks and a single fixture
	// would not have caught all four sequences.
	const dir = path.join(ROOT, 'examples');
	const drifted = [];
	for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
		const src = fs.readFileSync(path.join(dir, f), 'utf8');
		// Two SEPARATE renders — textually identical calls, which is the whole point: they must
		// return the same bytes. (Held in locals so this does not read as a self-comparison.)
		const first = engine.render(src, 'lattice').html;
		const second = engine.render(src, 'lattice').html;
		if (first !== second) drifted.push(f);
	}
	assert.deepEqual(drifted, [], `decks whose second render differs: ${drifted.join(', ')}`);
});

// ── The anti-squat prefix ───────────────────────────────────────────────────────────────────────
// Determinism has a price: a predictable id is a squattable id. A deck writes raw HTML declaring
// `<radialGradient id="pie-wedge-1">` on an earlier slide and SVG's first-def-wins rule repaints the
// real chart's wedges while its legend still reads correctly — a chart that lies. This was possible
// before the sequences became render-scoped too, but only on a process's FIRST render; the climbing
// module counter moved the real ids aside by accident from the second on. On the multi-render
// surfaces this change exists for, that accidental escape is gone, so the guard has to be explicit.
// Found by the red team.

test('render-ids: no prefix when the source never names a minting family', () => {
	// The byte-neutrality property. Every real deck lands here — the whole committed corpus renders
	// first-render byte-identical to `main`, which would be impossible if the prefix ever fired
	// spuriously.
	resetRenderIds('# A deck\n\n- one `1`\n- two `2`\n');
	assert.equal(renderIdPrefix(), '');
});

test('render-ids: a squatted family shifts the namespace to a prefix that is provably free', () => {
	resetRenderIds('<svg><defs><radialGradient id="pie-wedge-1"/></defs></svg>');
	assert.equal(renderIdPrefix(), 'lat-r0-');
	// Decoy prefixes must not be walked into: the choice is max(existing)+1, so it is free by
	// construction rather than by a loop that might bail on its own last candidate — the exact
	// mistake that broke `svgA11yNames.uniquePrefix` once already.
	resetRenderIds('<svg><defs><linearGradient id="chart-spine-1"/><linearGradient id="lat-r0-chart-spine-1"/><linearGradient id="lat-r7-chart-spine-1"/></defs></svg>');
	assert.equal(renderIdPrefix(), 'lat-r8-');
});

test('render-ids: an ENTITY-ENCODED family name shifts the namespace too', () => {
	// `id="pie&#x2d;wedge-1"` contains no literal `pie-wedge` but PARSES to exactly the id about to
	// be minted, and wins by being first in tree order. A probe on the raw text alone misses it.
	resetRenderIds('<svg><defs><radialGradient id="pie&#x2d;wedge-1"/></defs></svg>');
	assert.equal(renderIdPrefix(), 'lat-r0-', 'the probe is testing the raw text only, not the decoded id space');
	resetRenderIds('<svg><defs><radialGradient id="pie&#45;wedge-1"/></defs></svg>');
	assert.equal(renderIdPrefix(), 'lat-r0-', 'decimal character references are part of the same syntax');
});

test('engine: a squatting deck gets zero duplicate ids, on every render', () => {
	// End to end through the real engine, four renders in one process — the surface where the old
	// accidental escape used to kick in from render 2.
	const { createEngine } = require('../../../lib/engine/index.js');
	const e = createEngine();
	e.addThemes([
		fs.readFileSync(path.join(ROOT, 'dist/lattice-default.css'), 'utf8'),
		fs.readFileSync(path.join(ROOT, 'themes/indaco.css'), 'utf8'),
	]);
	// SQUATTING THE SHAPE THE ENGINE ACTUALLY MINTS. Since ids became slide-scoped
	// (`pie-wedge-<slide>-<n>`), a squat on the old bare `pie-wedge-1` cannot collide with anything —
	// so a fixture using it would make the duplicate-id assertion below pass VACUOUSLY while the
	// guard it is testing was gone. The chart lives on slide 2 of this deck, so `pie-wedge-2-1` and
	// `pie-wedge-2-2` are exactly what it will mint. The old bare forms are kept alongside: the probe
	// fires on the family NAME, so a mere mention must still move us.
	const squat = ['pie-wedge-2-1', 'pie-wedge-2-2', 'pie-wedge-1', 'chart-spine-1']
		.map((id) => `<radialGradient id="${id}"><stop offset="0%" stop-color="#ff0000"/></radialGradient>`)
		.join('');
	const deck = `---\ntheme: indaco\n---\n\n# Shared deck\n\n<svg width="1" height="1" aria-hidden="true"><defs>${squat}</defs></svg>\n\n---\n\n<!-- _class: piechart -->\n\n## Revenue mix.\n\n- Onboarding \`34\`\n- Pricing \`26\`\n- Support \`22\`\n- Integrations \`18\`\n`;

	let previous = null;
	for (let render = 1; render <= 4; render += 1) {
		const html = e.render(deck, 'indaco').html;
		const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
		const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
		assert.deepEqual(dupes, [], `render ${render} has duplicate ids, so the squat landed: ${dupes.join(', ')}`);
		// Fixture guard: if the raw <svg> stopped surviving to the output there would be nothing to
		// collide with and the assertion above would pass vacuously.
		assert.ok(html.includes('id="pie-wedge-2-1"'), 'fixture broken: the squatting defs did not reach the output');
		assert.ok(/id="lat-r0-pie-wedge-\d+-\d+"/.test(html), 'the engine did not shift its own namespace');
		if (previous !== null) assert.equal(html, previous, `render ${render} differs from the one before — the guard is not deterministic`);
		previous = html;
	}
});

test('engine: ids stay unique WITHIN a render (the trap the sequences exist for)', () => {
	// Per-render reset must not reintroduce duplicate ids in one document: a second `#pie-wedge-1`
	// would make every reference resolve to the first gradient, so wedges would share a fill.
	const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
	const html = engine.render(src, 'lattice').html;
	const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
	const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
	assert.deepEqual([...new Set(dupes)], [], `duplicate ids in one rendered document: ${[...new Set(dupes)].join(', ')}`);
});
