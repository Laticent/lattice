/**
 * The contract for lib/core/lens-export.mjs — the projection an EXPORT applies.
 *
 * THE ORACLE IS THE ENGINE, not a re-derivation. "Did the projection keep four
 * slides?" is only worth asking if the answer is the number of `<section>`
 * elements the engine actually renders from the projected source — which is the
 * number of PAGES a reader gets. Counting the kernel's own `kept` array against
 * the kernel's own splitter would be green by construction, and would not have
 * caught the separator bug this suite's `***` case covers: re-joining slides
 * under a canonical `---` renders identically for a `---` deck and merges two
 * slides into one for a `***` deck.
 *
 * The five refusal reasons are enumerated rather than sampled. They are the
 * whole point of the feature — a view is often a deliberate REDUCTION, so a
 * silent fall-through to the full deck hands the reader every slide the author
 * kept out (2026-07-13-lente-reader-lenses.md §6.3, red-team M4).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { projectForExport, exportableViews, REFUSAL_REASONS } = require('../../../lib/core/lens-export.mjs');
const { frontMatterBlockOf } = require('../../../lib/core/slide-boundaries.mjs');
const { approvalHash, applyTag, emitRegistry } = require('@workwel/lente');
const engine = require('../../../lib/engine/index.js');

/** How many slides the ENGINE renders from this source — the independent oracle. */
function renderedSections(source) {
	const { html } = engine.render(source);
	return (html.match(/<section\b/g) || []).length;
}

/** A deck of `n` numbered slides, tagged into the named views, with real approval hashes. */
function deckWith(views, membership, { n = 6, sep = '---' } = {}) {
	let slides = Array.from({ length: n }, (_, i) => `\n# Slide ${i + 1}\n\nBody of slide ${i + 1}.\n`);
	for (const v of views) {
		const mem = new Set(membership[v.id] ?? []);
		slides = slides.map((s, i) => applyTag(s, v.id, mem.has(i), v.base));
	}
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...views], default: 'full' };
	// Approval binds the RESOLVED membership + member bodies, so it is computed on the
	// final tagged slides — an approval hashed before tagging reads as `drifted`.
	const approved = {
		lenses: bare.lenses.map((l) => (l.id === 'full' || l.skipApproval ? l : { ...l, approved: approvalHash(slides, bare, l.id) })),
		default: 'full',
	};
	const fm = `---\nmarp: true\ntheme: indaco\n${emitRegistry(approved)}\n---\n`;
	return fm + slides.join(`\n${sep}\n`);
}

const VIEWS = [
	{ id: 'brief', label: 'Brief', base: 'none', kind: 'rung' },
	{ id: 'ask', label: 'The ask', base: 'none' },
];
const MEMBERSHIP = { brief: [0, 2, 5], ask: [3] };

test('projects to exactly the slides the view shows, and the engine agrees', () => {
	const src = deckWith(VIEWS, MEMBERSHIP);
	assert.equal(renderedSections(src), 6, 'fixture sanity: the unprojected deck is 6 slides');

	const brief = projectForExport(src, ['brief']);
	assert.equal(brief.ok, true);
	assert.equal(brief.kept.length, 3);
	assert.equal(renderedSections(brief.source), 3, 'the projected deck RENDERS three sections');

	const ask = projectForExport(src, ['ask']);
	assert.equal(renderedSections(ask.source), 1);
});

test('several views ship their union, in author order, each view indexed into it', () => {
	const src = deckWith(VIEWS, MEMBERSHIP);
	const both = projectForExport(src, ['brief', 'ask']);
	assert.equal(both.ok, true);
	assert.deepEqual(both.kept, [0, 2, 3, 5], 'union, ascending — never the order the views were asked for');
	assert.equal(renderedSections(both.source), 4);
	// Indices address the PROJECTED list, which is what a carrier bakes in.
	assert.deepEqual(both.views.find((v) => v.id === 'brief').indices, [0, 1, 3]);
	assert.deepEqual(both.views.find((v) => v.id === 'ask').indices, [2]);
});

