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

test('render-ids: a finished render RELEASES its slide scope', () => {
	// MODULE STATE, so setting it is only half the job. `applyToRenderedHtml` walks the sections and
	// scopes each one; if it never leaves scope, the NEXT mint in this process inherits the last
	// section number of whatever document was rendered before it. The browser runtime's DOM pass is
	// exactly that next caller — it never calls `resetRenderIds`, and it is supposed to get the bare
	// document-start ordinal because there is no deck there to be positioned within.
	//
	// Measured before the release existed: a mint straight after a two-section render returned
	// `2-3`. Same class as this module's own "renderHtml must not be RE-ENTERED" note — per-render
	// state has to be released, not just set.
	const { createEngine } = require('../../../lib/engine/index.js');
	const e = createEngine();
	e.render('# A\n\n---\n\n<!-- _class: piechart -->\n\n## Pie\n\n- Alpha 40\n- Beta 60\n', 'lattice');
	assert.equal(nextRenderSeq('pie-wedge'), '1', 'the slide scope leaked past the end of the render');
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

test('render-ids: a 10-digit prefix cannot be forced past the probe', () => {
  // Red team. `\d{1,9}` capped what the probe could SEE, so mentioning `lat-r999999999-` made
  // `max+1` return `lat-r1000000000-` — ten digits, structurally invisible to the same probe. Squat
  // that and SVG's first-def-wins paints the real chart's wedge with the author's fill while the
  // legend still reads correctly: the "chart that lies". The one candidate the guard could not test
  // was the one it returned, which is precisely the failure its own header claims to have closed.
  resetRenderIds('<span data-x="lat-r999999999-pie-wedge"></span><radialGradient id="lat-r1000000000-pie-wedge-2-1"/>');
  assert.notEqual(renderIdPrefix(), 'lat-r1000000000-', 'returned the one candidate it could not see');
  assert.ok(renderIdPrefix().startsWith('lat-r'), 'still a lat-r namespace');
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
	// THE SQUAT IS HARVESTED FROM A REAL RENDER, NOT HARD-CODED. A previous version wrote
	// `pie-wedge-2-1` with the comment "the chart lives on slide 2 of this deck" — so adding ONE slide
	// to the fixture moved the engine to `pie-wedge-3-1`, the squat stopped colliding, and the
	// duplicate-id assertion below would pass with the guard removed. That is the same vacuous-fixture
	// defect this test was rewritten to fix, reintroduced with a SHORTER fuse: the old fixture rotted
	// when the id shape changed (rare); that one rotted when anyone edited the deck (routine).
	// Render once with no squat, take the ids the engine actually minted, squat exactly those.
	const probeDeck = `---\ntheme: indaco\n---\n\n# Shared deck\n\n---\n\n<!-- _class: piechart -->\n\n## Revenue mix.\n\n- Onboarding \`34\`\n- Pricing \`26\`\n- Support \`22\`\n- Integrations \`18\`\n`;
	const minted = [...e.render(probeDeck, 'indaco').html.matchAll(/\sid="((?:lat-)?[a-z][\w-]*-\d+(?:-\d+)?)"/g)].map((m) => m[1]);
	assert.ok(minted.length >= 2, `fixture broken: the probe render minted ${minted.length} ids`);
	// ESCAPED, and asserted quote-free first. The harvest pattern above cannot yield a `"` — but that
	// is a property of a regex several lines away, which is exactly the kind of reasoning CodeQL is
	// right not to accept (it flagged this line as incomplete attribute sanitization). The assertion
	// makes the invariant local and would fire the day someone loosens the harvest; the escape makes
	// the fixture well-formed even if they do.
	const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
	for (const id of minted) assert.ok(!/["<>&]/.test(id), `harvested id is not attribute-safe: ${id}`);
	const squat = minted
		.map((id) => `<radialGradient id="${attr(id)}"><stop offset="0%" stop-color="#ff0000"/></radialGradient>`)
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
		for (const id of minted) assert.ok(html.includes(`id="${id}"`), `fixture broken: the squat on ${id} never reached the output`);
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
