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
// plugins) every time. It is a roughly fixed cost, so it is worth 17% of a one-slide render, 3% of a
// 40-slide one and nothing on a 117-slide one (measured; see the note in lib/engine/index.js). That
// makes it the only lever that can put the preview's typing path BELOW where it was rather than
// level with it: typing must re-render the edited slide, so no cache can do less work than one
// render — the only way to win is to make that render cheaper.
//
// The risk is precisely one thing: state surviving inside the instance between renders. These
// tests are the byte-comparison that would catch it, and they are plain byte comparisons only
// because the engine is now deterministic (render-scoped `<defs>` id sequences — see
// test/unit/core/render-ids.test.js). Against the previous renderer this file would have needed a
// normalizer over the drifting ids, which would have hidden real leakage of the same shape.
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

// A bare engine has NO themes registered, so `theme:` changes neither the html nor the css and any
// assertion about it is vacuous. (`size:` resolves against the engine's own registry and needs no
// theme.) These two tests therefore build their own engine and register the real bundle + a
// palette, the way lattice-emulator.js does before it renders.
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

test('parser memo: a geometry change across a theme re-registration does NOT serve a stale parser', () => {
	// THE REGRESSION THE ADVERSARIAL TRIO FOUND. `buildMd` resolves the geometry and bakes the
	// resulting orientation + family into the slide pipeline. Live surfaces re-register themes on
	// EVERY render (addThemes overwrites by name so an edited theme takes effect at once), so a key
	// covering only `globalBase` hit the memo after the geometry changed and served a parser built
	// against the OLD one — width/height updated while data-orientation / data-family did not,
	// silently disabling every family-keyed reflow rule in the cascade.
	//
	// The VEHICLE changed on 2026-08-16: geometry used to come from an `@size` the theme itself
	// declared, so the original fixture re-registered a theme with an edited `@size`. The engine now
	// owns the registry (lib/engine/sizes.js) and a stylesheet cannot redefine the page box, so the
	// geometry change comes through the deck's `size:` directive instead. The invariant under test —
	// the memo key covers the RESOLVED GEOMETRY, and store churn does not mask a change to it — is
	// unchanged. See engineering/decisions/2026-08-16-size-registry-ownership.md.
	const { createEngine } = require('../../../lib/engine/index.js');
	const base = fs.readFileSync(path.join(ROOT, 'dist/lattice-default.css'), 'utf8');
	const themeCss = '/*! @theme flip */\n:root{--x:1}';
	const e = createEngine();
	e.addThemes([base, themeCss]);
	const body = '# One\n\n---\n\n## Two\n';
	const wideDeck = `---\ntheme: flip\nsize: hd\n---\n\n${body}`;
	const tallDeck = `---\ntheme: flip\nsize: story\n---\n\n${body}`;

	const wide = e.render(wideDeck, 'flip');
	e.addThemes([themeCss]); // the live host re-registers on every render
	const tall = e.render(tallDeck, 'flip');

	// Fixture guard: if `size:` stopped resolving, everything below passes vacuously.
	assert.notEqual(`${tall.width}x${tall.height}`, `${wide.width}x${wide.height}`, 'fixture broken: the size directive did not change the resolved geometry');
	// The real assertion: a fresh engine rendering the same deck is the reference.
	const ref = createEngine();
	ref.addThemes([base, themeCss]);
	assert.equal(tall.html, ref.render(tallDeck, 'flip').html, 'a re-registered theme served a stale parser — the memo key is missing the resolved geometry');
});

test('parser memo: registering the deck theme AFTER a first render does NOT serve a stale parser', () => {
	// The other half of the same staleness class, and the one a live host hits on startup: the first
	// render happens before the theme lands, the theme arrives, and the second render must match a
	// render that had the theme all along. Found by the red team.
	//
	// This used to turn on GEOMETRY — an unknown theme baked the HD default, and the late-arriving
	// theme's own `@size` changed the box. Geometry no longer depends on the theme at all (the
	// registry owns it), so what is left to protect is the theme axis of the memo key: a late
	// registration must not serve a parser built while the theme was missing.
	const { createEngine } = require('../../../lib/engine/index.js');
	const base = fs.readFileSync(path.join(ROOT, 'dist/lattice-default.css'), 'utf8');
	const late = '/*! @theme late */\n/* the palette arrives after the first render */\nsection{--x:1}';
	const deck = '---\ntheme: late\nsize: story\n---\n\n# One\n\n---\n\n## Two\n';

	const e = createEngine();
	e.addThemes([base]);
	e.render(deck, 'late'); // theme not registered yet
	e.addThemes([late]);
	const after = e.render(deck, 'late');

	const ref = createEngine();
	ref.addThemes([base, late]);
	const want = ref.render(deck, 'late');
	assert.match(want.html, /data-orientation="portrait"/, 'fixture broken: the reference render is not portrait');
	assert.equal(after.html, want.html, 'a late-registered theme served a parser built before the theme landed');
	assert.equal(after.css, want.css, 'a late-registered theme served stale css');
});

