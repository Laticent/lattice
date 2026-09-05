/**
 * The METAMORPHIC property for reader-view projection, over GENERATED decks. #2053.
 *
 * WHY THIS SHAPE. Non-disclosure is a hyperproperty — a 2-safety property in the sense of Clarkson
 * & Schneider: it is not a property of one artifact but of a RELATION between two runs that differ
 * only in the secret. You cannot establish it by looking at one output, which is why every attempt
 * to detect danger by inspecting the shipped file lost. `crossSlideDrift` is this repo's independent
 * arrival at SELF-COMPOSITION — run the pipeline twice on related inputs, compare — and this file is
 * the metamorphic relation it implements, exercised over decks a generator invents rather than the
 * ones we happened to write:
 *
 *     for every kept slide s:   render(project(D, S))[s]  ≡  render(D)[s]
 *
 * WHAT IT FIXES ABOUT THE EXISTING CORPUS SWEEP. That sweep runs 147 real decks under 6 fixed
 * shapes, and it hands `crossSlideDrift` the SAME string that function builds its own proxy from —
 * so its hop 2 compares a render against itself, 882 times, and deleting both hop-2 comparisons
 * leaves every shape green. It also cannot exercise the projection's own edits (tag pruning,
 * registry pruning, caption projection), because those decks declare no views. The decks here
 * DECLARE views and go through the real `projectForExport`, so hop 2 has two different documents to
 * compare and the pruning is inside the subject rather than outside it.
 *
 * AND IT HAS A FAILING ARM, which is the half that matters. A checker that never fires is
 * indistinguishable from one that cannot. The second property plants a genuine cross-slide
 * dependency on a WITHHELD slide and requires the check to catch it — so the suite proves the
 * relation can be violated, not merely that it holds on decks we chose.
 *
 * DETERMINISTIC BY CONSTRUCTION. The generator is seeded, and a failure prints its seed, so any
 * counterexample replays exactly. A property test whose failures cannot be reproduced is a flake
 * generator, not evidence.
 *
 * WHAT IT DOES AND DOES NOT COVER, mutation-proved rather than claimed:
 *   · Reverting the projection to DELETE withheld slides instead of holding their position kills two
 *     of the three arms below. That is the regression this file exists to prevent.
 *   · Stripping the hole's hiding CLASS — so the slot stays but the engine no longer hides it —
 *     leaves all three arms GREEN, and that is correct. This file tests FIDELITY, a property of the
 *     slides that ship. Whether a hole is hidden is a different question, answered by `holeDrift`
 *     and by the `form: off` arm in the integration channels suite. Recorded so nobody reads a green
 *     run here as covering that.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { crossSlideDrift, projectForExport } = require('../../../lib/core/lens-export.mjs');
const { approvalHash, applyTag, emitRegistry } = require('@workwel/lente');
const { splitSlideChunks } = require('../../../lib/core/slide-boundaries.mjs');
const engine = require('../../../lib/engine/index.js');

const render = (src) => engine.render(src).html;

/** mulberry32 — a tiny seeded PRNG, so every case is reproducible from its seed alone. */
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Slide bodies that stress the SPLITTER, since a chunk that re-splits differently is the failure
 * mode holes exist to prevent. Each is a shape that has broken a projection at some point: a fenced
 * block containing a separator, a setext heading, a tight list, a body with no trailing newline,
 * a comment-only slide, a heading pair (the default split mode cuts on the second heading).
 */
const BODIES = [
	(i) => `# Slide ${i}\n\nBody of slide ${i}.`,
	(i) => `# Slide ${i}\n\n\`\`\`\n---\nnot a separator\n\`\`\`\n\nBody of slide ${i}.`,
	(i) => `Slide ${i}\n=======\n\nBody of slide ${i}.`,
	(i) => `# Slide ${i}\n\n- one\n- two\n- three`,
	(i) => `# Slide ${i}\n\nBody of slide ${i}.\n\n## Second heading ${i}\n\nMore.`,
	(i) => `<!-- a comment-only slide ${i} -->`,
	(i) => `# Slide ${i}\n\n> quoted ${i}\n\n| a | b |\n|---|---|\n| ${i} | ${i} |`,
];