test('`full` alone carries NO other view, and leaves the body byte-identical', () => {
	// `--lens full` is a selection, not a no-op: the author asked for the whole deck AND for
	// no other view, so the registry and every foreign membership tag go with the others.
	// What must not change is a single byte of the SLIDES.
	const src = deckWith(VIEWS, MEMBERSHIP);
	const full = projectForExport(src, ['full']);
	assert.equal(full.ok, true);
	assert.equal(full.source.slice(frontMatterBlockOf(full.source).length), src.slice(frontMatterBlockOf(src).length).replace(/<!-- _lens: [^>]*-->\n/g, ''),
		'the slides are the author’s own text, minus the membership tags for views this export does not carry');
	assert.doesNotMatch(full.source, /lenses:/, 'no view but `full` is exported, so no registry ships');
	assert.doesNotMatch(full.source, /_lens:/, 'and no slide still declares membership in one');
	assert.equal(renderedSections(full.source), renderedSections(src), 'every slide still ships');
});

test('a deck with nothing to prune gets its OWN string back — the identity shortcut', () => {
	// The shortcut is what makes an un-annotated deck byte-exact through `--lens full`. It is
	// pinned on a deck whose body OPENS with a separator, because that separator belongs to no
	// chunk: it is the one thing a re-assembly has to put back deliberately.
	const src = `---\nmarp: true\ntheme: indaco\n---\n\n---\n\n# One\n\n---\n\n# Two\n`;
	const out = projectForExport(src, ['full']);
	assert.equal(out.ok, true);
	assert.equal(out.source, src, '`full` returns the caller’s own string, leading separator and all');
});

test('a leading separator survives the RE-ASSEMBLY path too, not just the shortcut', () => {
	// The shortcut answers `full` before any re-assembly runs, so it cannot pin what a REDUCING
	// projection does with that separator. This does: slide 0 is a `brief` member, so the
	// separator that opens the body still precedes the first slide shipped and must come back.
	const base = deckWith(VIEWS, MEMBERSHIP);
	const fm = frontMatterBlockOf(base);
	const src = `${fm}\n---\n${base.slice(fm.length)}`;
	const out = projectForExport(src, ['brief']);
	assert.equal(out.ok, true);
	assert.match(out.source.slice(frontMatterBlockOf(out.source).length), /^\n---\n/, 'the leading separator was re-emitted, not dropped');
	assert.equal(renderedSections(out.source), MEMBERSHIP.brief.length, 'and it still adds no section');
});

test('a view containing every slide keeps the body, and still sheds its siblings', () => {
	const all = [{ id: 'everything', label: 'Everything', base: 'all' }];
	const src = deckWith(all, { everything: [0, 1, 2, 3] }, { n: 4 });
	const out = projectForExport(src, ['everything']);
	assert.equal(out.ok, true);
	assert.equal(out.source.slice(frontMatterBlockOf(out.source).length), src.slice(frontMatterBlockOf(src).length),
		'no slide was dropped, so no slide was re-assembled');
});

test.describe('an export carries ONLY the views it exports', () => {
	test('the registry and the membership tags both shed the views left behind', () => {
		const src = deckWith(VIEWS, MEMBERSHIP);
		assert.match(src, /ask: \{/, 'fixture sanity: the unprojected deck declares both views');

		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		assert.match(out.source, /brief: \{/, 'the exported view is still declared');
		assert.doesNotMatch(out.source, /ask/, 'the view left behind is named nowhere — not its id, label, or digest');
		for (const tag of out.source.match(/<!-- _lens:([^>]*)-->/g) ?? []) {
			assert.doesNotMatch(tag, /ask/, 'and no kept slide still declares membership in it');
		}
	});

	test('the re-stamped approval still opens the view in the artifact', () => {
		// A copied digest covers the PRE-projection member bodies and foreign tags, so it reads
		// `drifted` the moment anyone re-opens the exported deck — the view would refuse to open
		// in the file that exists to show it. Re-parsing the projection is the only honest check.
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, ['brief', 'ask']);
		assert.equal(out.ok, true);
		const again = projectForExport(out.source, ['brief']);
		assert.equal(again.ok, true, `the exported deck must still project its own views (got ${again.reason})`);
		assert.equal(again.kept.length, MEMBERSHIP.brief.length, 'and to the same slides');
	});

	test('the label a reader sees survives the prune', () => {
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, ['ask']);
		assert.match(out.source, /label: "The ask"/, 'a pruned registry is still a registry, not a bare id list');
	});
});

