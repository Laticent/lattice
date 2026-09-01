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

test('`full` is byte-identical to no projection at all', () => {
	const src = deckWith(VIEWS, MEMBERSHIP);
	const full = projectForExport(src, ['full']);
	assert.equal(full.ok, true);
	assert.equal(full.source, src, 'the caller gets its OWN string back, not a re-assembled copy');
});

test('a view containing every slide also returns the original source', () => {
	const all = [{ id: 'everything', label: 'Everything', base: 'all' }];
	const src = deckWith(all, { everything: [0, 1, 2, 3] }, { n: 4 });
	const out = projectForExport(src, ['everything']);
	assert.equal(out.ok, true);
	assert.equal(out.source, src, 'identity is a property of the RESULT, not of the id `full`');
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

test('a deck whose body opens with a separator keeps its slide numbering', () => {
	const src = deckWith(VIEWS, MEMBERSHIP).replace(/\n---\n$/m, '\n---\n\n---\n');
	const before = renderedSections(src);
	const out = projectForExport(src, ['full']);
	assert.equal(renderedSections(out.source), before);
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