// ── Counting how many parsers actually get built ────────────────────────────────────────────
// Two of the tests below assert about memo HITS and MISSES, which no output byte reveals: a hit and
// a miss render identically (that is the point of the memo). So they count `new MarkdownIt` through
// a subclass installed in the module cache before a fresh engine is required. Without this, "the
// parser stayed warm" is unassertable and "112 decks went through one parser" is unverifiable —
// which is how the cross-document test below came to be vacuous for ~96 of them.
function countingEngine() {
	const mdPath = require.resolve('markdown-it');
	const real = require('markdown-it');
	const state = { builds: 0 };
	class Counting extends real {
		constructor(...a) {
			super(...a);
			state.builds++;
		}
	}
	const saved = require.cache[mdPath].exports;
	require.cache[mdPath].exports = Counting;
	let e;
	try {
		const { createEngine } = freshEngine();
		e = createEngine();
	} finally {
		require.cache[mdPath].exports = saved;
	}
	return { engine: e, state };
}

test('parser memo: re-registering byte-identical theme css keeps the parser warm', () => {
	// WHY THIS IS A TEST AND NOT AN OPTIMIZATION NOTE. The live-theme surfaces
	// (single-slide-render.ts, theme-studio.js) call `addThemes` with the SAME css before EVERY
	// render, deliberately — a `hasTheme()` guard would keep rendering stale CSS after an edit. So a
	// memo key that invalidated on store MUTATION (a revision counter — the first repair attempted
	// here) would miss 100% of the time on exactly the surface the memo exists for, handing back
	// ~2ms of parser rebuild per keystroke. Keying on the RESOLVED GEOMETRY — the only thing
	// `buildMd` reads from the store — invalidates precisely when the baked stamps would change.
	const { engine: e, state } = countingEngine();
	const base = fs.readFileSync(path.join(ROOT, 'dist/lattice-default.css'), 'utf8');
	const css = '/*! @theme warm */\n:root{--x:1}';
	const deck = '---\ntheme: warm\nsize: hd\n---\n\n# One\n';
	e.addThemes([base, css]);
	e.render(deck, 'warm');
	const afterFirst = state.builds;
	assert.ok(afterFirst > 0, 'fixture broken: the counting subclass never saw a construction');
	for (let i = 0; i < 5; i++) {
		e.addThemes([css]); // exactly what a live editing host does every render
		e.render(deck, 'warm');
	}
	assert.equal(state.builds, afterFirst, 'a no-op theme re-registration rebuilt the parser — the memo key is invalidating on mutation rather than on geometry');

	// And the converse, so this is not just "the key ignores the store": a real geometry change must
	// still rebuild. It arrives through the deck's `size:` directive now that the engine owns the
	// registry rather than through an edited `@size` in the theme.
	e.addThemes([css]);
	e.render('---\ntheme: warm\nsize: story\n---\n\n# One\n', 'warm');
	assert.ok(state.builds > afterFirst, 'a changed size did not rebuild the parser');
});

test('parser memo: many DIFFERENT documents through ONE parser match cold renders', () => {
	// The cross-document leak test, made non-vacuous. The obvious version ("render every deck
	// through one warm engine") barely tests reuse at all: the memo key includes the global
	// directives, so 112 committed decks produce ~100 distinct keys and the memo is REBUILT for
	// nearly every one — the comparison then proves "same deck twice", not "deck A then deck B on
	// one parser". Stripping the front matter collapses them onto a single key, which the build
	// counter below asserts rather than assumes. Found by the red team.
	const FM = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)?/;
	const bodies = DECKS().map(([name, src]) => [name, src.replace(FM, '')]);
	const { engine: e, state } = countingEngine();
	const drifted = [];
	for (const [name, src] of bodies) {
		const warm = e.render(src, 'lattice').html;
		const cold = freshEngine().render(src, 'lattice').html;
		if (warm !== cold) drifted.push(name);
	}
	assert.deepEqual(drifted, [], `documents where a reused parser differs from a cold one: ${drifted.join(', ')}`);
	assert.equal(state.builds, 1, `expected all ${bodies.length} documents to share one parser; it was rebuilt ${state.builds} times, so this test did not exercise reuse`);
});