test.describe('the view the artifact opens on', () => {
	test('defaults to the first view asked for', () => {
		const src = deckWith(VIEWS, MEMBERSHIP);
		assert.equal(projectForExport(src, ['ask', 'brief']).default, 'ask');
	});

	test('an explicit default is recorded in the deck it ships', () => {
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, ['brief', 'ask'], { default: 'ask' });
		assert.equal(out.ok, true);
		assert.equal(out.default, 'ask');
		assert.match(out.source, /^lens-default: ask$/m, 'so re-opening the artifact opens the same view');
	});

	test('naming a default this export does not carry REFUSES', () => {
		// Falling back to the first view would ship a correct-looking artifact that opens on the
		// wrong one, and say nothing.
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, ['brief'], { default: 'ask' });
		assert.equal(out.ok, false);
		assert.equal(out.reason, 'default-not-exported');
		assert.equal(out.lensId, 'ask');
		assert.ok(REFUSAL_REASONS['default-not-exported'], 'the reason carries an explanation the CLI can print');
	});
});

test('a non-`---` separator survives the projection', () => {
	// `***` is a thematic break to the engine and is NOT `---`. Re-emitting under a
	// canonical `---` renders the same for a `---` deck and silently MERGES slides
	// for this one, so the count is the only thing that catches it.
	const src = deckWith(VIEWS, MEMBERSHIP, { sep: '***' });
	assert.equal(renderedSections(src), 6, 'fixture sanity: `***` really does separate slides');
	const brief = projectForExport(src, ['brief']);
	assert.equal(renderedSections(brief.source), 3);
	assert.match(brief.source, /\*\*\*/, 'the author’s own separator is what re-joins the kept slides');
});

test('a deck whose body OPENS with a separator keeps its slide numbering', () => {
	// THIS TEST USED TO PROVE NOTHING, and the way it failed is the point. It built its
	// fixture with `src.replace(/\n---\n$/m, …)`, which matches the FIRST separator followed
	// by a blank line — between slides one and two, never at the head of the body. So no
	// leading separator was ever created. It then asserted only on `full`, which the identity
	// shortcut answers before any re-assembly runs. Deleting the whole `leadingEmpty` branch
	// from the kernel left it green.
	//
	// Built properly, and asserted on a REDUCING view so the re-assembly path is actually
	// walked: a body opening with a separator renders N sections from N+1 chunks, so an
	// off-by-one here shifts every membership by one slide.
	const base = deckWith(VIEWS, MEMBERSHIP);
	const fm = frontMatterBlockOf(base); // the canonical helper — counting separators got this wrong
	const src = `${fm}\n---\n${base.slice(fm.length)}`;
	assert.equal(renderedSections(src), renderedSections(base), 'fixture: a leading separator adds no section');

	const out = projectForExport(src, ['brief']);
	assert.equal(out.ok, true, `brief must still project on a leading-separator deck (got ${out.reason})`);
	assert.equal(renderedSections(out.source), MEMBERSHIP.brief.length, 'the SAME slides brief projects on the ordinary deck');
	// The membership is the same deck either way — a leading separator is not a slide.
	assert.deepEqual(out.kept, projectForExport(base, ['brief']).kept);
});