/** Author CSS drawn from the channel families the observation table names. */
const CSS_FAMILIES = [
	() => '',
	(r) => `<style>section:nth-of-type(${1 + Math.floor(r() * 6)}) p { color: rgb(1,2,3) }</style>\n`,
	(r) => `<style>section:nth-child(${1 + Math.floor(r() * 6)}) h1 { outline-color: rgb(4,5,6) }</style>\n`,
	() => '<style>section:last-of-type h1 { text-decoration-color: rgb(7,8,9) }</style>\n',
	() => '<style>section { counter-increment: q } section h1::after { content: counter(q) }</style>\n',
	() => '<style>section:nth-of-type(2) + section p { background-color: rgb(9,9,9) }</style>\n',
];

/** Build a deck that really declares a `brief` view, with a real registry and real tags. */
function makeDeck(r, { plant = null, linkRef = false } = {}) {
	const n = 3 + Math.floor(r() * 8); // 3..10 slides
	const bodies = Array.from({ length: n }, (_, i) => BODIES[Math.floor(r() * BODIES.length)](i + 1));
	// A non-empty PROPER subset, so the view always withholds something.
	let kept = bodies.map((_, i) => i).filter(() => r() < 0.55);
	if (!kept.length) kept = [0];
	if (kept.length === n) kept = kept.slice(0, n - 1);
	const withheld = bodies.map((_, i) => i).filter((i) => !kept.includes(i));

	// The planted dependency goes on a WITHHELD slide and reaches the ones that ship.
	if (plant && withheld.length) {
		const at = withheld[Math.floor(r() * withheld.length)];
		bodies[at] = `${plant}\n\n${bodies[at]}`;
	}
	// A LINK REFERENCE DEFINITION is the plant that fires the OTHER channel. markdown-it resolves
	// `[text][ref]` against definitions collected across the WHOLE document, so a definition on a
	// withheld slide reaches every kept slide that uses it — and when the slide goes, the kept slides'
	// own MARKUP changes: `<a href>` becomes the literal text `[text][lref]`. Nothing about the
	// document's `<style>`/`<script>`/`<link>` set moved, so `documentGlobals` is blind to it and the
	// catch has to come from the per-section comparison. That distinction is the point of this mode:
	// the `<style>` plant above is caught by the global channel, so on its own it proves only that
	// ONE of the two channels works.
	if (linkRef && withheld.length) {
		const at = withheld[Math.floor(r() * withheld.length)];
		bodies[at] = `${bodies[at]}\n\n[lref]: https://example.com/reference`;
		for (const i of kept) bodies[i] = `${bodies[i]}\n\nSee [the reference][lref].`;
	}

	// The CSS is prepended to the BODY, so it lands inside chunk 0 — which means a view that
	// withholds slide 0 genuinely loses a document-wide stylesheet, and the correct answer is a
	// refusal, not silence. The generator reports this so the property can require the right one.
	const css = CSS_FAMILIES[Math.floor(r() * CSS_FAMILIES.length)](r);
	const chunks = bodies.map((b) => `\n<!-- _class: content -->\n\n${b}\n`);
	const keptSet = new Set(kept);
	const tagged = chunks.map((s, i) => applyTag(s, 'brief', keptSet.has(i), 'none'));
	const body = css + tagged.join('\n---\n') + '\n';
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, { id: 'brief', label: 'Brief', base: 'none' }], default: 'full' };
	const reg = {
		lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(splitSlideChunks(body).chunks, bare, l.id) })),
		default: 'full',
	};
	let head = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}`;
	if (!head.endsWith('\n')) head += '\n';
	return { src: `${head}---\n${body}`, kept, withheld, n, hasGlobalCss: css !== '' };
}

/**
 * WHAT THIS FILE ACTUALLY OBSERVES, measured by deleting each of `crossSlideDrift`'s five
 * comparisons in turn and re-running. The first draft of this file claimed its decks gave hop 2 "two
 * different documents to compare"; re-derived, every drift it saw came through `documentGlobals`, and
 * BOTH per-section comparisons could be deleted with all three arms green. The arms below were added
 * until the table has no blank rows:
 *
 *   lens-export.mjs   comparison                                    killed by
 *   authoredOrder(full) vs (proxy)      proxy integrity, hop 1      lens-export.test.js (injected renderer)
 *   documentGlobals(full) vs (proxy)    document channel, hop 1     arms 1 and 2 here
 *   documentGlobals(proxy) vs (ship)    document channel, hop 2     arm 4 here (bent render)
 *   before vs middle, per section       section channel, hop 1      arm 3 here (link reference plant)
 *   middleText vs afterText, per sect.  section channel, hop 2      arm 4 here (bent render)
 *
 * The two hop-2 rows are bent rather than generated, and that is not a shortcut: hop 2 asks whether
 * the STAND-IN is a faithful model of what ships, and the two only disagree when the projection or
 * the stand-in is itself broken — which no well-formed generated deck produces. Injecting the
 * divergence is the honest way to prove the comparison is wired and read.
 */
test.describe('the metamorphic relation, over generated decks', () => {
	test('the check fires EXACTLY when the deck has cross-slide state, and is silent otherwise', () => {
		// Two directions in one sweep, which is what makes this a property rather than a smoke test.
		//
		// The generator prepends its author CSS to the body, so the stylesheet lives on slide 0. That
		// gives two populations and they must get opposite answers:
		//
		//   · slide 0 WITHHELD and the deck has CSS → dropping it removes a document-wide stylesheet
		//     from every slide that ships. Fidelity is genuinely broken, and the export must REFUSE.
		//     A silent pass here is the leak the whole check exists to stop.
		//   · everything else → nothing a kept slide depends on has gone. Silence is the right answer,
		//     and a refusal would be a false alarm that takes reader views away from a correct deck.
		//
		// The first run of this test failed on seeds 3, 6 and 9 — all `channel: style, hop: 1` — and
		// that was the checker being RIGHT and the property being wrong. Recording it because the same
		// mistake (reading a true positive as a regression) is how a good guard gets weakened.
		const wrongSilence = [];
		const falseAlarm = [];
		let refusals = 0;
		let quiet = 0;
		for (let seed = 1; seed <= 120; seed++) {
			const r = rng(seed);
			const { src, kept, hasGlobalCss } = makeDeck(r);
			const out = projectForExport(src, ['brief']);
			// A refusal from the PROJECTION (an unsplittable body, say) is the fail-closed direction and
			// not a violation — it never wrote a file.
			if (!out.ok) continue;
			const drift = crossSlideDrift(src, out.source, kept, render);
			const shouldFire = hasGlobalCss && !kept.includes(0);
			if (shouldFire && !drift) wrongSilence.push({ seed, kept });
			if (!shouldFire && drift) falseAlarm.push({ seed, drift });
			if (shouldFire) refusals += 1; else quiet += 1;
		}
		assert.deepEqual(wrongSilence, [], `a withheld slide's stylesheet reached the kept slides unnoticed — replay with rng(seed): ${JSON.stringify(wrongSilence.slice(0, 3))}`);
		assert.deepEqual(falseAlarm, [], `a correct deck was refused — replay with rng(seed): ${JSON.stringify(falseAlarm.slice(0, 3))}`);
		// Neither population may be empty, or one half of the property proved nothing.
		assert.ok(refusals >= 5, `too few decks that MUST refuse to judge (${refusals})`);
		assert.ok(quiet >= 20, `too few decks that must stay quiet to judge (${quiet})`);
	});

	test('and the check CAN fail: a dependency planted on a WITHHELD slide is caught', () => {
		// The arm that proves the relation is checkable rather than vacuous. A `<style>` on a slide the
		// view drops reaches every slide it keeps, so removing that slide changes what the kept slides
		// show — exactly the class `crossSlideDrift` exists for. If this ever passes silently, the
		// check has stopped checking and the sweep above is worthless.
		let caught = 0;
		let eligible = 0;
		for (let seed = 501; seed <= 560; seed++) {
			const r = rng(seed);
			const { src, kept } = makeDeck(r, { plant: '<style>p { color: rgb(212,13,44) }</style>' });
			const out = projectForExport(src, ['brief']);
			if (!out.ok) continue;
			eligible += 1;
			if (crossSlideDrift(src, out.source, kept, render)) caught += 1;
		}
		assert.ok(eligible >= 20, `the generator produced too few projectable decks to judge (${eligible})`);
		assert.equal(caught, eligible, `every planted cross-slide dependency must be caught (${caught}/${eligible})`);
	});

	test('and it CAN fail through the SECTION channel too, not only the document one', () => {
		// The arm above plants a `<style>`, which `documentGlobals` catches — so on its own it proves
		// one channel works and says nothing about the other. Measured before this arm existed: every
		// drift the whole file observed came through `documentGlobals`, and BOTH per-section
		// comparisons could be deleted with all three arms green. A link reference definition is the
		// plant that fires the other one: the stylesheet set is untouched and a KEPT slide's markup
		// changes, `<a href>` degrading to the literal text `[the reference][lref]`.
		let caught = 0;
		let eligible = 0;
		let viaSection = 0;
		for (let seed = 601; seed <= 660; seed++) {
			const r = rng(seed);
			const { src, kept } = makeDeck(r, { linkRef: true });
			const out = projectForExport(src, ['brief']);
			if (!out.ok) continue;
			// The generator's own CSS lands on slide 0, so a deck that ALSO withholds slide 0 would be
			// caught by the document channel and prove nothing here. Judge only the decks where the
			// section channel is the only thing that can fire.
			if (!kept.includes(0)) continue;
			eligible += 1;
			const drift = crossSlideDrift(src, out.source, kept, render);
			if (drift) caught += 1;
			if (drift?.channel === 'section') viaSection += 1;
		}
		assert.ok(eligible >= 15, `too few decks where the section channel is the only one that can fire (${eligible})`);
		assert.equal(caught, eligible, `every planted link reference must be caught (${caught}/${eligible})`);
		assert.equal(viaSection, eligible, `and caught through the SECTION channel, not the document one (${viaSection}/${eligible})`);
	});

	test('hop 2 is observed: a stand-in that does not match what SHIPS is reported', () => {
		// The two hops answer different questions and the file used to prove only the first. Hop 1 asks
		// whether the withheld slides were contributing anything; hop 2 asks whether the STAND-IN it
		// asked that of is a faithful model of the document that actually ships — and no generated deck
		// makes those two disagree, because they only disagree when the projection or the stand-in is
		// itself broken. So the divergence is injected: a render that returns one extra character
		// inside a kept section for the PROJECTED source only. Deleting the hop-2 comparison makes this
		// arm fail, which is the property it exists to hold.
		const r = rng(7);
		const { src, kept } = makeDeck(r);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'the fixture deck must project');
		const bent = (source) => {
			const html = render(source);
			// Only the shipped document is bent, and only inside a kept slide's body — so hop 1
			// (full vs stand-in) still agrees and hop 2 is the only comparison that can see it.
			return source === out.source ? html.replace('</p>', 'INJECTED</p>') : html;
		};
		assert.equal(crossSlideDrift(src, out.source, kept, render), null, 'the unbent deck is quiet');
		const drift = crossSlideDrift(src, out.source, kept, bent);
		assert.ok(drift, 'a stand-in that disagrees with what ships is a finding');
		assert.equal(drift.hop, 2, 'reported as hop 2 — the stand-in vs the artifact');
		assert.equal(drift.channel, 'section', 'through the per-section comparison');

		// Hop 2 has TWO comparisons and the one above reaches only the second. This bends the
		// DOCUMENT channel instead — a `<style>` appended outside every section, so no slide's markup
		// moves and only `documentGlobals(proxy) !== documentGlobals(ship)` can see it. Without this,
		// that line could be deleted with every other arm in the file still green.
		const bentGlobal = (source) => {
			const html = render(source);
			return source === out.source ? `${html}<style>/* only in the shipped document */</style>` : html;
		};
		const globalDrift = crossSlideDrift(src, out.source, kept, bentGlobal);
		assert.ok(globalDrift, 'a stand-in whose STYLESHEET SET disagrees with what ships is a finding');
		assert.equal(globalDrift.hop, 2);
		assert.equal(globalDrift.channel, 'style', 'through the document channel');
	});

	test('the projection always re-splits into the authored number of slots', () => {
		// Holes hold position only if the emitted body still cuts into exactly the slides it claims.
		// This is the invariant the whole design rests on, checked against the repo's own splitter over
		// generated shapes rather than the handful we thought to write down.
		for (let seed = 900; seed <= 1000; seed++) {
			const r = rng(seed);
			const { src, n } = makeDeck(r);
			const out = projectForExport(src, ['brief']);
			if (!out.ok) continue;
			assert.equal(out.total, n, `seed ${seed}: the projection reports the authored slide count`);
			const chunks = splitSlideChunks(out.source.slice(out.source.indexOf('\n---\n', 4) + 5)).chunks;
			assert.equal(chunks.length, n, `seed ${seed}: the emitted body re-splits into ${n} slots`);
		}
	});
});
