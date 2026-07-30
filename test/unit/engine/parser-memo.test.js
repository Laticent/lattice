const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const engine = require('../../../lib/engine/index.js');

const ROOT = path.join(__dirname, '../../..');

// THE PARSER MEMO'S GUARD.
//
// `renderHtml` reuses its markdown-it instance across renders instead of rebuilding it (a fresh
// parser, geometry resolution, the slide pipeline, math, the Mermaid highlight grammar and 15
// plugins) every time. That is ~0.3ms of a 0.44ms one-slide render, and it is the only lever that
// makes the preview's typing path faster than it was rather than merely level: typing must
// re-render the edited slide, so no cache can do less work than one render — the only way to win
// is to make that render cheaper.
//
// The risk is precisely one thing: state surviving inside the instance between renders. These
// tests are the byte-comparison that would catch it. They are only meaningful because the engine
// is now deterministic (render-scoped `<defs>` id sequences — see test/unit/core/render-ids.test.js);
// against the previous non-deterministic renderer this whole file would have failed spuriously,
// and the tempting repair would have been a normalizer that also hid real leakage.
//
// A leak would show up here as a SECOND render differing from the first, or as a render differing
// from one produced by a fresh engine instance (which has its own, unpopulated memo).

/** A fresh engine module instance, so its parser memo starts empty. */
function freshEngine() {
	delete require.cache[require.resolve('../../../lib/engine/index.js')];
	return require('../../../lib/engine/index.js');
}

const DECKS = () => {
	const out = [['gallery', fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8')]];
	const dir = path.join(ROOT, 'examples');
	for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) out.push([f, fs.readFileSync(path.join(dir, f), 'utf8')]);
	return out;
};

test('parser memo: a reused parser renders byte-identically to a freshly built one', () => {
	// The core property. `a` populates the memo; `b` reuses it. A cross-render leak inside the
	// markdown-it instance — a ruler holding document state, a plugin accumulating — diverges here.
	const drifted = [];
	for (const [name, src] of DECKS()) {
		const a = engine.render(src, 'lattice').html;
		const b = engine.render(src, 'lattice').html;
		if (a !== b) drifted.push(name);
	}
	assert.deepEqual(drifted, [], `decks whose memoized render differs from the first: ${drifted.join(', ')}`);
});

test('parser memo: output matches an engine whose memo never warmed', () => {
	// Stronger than the above: compare against a SEPARATE engine instance that renders each deck
	// exactly once, so its parser is always freshly built. Equality means the memo is invisible.
	const cold = freshEngine();
	const warm = freshEngine();
	// Warm one instance thoroughly so its memo is populated and churned.
	const decks = DECKS();
	for (const [, src] of decks) warm.render(src, 'lattice');
	const drifted = [];
	for (const [name, src] of decks) {
		const coldOut = freshEngine().render(src, 'lattice').html; // brand-new instance per deck
		if (warm.render(src, 'lattice').html !== coldOut) drifted.push(name);
	}
	assert.equal(typeof cold.render, 'function');
	assert.deepEqual(drifted, [], `decks where a warm engine differs from a cold one: ${drifted.join(', ')}`);
});

// A bare engine has NO themes registered, and named sizes (`story`, `portrait`, `4K`) come from
// `@size` declarations inside theme CSS — so without registering one, `theme:` and `size:` change
// neither the html nor the geometry, and any assertion about them is vacuous. These two tests
// therefore build their own engine and register the real bundle + a palette, the way
// lattice-emulator.js does before it renders.
function themedEngine() {
	const { createEngine } = require('../../../lib/engine/index.js');
	const e = createEngine();
	e.addThemes([fs.readFileSync(path.join(ROOT, 'dist/lattice-default.css'), 'utf8'), fs.readFileSync(path.join(ROOT, 'themes/indaco.css'), 'utf8')]);
	return e;
}

test('parser memo: a size directive rebuilds the parser (orientation/family stamps)', () => {
	// `buildMd` bakes geometry → orientation + family into the slide pipeline, and the pipeline
	// stamps them on every section. A memo key that ignored `size` would render a portrait deck
	// with a landscape deck's stamps — the exact class of bug a stale parser causes.
	const e = themedEngine();
	const body = '# One\n\n---\n\n## Two\n';
	const wide = e.render(`---\nsize: 16:9\n---\n\n${body}`, 'indaco');
	const tall = e.render(`---\nsize: story\n---\n\n${body}`, 'indaco');
	const wideAgain = e.render(`---\nsize: 16:9\n---\n\n${body}`, 'indaco');
	// Guard the fixture itself: if `size` stopped resolving, the rest would pass vacuously.
	assert.notEqual(`${tall.width}x${tall.height}`, `${wide.width}x${wide.height}`, 'fixture broken: `size: story` did not change the resolved geometry, so this test proves nothing');
	assert.notEqual(wide.html, tall.html, 'a size change did not change the html — the memo key misses size');
	assert.equal(wide.html, wideAgain.html, 'a size round-trip changed the output — the memo is serving a stale parser');
	assert.match(tall.html, /data-orientation="/, 'the portrait render lost its orientation stamp');
});

test('parser memo: interleaving two themes does not leak one into the other', () => {
	const e = themedEngine();
	const src = '---\npaginate: true\n---\n\n# One\n\n---\n\n## Two\n';
	const first = e.render(src, 'indaco');
	e.render(src, 'lattice');
	const again = e.render(src, 'indaco');
	assert.equal(first.html, again.html, 'a theme round-trip changed the html — the memo key misses the theme');
	assert.equal(first.css, again.css, 'a theme round-trip changed the css');
});