test.describe('fails CLOSED — every one of the five reasons refuses', () => {
	const cases = {
		unknown: () => deckWith(VIEWS, MEMBERSHIP),
		hidden: () => deckWith([{ ...VIEWS[0], hidden: true }, VIEWS[1]], MEMBERSHIP),
		unapproved: () => deckWith([{ ...VIEWS[0], skipApproval: true }, VIEWS[1]], MEMBERSHIP),
		empty: () => deckWith(VIEWS, { ...MEMBERSHIP, brief: [] }),
		drifted: () => {
			// Approve, then edit a member slide — the digest covers member bodies, so the
			// view de-approves itself. This is the reason a stale artifact must never ship.
			const src = deckWith(VIEWS, MEMBERSHIP);
			return src.replace('Body of slide 1.', 'Body of slide 1, revised after approval.');
		},
	};

	for (const [reason, build] of Object.entries(cases)) {
		test(reason, () => {
			const src = build();
			const id = reason === 'unknown' ? 'no-such-view' : 'brief';
			const out = projectForExport(src, [id]);
			assert.equal(out.ok, false, `a ${reason} view must never project`);
			assert.equal(out.reason, reason);
			assert.equal(out.lensId, id, 'the refusal names the id the AUTHOR typed');
			assert.ok(REFUSAL_REASONS[reason], 'every reason carries an explanation the CLI can print');
		});
	}

	test('a refusal in a MULTI-view request refuses the whole export', () => {
		const src = deckWith(VIEWS, { ...MEMBERSHIP, brief: [] });
		const out = projectForExport(src, ['ask', 'brief']);
		assert.equal(out.ok, false);
		assert.equal(out.lensId, 'brief', 'reported in the order the author asked, not registry order');
		assert.equal(out.reason, 'empty');
	});

	test('an ineligible view is not offered for export in the first place', () => {
		const src = deckWith([{ ...VIEWS[0], skipApproval: true }, VIEWS[1]], MEMBERSHIP);
		const offered = exportableViews(src).map((v) => v.id);
		assert.deepEqual(offered, ['full', 'ask'], 'the unapproved view is absent; `full` is always there');
	});

	test('a deck with no views at all still exports as `full`', () => {
		const src = `---\nmarp: true\ntheme: indaco\n---\n\n# One\n\n---\n\n# Two\n`;
		assert.deepEqual(exportableViews(src).map((v) => v.id), ['full']);
		const out = projectForExport(src, ['full']);
		assert.equal(out.ok, true);
		assert.equal(out.source, src, 'a deck with no views renders exactly as it does today, to the byte');
	});
});

test('a chunk that ends mid-paragraph still gets the separator pad', () => {
	// The pad is conditional now, so the case it exists for needs its own test — and finding
	// that case takes a `***`. `slideBoundaries` reads `---` under a prose line the way
	// markdown-it does (a setext underline, not a boundary), so a chunk before a `---` always
	// ends on a blank line and never needs the pad. `***` is a thematic break in every context,
	// so a chunk can end mid-paragraph in front of one — and when the slide AFTER it is dropped,
	// that chunk lands in front of the NEXT slide's `---`, which would underline it.
	const one = '\n# One\n\nprose';
	const two = '\n\n# Two\n\nDropped.\n';
	const three = '\n\n# Three\n\nKept.\n';
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, { id: 'brief', label: 'Brief', base: 'none' }], default: 'full' };
	const chunks = [one, two.slice(1), three.slice(1)].map((s, i) => applyTag(s, 'brief', i !== 1, 'none'));
	const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
	const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---${chunks[0]}\n***\n${chunks[1]}\n---\n${chunks[2]}`;
	assert.equal(renderedSections(src), 3, 'fixture sanity: three slides');

	const out = projectForExport(src, ['brief']);
	assert.equal(out.ok, true, `expected a projection, got ${out.reason}`);
	assert.match(out.source, /prose\n\n---\n/, 'the pad was written — without it the separator underlines the paragraph');
	assert.equal(renderedSections(out.source), 2, 'two slides ship, and the paragraph is still on the first');
	assert.match(out.source, /prose/, 'the paragraph survived rather than becoming a heading');
});
