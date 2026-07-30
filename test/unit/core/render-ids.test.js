const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { nextRenderSeq, resetRenderIds } = require('../../../lib/core/render-ids');
const engine = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '../../..');

// RENDER DETERMINISM — the property every render-cache design is guarded by, and which the
// engine did not have.
//
// Several chart kernels mint SVG `<defs>` ids (gradients, spines) from a shared sequence, because
// a duplicate id inside one document makes every reference resolve to the first one. Those
// sequences used to be MODULE-level, i.e. scoped to the process rather than the render, so they
// kept climbing: rendering the same deck twice in one process produced different bytes — measured
// at 48 of 112 committed decks (`gantt-fill-pass-1` → `-2`, `pie-wedge-1` → `-6`, `radar-area-1`
// → `-4`). Nothing broke visibly, because ids and their references are minted together, which is
// exactly why it survived unnoticed.
//
// It matters because `engineering/decisions/2026-07-15-incremental-per-slide-render-cache.md`
// guards its whole design with an `incrementalRender === wholeRender` property test, and that
// test is unwritable against a non-deterministic renderer: it fails spuriously, and the obvious
// repair is a normalizer that also hides the real drift the test exists to catch.

test('render-ids: sequences are per-render, not per-process', () => {
	resetRenderIds();
	assert.equal(nextRenderSeq('a'), 1);
	assert.equal(nextRenderSeq('a'), 2);
	assert.equal(nextRenderSeq('b'), 1, 'families are independent');
	resetRenderIds();
	assert.equal(nextRenderSeq('a'), 1, 'reset starts a fresh id space');
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

test('engine: ids stay unique WITHIN a render (the trap the sequences exist for)', () => {
	// Per-render reset must not reintroduce duplicate ids in one document: a second `#pie-wedge-1`
	// would make every reference resolve to the first gradient, so wedges would share a fill.
	const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
	const html = engine.render(src, 'lattice').html;
	const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
	const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
	assert.deepEqual([...new Set(dupes)], [], `duplicate ids in one rendered document: ${[...new Set(dupes)].join(', ')}`);
});
