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

const { POSITION_NEUTRALIZERS, authorCss, authoredIndexDrift, crossSlideDrift, projectForExport, exportableViews, REFUSAL_REASONS } = require('../../../lib/core/lens-export.mjs');
const { frontMatterBlockOf, normalizeSourceText, slideBoundaries } = require('../../../lib/core/slide-boundaries.mjs');
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

/** A deck from explicit chunk bodies, with digests computed over the split the export actually
 *  makes — the fixture mistake that made six earlier cases refuse as `drifted` and hide what they
 *  were written to test. `VIEWS`/`brief` membership comes from whatever `_lens` tags the chunks carry. */
function deckFrom(chunks) {
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
	const body = chunks.join('\n---\n');
	const seps = new Set(slideBoundaries(body).lines);
	const real = [[]];
	body.split('\n').forEach((line, i) => {
		if (seps.has(i)) real.push([]);
		else real[real.length - 1].push(line);
	});
	const split = real.map((ls) => ls.join('\n'));
	const reg = {
		lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(split, bare, l.id) })),
		default: 'full',
	};
	return `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${body}`;
}


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

test('`full` ALONE is the identity — it is not a selection against the other views', () => {
	// The prune exists because naming a view a recipient was not given tells them something
	// about content they were denied. A `full` recipient was denied nothing, so there is
	// nothing to close — and deleting the author's view catalog from an envelope that exists
	// to round-trip into an editable deck is pure loss. An earlier version pruned here, which
	// also contradicted the kernel's own documented promise.
	const src = deckWith(VIEWS, MEMBERSHIP);
	const full = projectForExport(src, ['full']);
	assert.equal(full.ok, true);
	assert.equal(full.source, src, 'the caller gets its OWN string back, byte for byte');
	assert.match(full.source, /ask: \{/, 'and the deck keeps every view it declared');
});

test('`full` ALONGSIDE a named view is a selection, and prunes', () => {
	// `--lens full,brief` offers two views in a carrier, so it discloses two — the exemption
	// above is for `full` on its own, not for the token appearing anywhere in the request.
	const src = deckWith(VIEWS, MEMBERSHIP);
	const out = projectForExport(src, ['full', 'brief']);
	assert.equal(out.ok, true);
	assert.match(out.source, /brief: \{/, 'the view it carries is declared');
	assert.doesNotMatch(out.source, /ask/, 'the view it does not carry is named nowhere');
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

	test('NO approval digest is written by the export', () => {
		// Re-deriving the digest over the projection made the projection SELF-CERTIFYING:
		// `pruneTags` rewrites the author's slide text, so a hash taken afterwards describes
		// whatever that rewrite produced, damage included — and the fail-closed net cannot fire
		// against a hash written after the corruption. It was also computed four pipeline stages
		// before the envelope it describes, so `--strip-notes` shipped `drifted` views anyway.
		// A projected artifact re-imports as `unapproved`, which is true: a machine reduced it.
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, ['brief', 'ask']);
		assert.equal(out.ok, true);
		assert.doesNotMatch(out.source, /approved:/, 'the export never signs a deck a human has not seen');
		const again = projectForExport(out.source, ['brief']);
		assert.equal(again.ok, false, 'so re-projecting the artifact refuses');
		assert.equal(again.reason, 'unapproved', 'and says a human has to look first');
	});

	test('the emitted body must re-split into exactly the slides that were kept', () => {
		// The baked view map is indexed by POSITION, so a slide lost or gained between the chunk
		// array and the emitted string shifts every view after it — a reader is then shown a
		// slide their view excludes. Here slide 0's entire content is a withheld tag: pruning
		// empties it and the leading-empty rule absorbs it, so three slides would ship as two.
		// The export refuses rather than writing a file with a shifted map.
		const views = [{ id: 'wide', label: 'Wide', base: 'all' }, { id: 'secret', label: 'S', base: 'none' }];
		const chunks = ['<!-- _lens: secret -->\n', '\n# Heading\n\nBody.\n', '\n# Second\n\nMore.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...views], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n***\n${chunks[1]}\n---\n${chunks[2]}`;
		const out = projectForExport(src, ['wide']);
		assert.equal(out.ok, false, 'a projection that cannot re-split must not ship');
		assert.equal(out.reason, 'unsplittable');
		assert.ok(REFUSAL_REASONS.unsplittable, 'the reason carries an explanation the CLI can print');
	});

	test('a prune that would move the slide\u2019s block structure is dropped, not applied', () => {
		// SIX commits tried to decide from the bytes which edits are safe. The answer is a property of
		// the PARSER: deleting a tag line joins the blocks around it. Here the tag sits between two
		// paragraphs; removing its line merges them into one, which reached a real artifact with
		// `ok: true` and no warning. The prune is now checked against the engine-pinned parser and
		// reverted whole when it moves anything but the directive.
		const slide = '<!-- _lens: brief -->\n\n# One\n\nThe board summary sentence.\n<!-- _lens: -ask -->\nThe detail line for analysts.\n';
		const chunks = [slide, '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
		const out = projectForExport(src, ['brief']);
		// `ask` is withheld and its tag could not be pruned without damage, so the export refuses
		// rather than shipping either the corrupted prose or the undisclosed id.
		assert.equal(out.ok, false, 'it must not ship a slide whose structure the prune moved');
		assert.equal(out.reason, 'unprunable');
		assert.equal(out.lensId, 'ask');
	});

	test('but a prune that leaves structure alone is applied as normal', () => {
		// The complement, so the check above cannot pass by refusing everything: the same tag with a
		// blank line on each side deletes cleanly, because blank lines already separate the blocks.
		const slide = '<!-- _lens: brief -->\n\n# One\n\nThe board summary sentence.\n\n<!-- _lens: -ask -->\n\nThe detail line for analysts.\n';
		const chunks = [slide, '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'a safe prune still happens');
		assert.doesNotMatch(out.source, /_lens: -ask/, 'and the withheld id is gone');
		assert.match(out.source, /The detail line for analysts\./, 'with the author\u2019s prose intact');
	});

	test('disclosure is judged by what the RENDERER sees, not by Lente\u2019s fence scan', () => {
		// `fenceRanges` opens a fence on ```` ```js` ```` — an info string carrying a backtick — where
		// markdown-it opens none. So Lente called the directive below "fenced" and left it alone,
		// while a reader is shown a real html_block naming a withheld view. A check that reads
		// through the same scanner as the pruner is blind wherever the pruner is blind; this one
		// asks the engine-pinned parser instead.
		const slide = '<!-- _lens: brief -->\n\n## Snippet\n\n```js`\n<!-- _lens: -ask -->\n';
		const chunks = [slide, '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, false, 'the id a reader would be shown must not ride out');
		assert.equal(out.reason, 'unprunable');
		assert.equal(out.lensId, 'ask');
	});

	test('an indented or trailing-space tag is pruned, not refused', () => {
		// The bound before this demanded column 0 and a newline immediately after, so one invisible
		// trailing space refused an entire export — and told the author to put the tag on a line of
		// its own, which is where they had already put it.
		for (const tag of ['  <!-- _lens: brief -ask -->', '<!-- _lens: brief -ask --> ']) {
			const chunks = [`${tag}\n\n# One\n\nBody.\n`, '\n# Two\n\nBody two.\n'];
			const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
			const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
			const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
			const out = projectForExport(src, ['brief']);
			assert.equal(out.ok, true, `refused on ${JSON.stringify(tag)}`);
			assert.doesNotMatch(out.source, /-ask/, 'and the withheld token is pruned');
		}
	});

	test('a withheld id the prune cannot safely rewrite REFUSES the export, it does not ride out', () => {
		// `pruneTags` edits only a directive that is the WHOLE of its line — the bound Lente reached
		// after four string splices each corrupted a real deck. A tag sharing its line is therefore
		// read and left alone, which is safe for the author's bytes and, on its own, a fail-OPEN:
		// the withheld id would ship in the envelope naming a view the recipient was never given.
		// So the emitted body is RE-READ and a survivor refuses, exactly like the re-split check.
		// This is a verification, not a fifth derivation: it catches the next gap in the class too,
		// and `fenceRanges` is known to have at least one left (#2034).
		const chunks = ['<!-- _lens: brief -->\n\n# One\n\nProse.\n- <!-- _lens: ask -->\n  more\n', '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, false, 'an export that cannot prove it withheld what it said must not write');
		assert.equal(out.reason, 'unprunable');
		assert.equal(out.lensId, 'ask', 'and it names the id that survived, so an author can fix the deck');
		assert.ok(REFUSAL_REASONS.unprunable, 'the reason carries an explanation the CLI can print');
	});

	test('but an EXPORTED id in such a tag is fine — the refusal is about disclosure, not tidiness', () => {
		const chunks = ['<!-- _lens: brief -->\n\n# One\n\nProse.\n- <!-- _lens: brief -->\n  more\n', '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n---\n${chunks[1]}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'nothing is disclosed, so nothing is refused');
		assert.match(out.source, /- <!-- _lens: brief -->/, 'and the author\u2019s line is returned byte-intact');
	});

	test('a second `_lens` directive on one slide does not ride along', () => {
		// Only the first is ever read, so a second was invisible to the prune and reached the
		// artifact naming a withheld view. The sweep and the reader now ask `findDirectiveComment`
		// the same question, so they cannot disagree about which comment is the tag — an earlier
		// version that answered it two ways turned the disagreement itself into a leak.
		const chunks = ['<!-- _lens: brief -->\n<!-- _lens: ask -->\n\n# One\n\nBody one.\n', '\n# Two\n\nBody two.\n'];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks.join('\n---\n')}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, `expected a projection, got ${out.reason}`);
		assert.doesNotMatch(out.source, /ask/, 'the extra directive is gone, not merely unparsed');
	});

	test('a `_lens` example the author QUOTED survives the projection untouched', () => {
		// The prune rewrites slide text, so it must not edit prose. A slide teaching the syntax —
		// the natural deck to export for a demo — had its backticked example gutted to two bare
		// backticks. It is not a directive at all now, to any reader in the chain.
		const chunks = [
			'<!-- _lens: brief -->\n\n# How to tag a slide\n\nWrite `<!-- _lens: ask -->` at the top, or fence it:\n\n```markdown\n<!-- _lens: ask -->\n```\n',
			'\n# Second\n\nBody.\n',
		];
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks.join('\n---\n')}`;
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, `expected a projection, got ${out.reason}`);
		assert.match(out.source, /Write `<!-- _lens: ask -->` at the top/, 'the inline example is intact');
		assert.match(out.source, /```markdown\n<!-- _lens: ask -->\n```/, 'and so is the fenced one');
	});

	test('a tombstone cannot smuggle a withheld id through, in any spelling', () => {
		// `upsertLensRegistry` deliberately re-attaches every tombstone it finds. Filtering the
		// SOURCE for a tombstone shape missed `{ drop: true, }` and `{ label: "L", drop: true }`,
		// which Lente's parser reads perfectly well and its writer then canonicalized into the
		// artifact. The filter is an allowlist over the EMITTED block instead: it does not have
		// to recognize a tombstone, only an id.
		const src = deckWith(VIEWS, MEMBERSHIP).replace(
			'lenses:\n',
			'lenses:\n  chimera: { label: "Project Chimera", drop: true }\n  trailing: { drop: true, }\n',
		);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, `expected a projection, got ${out.reason}`);
		for (const id of ['chimera', 'Chimera', 'trailing', 'drop: true']) {
			assert.ok(!out.source.includes(id), `${id} must not survive`);
		}
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

	test('the DECK’s own `lens-default:` beats the order the ids were typed in', () => {
		// argv order is already spoken for — it is what the switcher lists. Letting it also
		// decide the landing view discarded a decision the author wrote into the deck.
		const src = deckWith(VIEWS, MEMBERSHIP).replace('lenses:\n', 'lens-default: ask\nlenses:\n');
		assert.equal(projectForExport(src, ['brief', 'ask']).default, 'ask');
		assert.equal(projectForExport(src, ['brief', 'ask'], { default: 'brief' }).default, 'brief',
			'an explicit --lens-default still wins over the deck');
	});

	test('naming no view at all REFUSES — it is not "project everything"', () => {
		const src = deckWith(VIEWS, MEMBERSHIP);
		const out = projectForExport(src, []);
		assert.equal(out.ok, false, 'the union of zero views used to return an EMPTY deck, ok:true');
		assert.equal(out.reason, 'no-view-named');
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

test('`--lens full` returns the identity even when a slide would prune to nothing', () => {
	// The re-split invariant used to run BEFORE the `full` exemption, so a deck whose first
	// slide's entire content is a withheld tag — the exact shape `applyTag` writes when you tag
	// an empty slide — pruned to nothing, failed the check, and `--lens full` REFUSED a deck it
	// is supposed to hand back untouched. The CLI then listed `full` as exportable while
	// refusing it.
	const chunks = ['<!-- _lens: ask -->\n', '\n# Heading\n\nBody.\n', '\n# Second\n\nMore.\n'];
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
	const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
	const src = `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${chunks[0]}\n***\n${chunks[1]}\n---\n${chunks[2]}`;

	const out = projectForExport(src, ['full']);
	assert.equal(out.ok, true, `\`full\` must never refuse a deck it does not touch (got ${out.reason})`);
	assert.equal(out.source, src, 'and it hands back the caller’s own string');
});

/**
 * THE HAND-WRITTEN HALF OF THE PIN, and the reason it exists.
 *
 * The fuzz below is a good net and a poor oracle: whatever expression it uses to say "these render
 * the same" tends to share a MODEL with the kernel's, and twice now it has shared the kernel's blind
 * spot and certified a corruption instead of finding it. These cases carry their expected outcome
 * WRITTEN OUT, derived from what markdown-it actually does rather than from any check in this repo,
 * so they cannot drift with the implementation. Each one is a defect an independent checker found in
 * a commit the whole suite passed.
 */
test.describe('the shapes eight attempts got wrong, with their answers written down', () => {
	// THE DIGEST IS COMPUTED OVER THE REAL SPLIT, not over the chunks this helper was handed. Some of
	// the shapes below (an unterminated `<pre>`, a fence) change where `slideBoundaries` puts a
	// boundary, so assuming a two-chunk deck produced a hash that did not match and every such case
	// refused as `drifted` — a fixture artifact that would have hidden the defect it was written for.
	const deckOf = (slide) => {
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const body = `${slide}\n---\n\n# Two\n\nBody two.\n`;
		const seps = new Set(slideBoundaries(body).lines);
		const real = [[]];
		body.split('\n').forEach((line, i) => {
			if (seps.has(i)) real.push([]);
			else real[real.length - 1].push(line);
		});
		const chunks = real.map((ls) => ls.join('\n'));
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(chunks, bare, l.id) })), default: 'full' };
		return `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${body}`;
	};

	test('a blank-wrapped tag BETWEEN TWO LISTS is not removable — it would weld them', () => {
		// The eighth attempt shipped this: an oracle that stripped the comment from the SOURCE and
		// rendered turned the directive into a BLANK LINE, and a blank line makes one loose list
		// where a comment at column 0 makes two. Two ordered lists became one and `Pilot` renumbered
		// from 1 to 3, in a real exported artifact, `ok: true`. The skill doc said this case refuses;
		// it did not, until now.
		const out = projectForExport(deckOf('<!-- _lens: brief -->\n\n## Timeline\n\n1. Discovery\n2. Build\n\n<!-- _lens: -ask -->\n\n1. Pilot\n2. Rollout\n'), ['brief']);
		assert.equal(out.ok, false, 'welding two lists is a structural change and must not ship');
		assert.equal(out.reason, 'unprunable');
	});

	test('a MID-SENTENCE directive is disclosure — it is an html_inline, not an html_block', () => {
		// Scanning only `html_block` let `Revenue is up. <!-- _lens: internal -->` ride out in the
		// envelope source, the channel this kernel's own docblock calls the worst of the four.
		const out = projectForExport(deckOf('<!-- _lens: brief -->\n\n# One\n\nRevenue is up. <!-- _lens: ask -->\n'), ['brief']);
		assert.equal(out.ok, false, 'an inline directive names a withheld view to the recipient');
		assert.equal(out.reason, 'unprunable');
		assert.equal(out.lensId, 'ask');
	});

	test('a `>` inside a directive body does not make it invisible', () => {
		// `[^>]*?` cannot cross a `>`, so this matched NOTHING and the withheld id vanished from the
		// check. Deleting the `>` alone flipped the same deck to a refusal.
		const out = projectForExport(deckOf('<!-- _lens: brief -->\n\n# One\n\nProse.\n<!-- _lens: a>b -ask -->\nMore.\n'), ['brief']);
		assert.equal(out.ok, false, 'the id after the `>` must still be seen');
		assert.equal(out.reason, 'unprunable');
	});

	test('a directive inside DISPLAY MATH leaves the equation exactly as the author wrote it', () => {
		// `boundaryParser` installs `math_block` with no renderer rule, so every `$$…$$` renders as
		// `<div />` whatever is inside. Without the math content in the comparison, a directive line
		// could be cut out of an equation and the check would report no change — while the engine's
		// KaTeX pass typesets the two differently. With it, the prune reverts and the equation stands.
		//
		// It does NOT then refuse, and that is the same judgment as a fenced example: the engine
		// typesets that line, so a reader SEES it. It is the author's own visible content, not a
		// machine-inserted leak, and refusing an export over text the author chose to display would
		// be the check overreaching. Recorded here because the reasoning is not obvious from the code.
		const out = projectForExport(deckOf('<!-- _lens: brief -->\n\n# One\n\n$$\nx = 1\n<!-- _lens: -ask -->\ny = 2\n$$\n'), ['brief']);
		assert.equal(out.ok, true);
		assert.match(out.source, /x = 1\n<!-- _lens: -ask -->\ny = 2/, 'the equation is byte-intact');
	});

	test('a raw HTML block keeps the content the directives sat beside', () => {
		// Dropping the whole `html_block` whenever it contained `_lens:` threw the author's content away
		// with the directive, so two different `<pre>` bodies compared equal and a prune that deleted a
		// line from one was accepted. The directives are trimmed OUT of the block now.
		//
		// THE DISCRIMINATOR IS THE SHIPPED SOURCE, NOT THE VERDICT, and finding that cost three tries.
		// Both kernels REFUSE when a withheld id survives, and both revert when the block ends up with
		// no directive at all — the whole-block rule is asymmetric there, since the pruned side no
		// longer matches it. The case that separates them keeps a directive in the block (one sharing
		// its line, so the sweep cannot take it) naming a view that IS exported: no refusal either way,
		// and the block is byte-intact only when the comparison could see inside it.
		//
		// The earlier version of this test pinned nothing at all — its fixture reverted wholesale, so
		// both assertions held because nothing had been changed, and it survived all seven mutations.
		const src = deckOf(
			'<!-- _lens: brief -->\n\n# One\n\n<pre>\nalpha <!-- _lens: brief --> tail\n<!-- _lens: brief -->\ngamma\n</pre>\n',
		);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'nothing withheld is named, so nothing is refused');
		assert.match(
			out.source,
			/<pre>\nalpha <!-- _lens: brief --> tail\n<!-- _lens: brief -->\ngamma\n<\/pre>/,
			'and the author\u2019s block is byte-intact — dropping it whole ships it a line short',
		);
	});

	test('a tag at the end of a raw HTML block is not removable — its newline is rendered content', () => {
		// TWO DEFECTS IN ONE `.trim()`, and this is the case that discriminates them. Inside a `<pre>`
		// the newline a deleted tag line takes with it is VISIBLE, so removing the tag renders one
		// blank line short of the author's deck. Trimming the rendered string put that difference in
		// the trimmed region and the comparison called the two identical — measured on the real CLI,
		// against this function's own docblock, which said a collapse "would have hidden a real
		// difference inside a `<pre>`."
		//
		// It also fixes the direction of the block trimming. `withoutLensComments` leaves the tag's
		// newline where the prune deletes the whole line, so untrimmed the two sides differ and the
		// prune reverts. Trimmed, it accepted 216 prunes in 3,000 randomized raw-HTML decks that
		// dropping the block whole would have reverted, and zero the other way — the opposite of the
		// "more precise" it was introduced as. Precision here means CONSERVATIVE.
		const out = projectForExport(deckOf('<!-- _lens: brief -->\n\n# One\n\n<div>\nalpha\n<!-- _lens: ask -->\n'), ['brief']);
		assert.equal(out.ok, false, 'removing it would change the rendered block, so the prune reverts');
		assert.equal(out.reason, 'unprunable', 'and the surviving withheld id refuses rather than shipping');
	});
});

test.describe('structural fuzz — a prune never moves a slide\u2019s block structure', () => {
	test('zero divergences across the shapes six commits got wrong', async () => {
		// An independent checker measured 152 structural changes across 1,445 inputs against the
		// rule this replaced. The property is not "the rule is right", which is what every previous
		// attempt asserted — it is "whatever the prune did, the parser sees the same blocks". Held
		// to ZERO, because a single one is a corrupted deck shipped with `ok: true`.
		const { boundaryParser } = await import('../../../lib/core/boundary-parser.mjs');
		const { frontMatterBlockOf, slideBoundaries } = await import('../../../lib/core/slide-boundaries.mjs');
		// Split BOTH sides with the splitter the export itself uses. A naive `/^---$/m` split
		// disagrees with it (setext underlines, `***`), and that disagreement is a property of the
		// TEST, not of the prune — it reported 16 false positives, every one on a fuzz case whose
		// "slide" happened to contain a separator.
		const split = (body) => {
			const seps = new Set(slideBoundaries(body).lines);
			const out = [[]];
			body.split('\n').forEach((line, i) => {
				if (seps.has(i)) out.push([]);
				else out[out.length - 1].push(line);
			});
			return out.map((ls) => ls.join('\n'));
		};
		// THIS FUZZ IS A NET, NOT AN ORACLE, AND THE DISTINCTION HAS BITTEN TWICE. Any expression
		// written here to mean "these render the same" tends to share a MODEL with the kernel's, and
		// twice it shared the kernel's blind spot and certified a corruption: first as a verbatim copy
		// of the token signature, then as "strip the comment from the source and render", which turns
		// a directive into a BLANK LINE — and a blank line makes one loose list where a comment at
		// column 0 makes two. Claiming independence for it was wrong both times, so this no longer
		// claims it. The independent half is the hand-written table above, whose expected outcomes come
		// from what markdown-it does rather than from anything in this repo.
		//
		// What this still earns: breadth. It runs the shapes nobody thought to write down.
		const shape = (src) => {
			const kept = [];
			for (const t of boundaryParser.parse(src, {})) {
				if (t.type === 'html_block' && t.content.includes('_lens:')) continue;
				kept.push(t);
			}
			return boundaryParser.renderer.render(kept, boundaryParser.options, {}).trim();
		};

		const ATOMS = [
			'Prose line\n', 'more prose\n', '\n', '# Head\n', '===\n', '---\n', '- item\n', '- next\n',
			'> quote\n', '    indented\n', '```\nfence\n```\n', '```js`\n', '~~~\n', '1. one\n', '2. two\n',
			'  <!-- _lens: brief -ask -->\n', '<!-- _lens: brief -ask -->\n', '<!-- _lens: brief -ask --> \n',
			'- <!-- _lens: brief -ask -->\n', '> <!-- _lens: brief -ask -->\n', '\t', '   ',
			// The two shapes that walked through the token-signature oracle. A link reference
			// definition emits NO block token, so deleting the line above one kills the definition and
			// prints the URL on the slide; a nested item flips a list loose->tight, which markdown-it
			// records in `hidden` and a type/tag/nesting comparison cannot see.
			'[ref]: /url\n', 'See [ref] here.\n', '- outer\n', '  - nested\n', '\n  ',
		];
		let seed = 20260902;
		const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		let checked = 0;
		const moved = [];
		for (let i = 0; i < 4000; i++) {
			let slide = '';
			for (let k = 0, n = 2 + Math.floor(rand() * 6); k < n; k++) slide += ATOMS[Math.floor(rand() * ATOMS.length)];
			if (!slide.includes('_lens:')) continue;
			// THE SAME FIXTURE BUG THE HELPER ABOVE WAS FIXED FOR, and it was still here: assuming two
			// chunks when the generated slide contains a separator makes the digest describe a split
			// the export does not make, so the case refuses as `drifted` and `if (!out.ok) continue`
			// discards it. Measured: 418 of 2,301 candidates thrown away, 18% of the corpus, silently.
			const src = deckFrom([slide, '\n# Two\n\nBody two.\n']);
			const out = projectForExport(src, ['brief']);
			if (!out.ok) continue; // a refusal ships nothing, so it cannot corrupt anything
			checked++;
			// Compare each KEPT slide against the one it came from — `out.kept` maps shipped position
			// back to authored index, so a withheld slide is not mistaken for a structural change.
			const authored = split(src.slice(frontMatterBlockOf(src).length));
			const shipped = split(out.source.slice(frontMatterBlockOf(out.source).length));
			if (shipped.length !== out.kept.length) { moved.push(`count ${shipped.length}/${out.kept.length}: ${slide}`); continue; }
			for (let n = 0; n < out.kept.length; n++) {
				if (shape(shipped[n]) !== shape(authored[out.kept[n]])) { moved.push(slide); break; }
			}
		}
		assert.ok(checked > 100, `the corpus must exercise the prune (checked ${checked})`);
		assert.deepEqual(moved.slice(0, 3), [], `${moved.length}/${checked} prunes moved block structure`);
	});
});

/**
 * THE CLASS SIX CHECKERS NEVER LOOKED AT: a deck has document-wide state, and dropping a slide
 * changes the ones that remain. `renderedShape` compares a slide against ITSELF before and after its
 * own tags are edited — the right question for the edit, and structurally blind to this. An
 * adversarial pass put it at ~4% of projections.
 */
test.describe('dropping a slide changes the slides that stay — checked, not assumed', () => {
	const render = (src) => engine.render(src).html;

	test('a `footer:` set on a WITHHELD slide would vanish from the kept ones — refused', () => {
		// Measured on the real CLI before this check existed: `<!-- footer: CONFIDENTIAL - do not
		// distribute -->` on a slide the view excludes appeared 6 times in the full export and 0 times
		// in `--lens brief`. The confidentiality marking was stripped from the file that is actually
		// SENT, while the sender previewed it with the marking on. Exit 0, no warning.
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\nQ3 board pack.\n',
			'\n<!-- footer: CONFIDENTIAL - do not distribute -->\n\n# Internal\n\nSecret.\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'the projection itself is fine — this is not a per-slide defect');
		const drift = crossSlideDrift(src, out.source, out.kept, render);
		assert.ok(drift, 'but a kept slide renders differently, and that must refuse');
		assert.equal(drift.authored, 2, 'and it names the slide that changed');
		assert.ok(REFUSAL_REASONS['cross-slide'], 'the reason carries an explanation the CLI can print');
	});

	test('a link reference definition on a withheld slide — same class, different mechanism', () => {
		// markdown-it resolves `[ref]: url` document-wide, so dropping the slide that defines one turns
		// every reference on kept slides into the literal text `[label][ref]`.
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\nSee [the pack][pk].\n',
			'\n# Internal\n\n[pk]: https://internal.example/q3\n',
			'<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		assert.ok(crossSlideDrift(src, out.source, out.kept, render), 'the reference degrades, so it refuses');
	});

	test('a `<style>` on a withheld slide is document CSS — and dropping it UNHIDES a kept paragraph', () => {
		// The channel a section-by-section comparison structurally cannot see. The kept slide's markup is
		// byte-identical on both sides; only the stylesheet moved. Measured before this check existed: the
		// author previewed a deck with the paragraph hidden, and the paragraph came BACK in the file that
		// was sent — the one direction of this class that is a disclosure rather than a lost marking.
		const chunks = [
			'<!-- _lens: brief -->\n<!-- _class: hushed -->\n\n# Board summary\n\nRevenue is up 40 percent.\n\n<span class="quiet">We expect to lose the Acme suit.</span>\n',
			'\n# Internal\n\n<style>\nsection.hushed .quiet { display: none; }\n</style>\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true, 'the per-slide prune sees nothing wrong — the rule is not on a kept slide');
		const drift = crossSlideDrift(src, out.source, out.kept, render);
		assert.ok(drift, 'but the stylesheet governing a kept slide is gone, and that must refuse');
		assert.equal(drift.channel, 'style', 'and it names the channel, so the CLI can say which one');
	});

	test("an author's own `</section>` no longer truncates the comparison", () => {
		// The walk was `/<section[\s\S]*?<\/section>/`, which stops at the FIRST `</section>` in the
		// markup — so everything after an author's inline `<section class="aside">` went unchecked, and a
		// `footer:` lost from that region passed. The walk is now the repo's depth-aware splitter.
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\n<section class="aside">Prepared for the board.</section>\n\nSee [the pack][pk].\n',
			'\n# Internal\n\n[pk]: https://internal.example/q3\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		const drift = crossSlideDrift(src, out.source, out.kept, render);
		assert.ok(drift, 'the degraded link reference sits AFTER the author section, and is still found');
		assert.equal(drift.authored, 0);
	});

	test('hop 2 compares what actually SHIPS, not only the stand-in for it', () => {
		// `emptyWithheld` holds deck length fixed so hop 1 can ask its question without a shorter deck's
		// legitimate differences drowning it. That makes hop 1 a statement about a PROXY. Hop 2 closes it:
		// the proxy and the real projection must render each kept slide the same. Feeding a projection
		// that is not the deck's own must therefore refuse.
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\nQ3 board pack.\n',
			'\n# Internal\n\nSecret.\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		const tampered = out.source.replace('Q3 board pack.', 'Q3 board pack, with the reserve detail.');
		const drift = crossSlideDrift(src, tampered, out.kept, render);
		assert.ok(drift, 'a projection whose kept slide does not match the deck must refuse');
		assert.equal(drift.hop, 2, 'and it says which hop, because the two mean different things');
	});

	test('a shorter deck renumbers, recolors and re-rails itself — and none of that is drift', () => {
		// The bound this check bought, pinned. Pagination, the divider dot rail, the section-number ghost
		// and the categorical accent are all functions of DECK LENGTH, so every one of them differs on a
		// correct projection. Comparing them refused 52 of the 147 it could check — 35%, a guard that
		// is an outage. This deck exercises pagination and the accent cycle together.
		const chunks = [
			'<!-- _lens: brief -->\n<!-- _paginate: true -->\n\n# Cover\n\nQ3 board pack.\n',
			'\n# Internal one\n\nSecret.\n',
			'\n# Internal two\n\nMore.\n',
			'\n<!-- _lens: brief -->\n<!-- _paginate: true -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		assert.equal(crossSlideDrift(src, out.source, out.kept, render), null, 'page 4 becoming page 2 is not a leak');
	});

	test('a `<STYLE>` in any spelling is the same channel — tag names are case-insensitive', () => {
		// Measured: the changelog's own worked example, with one shifted character, exported clean. A
		// browser applies `<STYLE>` exactly as it applies `<style>`, and the regex that read the channel
		// did not.
		const chunks = [
			'<!-- _lens: brief -->\n<!-- _class: hushed -->\n\n# Board summary\n\n<span class="quiet">We expect to lose the Acme suit.</span>\n',
			'\n# Internal\n\n<STYLE>\nsection.hushed .quiet { display: none; }\n</STYLE>\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		const drift = crossSlideDrift(src, out.source, out.kept, render);
		assert.ok(drift, 'the stylesheet is gone whatever case it was written in');
		assert.equal(drift.channel, 'style');
	});

	test('a `<script>` on a withheld slide is a document channel too, and so is a `<link>`', () => {
		// The docblock claimed four mechanisms and a fuzz that "found nothing else". The fuzz did not emit
		// `<script>` or `<link rel=stylesheet>`, and both reach every slide exactly the way a `<style>`
		// does — measured, a withheld slide's script removed a paragraph from a kept one.
		for (const tag of ['<script>document.querySelector(".quiet")?.remove();</script>', '<link rel="stylesheet" href="./house.css">']) {
			const chunks = [
				'<!-- _lens: brief -->\n\n# Board summary\n\n<span class="quiet">We expect to lose the Acme suit.</span>\n',
				`\n# Internal\n\n${tag}\n`,
				'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
			];
			const src = deckFrom(chunks);
			const out = projectForExport(src, ['brief']);
			assert.equal(out.ok, true);
			const drift = crossSlideDrift(src, out.source, out.kept, render);
			assert.ok(drift, `${tag.slice(0, 12)} reaches the kept slides, so losing it must refuse`);
			assert.equal(drift.channel, 'style');
		}
	});




	test('an accent-shaped string in PROSE is content, not a hue — the neutralizer must not eat it', () => {
		// The unanchored `\bcat-\d+` ran over rendered text, so a footer that really did change from
		// `cat-9` to `cat-3` between the two renders compared equal. That is a global-directive drift the
		// OLD check caught and this one lost: a neutralizer reaching rendered text deletes evidence.
		const chunks = [
			'<!-- _lens: brief -->\n\n# Board summary\n\nRevenue is up.\n',
			'\n<!-- footer: "cat-9" -->\n\n# Internal\n\nSecret.\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks).replace('theme: indaco', 'theme: indaco\nfooter: "cat-3"');
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		assert.ok(crossSlideDrift(src, out.source, out.kept, render), 'the kept slide’s footer really did change');
	});

	test('and an ordinary deck does NOT refuse — the check has to stay silent to be usable', () => {
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\nQ3 board pack.\n',
			'\n# Internal\n\nSecret.\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		assert.equal(out.ok, true);
		assert.equal(crossSlideDrift(src, out.source, out.kept, render), null, 'no drift on a clean deck');
	});
});

/**
 * THE FALSE-ALARM RATE, MEASURED ON REAL DECKS UNDER SIX PROJECTION SHAPES.
 *
 * A guard is only worth having if it stays silent on correct work, and the first three versions of
 * this one were not: comparing a kept slide against its render in the FULL deck refused 52 of the 147
 * example decks it could check. So the normalizer above was not designed — it was DIAGNOSED, one refusal at
 * a time, over this corpus.
 *
 * SIX SHAPES, NOT ONE, AND THAT IS THE POINT OF THIS TEST. An earlier version of it kept every other
 * slide, which always keeps slide 0 — and the defect it could not see was that withholding slide 0
 * shifted every authored number, so hop 1 compared each kept slide against a DIFFERENT one and every
 * deck refused. 147 of 147, on a shape one line away from the one being sampled, and on
 * `examples/lens-export.md --lens ask` through the real CLI: the deck this feature ships to
 * demonstrate itself. A measurement that holds one variable constant is a coincidence, and refusal
 * was perfectly predicted by the variable it held.
 *
 * Each refusal below is a REAL cross-slide dependency, named with its cause. A stale entry fails too,
 * so the list cannot quietly accumulate.
 */
test.describe('the check stays silent on 147 real decks, under six projection shapes', () => {
	const fs = require('node:fs');
	const path = require('node:path');
	const render = (src) => engine.render(src).html;

	/** Deterministic, so a run that refuses can be reproduced from the failure alone. */
	let seed = 7;
	const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

	/** Reader views are not "every other slide". A view is a cover plus an ask, or the back half, or
	 *  a scatter — and which of those is being projected is exactly what the old measurement fixed. */
	const SHAPES = {
		everyOther: (n) => [...Array(n).keys()].filter((i) => i % 2 === 0),
		firstHalf: (n) => [...Array(n).keys()].filter((i) => i < Math.ceil(n / 2)),
		lastHalf: (n) => [...Array(n).keys()].filter((i) => i >= Math.floor(n / 2)),
		dropFirst: (n) => [...Array(n).keys()].filter((i) => i > 0),
		coverPlusLast: (n) => [0, n - 1],
		random30: (n) => {
			const k = [...Array(n).keys()].filter(() => rnd() < 0.3);
			return k.length ? k : [1];
		},
	};

	/** The decks that legitimately refuse, per shape, each with the cross-slide state behind it.
	 *  `slide-class-forms.md` — a `class: diagram dark` global on one slide that a later one inherits.
	 *  `finish-backdrops.md` / `finish-override.md` — a `<style>` on slide 0 defining the finish tokens
	 *  every later slide is drawn with.
	 *  `gallery-jargon.md` — two `<script src>` tags on one late slide, one of which is the deck runtime.
	 *  All four are real, and each is found only when the shape actually withholds the slide carrying
	 *  the state — which is the argument for running six shapes rather than one. */
	const EXPECTED = {
		everyOther: ['gallery-jargon.md', 'slide-class-forms.md'],
		firstHalf: ['gallery-jargon.md'],
		lastHalf: ['finish-backdrops.md', 'finish-override.md', 'slide-class-forms.md'],
		dropFirst: ['finish-backdrops.md', 'finish-override.md'],
		coverPlusLast: [],
		random30: ['finish-backdrops.md', 'gallery-jargon.md'],
	};

	/** The kept slides re-joined under the separator that preceded them — what an export of these
	 *  slides emits, for a corpus that declares no reader views to project. Built from the same
	 *  `slideBoundaries` call the kernel splits on, so the two cannot disagree about where a slide ends. */
	function keepOnly(source, kept) {
		const src = normalizeSourceText(source);
		const fm = frontMatterBlockOf(src);
		const body = src.slice(fm.length);
		const cuts = slideBoundaries(body).lines;
		const lines = body.split('\n');
		const chunks = [];
		const seps = [];
		let from = 0;
		for (const cut of cuts) {
			chunks.push(lines.slice(from, cut).join('\n'));
			seps.push(lines[cut]);
			from = cut + 1;
		}
		chunks.push(lines.slice(from).join('\n'));
		return fm + kept.map((i) => chunks[i]).join(`\n${seps[0] ?? '---'}\n`);
	}

	function chunkCount(source) {
		const src = normalizeSourceText(source);
		return slideBoundaries(src.slice(frontMatterBlockOf(src).length)).lines.length + 1;
	}

	const dir = path.join(__dirname, '..', '..', '..', 'examples');
	const decks = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ file: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }))
		.filter(({ src }) => frontMatterBlockOf(normalizeSourceText(src)) && chunkCount(src) >= 3);

	test('the corpus is the whole of examples/ minus what cannot be projected', () => {
		// Pinned exactly, not as `> 100`. A loose floor lets the front-matter filter silently start
		// skipping decks while the rate below still reads as a measurement over everything.
		const all = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
		assert.equal(all.length - decks.length, 3, 'exactly 3 example decks are unprojectable: 2 with no front matter, 1 under three slides');
		assert.ok(decks.length > 140, `expected the full corpus, saw ${decks.length}`);
	});

	for (const [shape, pick] of Object.entries(SHAPES)) {
		test(`every refusal under \`${shape}\` is a real cross-slide dependency`, () => {
			const refused = [];
			for (const { file, src } of decks) {
				const kept = pick(chunkCount(src));
				if (!kept.length || kept.length === chunkCount(src)) continue;
				if (crossSlideDrift(src, keepOnly(src, kept), kept, render)) refused.push(file);
			}
			assert.deepEqual(
				refused.sort(),
				[...EXPECTED[shape]].sort(),
				'a new refusal is either a real find or a regression — decide which, then update EXPECTED with its reason',
			);
		});
	}
});

/**
 * TWO GUARDS THAT ARE CORRECT TODAY AND WOULD BE SILENT IF THEY BROKE. Neither fires on any deck in
 * the tree, so neither is exercised by the corpus sweep — the shape of a test that certifies nothing.
 * Both are reachable through the INJECTED renderer, which is the other reason the caller supplies it.
 */
test.describe('the guards that cannot fire yet, driven through the injected renderer', () => {
	const chunks = [
		'<!-- _lens: brief -->\n\n# Cover\n\nQ3 board pack.\n',
		'\n# Internal\n\nSecret.\n',
		'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
	];
	const sec = (at, inner) => `<section data-authored-slide="${at}">${inner}</section>`;

	test('a proxy that renumbers its slides is called a PROXY defect, not a disclosure', () => {
		// What the blank-line placeholder did to every deck whose view dropped the cover: the proxy
		// rendered one section fewer, so hop 1 read each kept slide against a different one. Refusing was
		// right; refusing with "a `footer:` on an excluded slide" was a lie. Here the stub renderer
		// shortens the proxy — recognizable by the placeholder `emptyWithheld` writes — and nothing else.
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		const stub = (source) =>
			source.includes('<!-- -->')
				? sec(0, '<p>Cover</p>') + sec(1, '<p>The ask</p>')
				: sec(0, '<p>Cover</p>') + sec(1, '<p>Internal</p>') + sec(2, '<p>The ask</p>');
		const drift = crossSlideDrift(src, out.source, out.kept, stub);
		assert.ok(drift, 'a proxy that does not line up cannot certify anything');
		assert.equal(drift.channel, 'proxy', 'and it says so, so the message can tell the truth');
	});

	test("an author's own `tile-progress` div cannot delete the slide around it", () => {
		// The class name ships in `dist/lattice.css`, so every recipient of any export already has it.
		// With an open-ended `<div class="tile-progress"…>[\s\S]*?</div>` neutralizer, one bare marker
		// line above a paragraph borrows the engine's own closing tag and takes the paragraph out of the
		// comparison — measured, that turned a caught link-reference degradation into a clean export. A
		// depth-aware walk does not fix it; only matching the exact markup the renderer emits does,
		// because a self-contained pattern can only remove what it matched.
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		const forged = '<div class="tile-progress">';
		const stub = (source) => {
			const marking = source.includes('Internal') ? '<p>CONFIDENTIAL</p>' : '<p>[CONFIDENTIAL][c]</p>';
			return sec(0, `${forged}${marking}</div>`) + sec(1, '<p>x</p>') + sec(2, '<p>y</p>');
		};
		const drift = crossSlideDrift(src, out.source, out.kept, stub);
		assert.ok(drift, 'a marking that degraded behind a forged rail marker is still a degraded marking');
		assert.equal(drift.authored, 0);
	});

	test("the engine's own rail is still neutralized, whatever length it renders at", () => {
		// The other half of the same decision: matching the exact emitted shape has to keep buying the
		// 27-deck refusal class it was introduced for.
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		const rail = (dots) =>
			`<div class="tile-progress" aria-hidden="true">${'<span class="dot"></span>'.repeat(dots)}</div>`;
		const stub = (source) => {
			if (source.includes('Internal')) return sec(0, rail(3) + '<p>Cover</p>') + sec(1, rail(3) + '<p>Internal</p>') + sec(2, rail(3) + '<p>The ask</p>');
			if (source.includes('<!-- -->')) return sec(0, rail(2) + '<p>Cover</p>') + sec(1, rail(2)) + sec(2, rail(2) + '<p>The ask</p>');
			return sec(0, rail(2) + '<p>Cover</p>') + sec(1, rail(2) + '<p>The ask</p>');
		};
		assert.equal(crossSlideDrift(src, out.source, out.kept, stub), null, 'a rail of a different length is not drift');
	});
});

/** The decks `authorCss` refuses, across the WHOLE corpus and independent of projection shape — the
 *  cost of refusing rather than detecting, as a number that can fail rather than a claim in a
 *  changelog. All three also appear in the cross-slide corpus table below, but only under the shapes
 *  that actually withhold the slide carrying their `<style>`/`<script>`; `authorCss` refuses them under
 *  every reducing shape, and that difference is the real marginal cost of this decision. A fourth deck
 *  landing here is a widening a reviewer should have to look at.
 *
 *  `gallery-jargon.md` is here for its two `<script src>` tags, not for a stylesheet — a script can
 *  build one at run time, and that channel was measured leaking a positional rule past a version of
 *  this gate that only read `<style>` and `<link>`. */
const EXPECTED_AUTHOR_CSS = ['finish-backdrops.md', 'finish-override.md', 'gallery-jargon.md'];

/**
 * THE COST OF THE REFUSAL, MEASURED OVER THE REAL CORPUS rather than asserted in prose. `authorCss`
 * trades precision for soundness: it refuses every deck carrying CSS, including CSS that could not
 * possibly select by position. This is the arm that says what that costs, and it fails if a third deck
 * joins the set — the shape of a widening a reviewer should have to look at.
 */
test.describe('refusing on author CSS costs exactly these decks', () => {
	test('3 of the 150 example decks carry CSS of their own', () => {
		const fs = require('node:fs');
		const path = require('node:path');
		const { render } = engine;
		const { appendAutoGlossary } = require('../../../lib/core/glossary-auto.mjs');
		const dir = path.join(__dirname, '..', '..', '..', 'examples');
		const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
		assert.equal(files.length, 150, 'the corpus is the whole examples/ directory');
		const hits = [];
		for (const f of files) {
			const src = fs.readFileSync(path.join(dir, f), 'utf8');
			// THE SAME INPUT THE CLI HANDS THE GATE, and getting that wrong is how this test has already
			// lied twice. It once rendered the raw source while the CLI rendered the MERMAID-BAKED one,
			// and the difference was 25 decks — mmdc bakes a `<style>` into every SVG, so every deck with
			// a diagram was refused while this reported 2. Then the CLI moved to the author's source and
			// gained `appendAutoGlossary`, which emits each `acronyms:` DEFINITION verbatim, so a
			// `<style>` written in a definition ships without passing here. A measurement whose input is
			// not the shipping input is the right answer to the wrong question (#23), and its number went
			// into a changelog, a skills doc and a PR body before anyone re-derived it on the real CLI.
			if (authorCss(render(appendAutoGlossary(src)).html, frontMatterBlockOf(normalizeSourceText(src)))) hits.push(f);
		}
		assert.deepEqual(hits.sort(), EXPECTED_AUTHOR_CSS, 'a deck joining or leaving this set is a decision');
	});

	test("the engine's own generated CSS is not the author's, and a diagram is the case that proves it", () => {
		// mmdc bakes a `<style>` into every SVG it emits. If the gate is ever pointed at a post-bake
		// document again, this fails — which is the arm the corpus count above could not be, because both
		// it and the code under test would have moved together.
		const mermaidSvg = '<section data-authored-slide="0"><div class="mermaid-svg"><svg id="lattice-mmd-1"><style>#lattice-mmd-1{font-family:X}</style></svg></div></section>';
		assert.deepEqual(authorCss(mermaidSvg, 'marp: true\n'), { channel: 'style' }, 'a baked diagram DOES look like author CSS');
		// ...which is exactly why the CLI must hand it the author's source instead. Same deck, unbaked:
		assert.equal(authorCss('<section data-authored-slide="0"><pre class="mermaid">graph TD; A-->B</pre></section>', 'marp: true\n'), null);
	});
});

/**
 * DOES THE DECK CARRY CSS OF ITS OWN? The question a reducing projection refuses on.
 *
 * Not "is this CSS dangerous" — that question was asked three times, by three different instruments,
 * and lost three times to three different unbounded spaces (spellings, then selector syntax, then
 * ways to hide a thing). This one has a bounded answer, because you cannot write positional CSS
 * without writing CSS.
 *
 * It reads the RENDERED slide markup, not the markdown, and these tests pin why that matters: a
 * `<link>` and a `<style>` inside an inlined SVG both put author CSS in the document while leaving no
 * `<style>` in the source, and both walked past the source-level version. The engine's own stylesheets
 * are attached downstream of the render and are not in this markup at all, so a `<style>` here was
 * written by the author.
 */
test.describe('a deck that carries CSS of its own cannot be projected', () => {
	test('front-matter `style:`, in both YAML spellings', () => {
		assert.deepEqual(authorCss('<section></section>', 'marp: true\nstyle: "p { color: red }"\n'), { channel: 'front-matter' });
		assert.deepEqual(authorCss('<section></section>', 'marp: true\nstyle: |\n  p { color: red }\n'), { channel: 'front-matter' });
	});

	test('a `<style>` in the slide markup', () => {
		assert.deepEqual(authorCss('<section><style>p{color:red}</style></section>', 'marp: true\n'), { channel: 'style' });
	});

	test('a `<style>` inside an inlined SVG — one of the six that walked past asking about selectors', () => {
		// An SVG `<style>` is document CSS like any other. Nothing distinguishes it here, which is the
		// point: this asks whether CSS is present, not where it came from or what it says.
		const html = '<section><svg viewBox="0 0 10 10"><style>rect{fill:red}</style><rect/></svg></section>';
		assert.deepEqual(authorCss(html, 'marp: true\n'), { channel: 'style' });
	});

	test('a `<link rel=stylesheet>`, quoted or bare, and the alternate spellings', () => {
		for (const rel of ['"stylesheet"', "'stylesheet'", 'stylesheet', '"alternate stylesheet"']) {
			assert.deepEqual(authorCss(`<section><link rel=${rel} href="x.css"></section>`, ''), { channel: 'link' }, rel);
		}
	});

	test('and a deck with none of the three is not refused', () => {
		assert.equal(authorCss('<section><p>Just words.</p></section>', 'marp: true\ntheme: indaco\n'), null);
		// A front-matter key that merely CONTAINS "style" is not `style:` — `_style:` and `styles:` are
		// different keys, and a deck should not be refused for one.
		assert.equal(authorCss('<section></section>', 'marp: true\nstyles: nope\n'), null);
		// An empty `style:` declares no CSS, so there is nothing that could select by position.
		assert.equal(authorCss('<section></section>', 'marp: true\nstyle: ""\n'), null);
	});

	test('a `<link>` is refused on its TAG NAME, favicon and all — the test has no attributes to parse', () => {
		// The first version asked whether `rel` said `stylesheet`, which is an attribute parse spelled as
		// a regex. `[^>]*` cannot cross a `>`, so `<link title="a>b" rel=stylesheet …>` walked past it,
		// and a byte pattern knows nothing of entities, so `rel="&#115;tylesheet"` did too — both measured
		// shipping a positional rule into an exported PDF at exit 0. That is the unbounded-spelling defeat
		// the FIRST retired detector died of, smuggled back into the presence test. A tag name has no
		// spellings. The price is a deck whose only `<link>` is a favicon; the engine emits none into slide
		// markup, so nothing but author markup ever reaches this.
		for (const tag of [
			'<link rel="stylesheet" href="x.css">',
			'<link title="a>b" rel="stylesheet" href="x.css">',
			'<link rel="&#115;tylesheet" href="x.css">',
			'<link rel="icon" href="f.png">',
		]) {
			assert.deepEqual(authorCss(`<section>${tag}</section>`, ''), { channel: 'link' }, tag);
		}
	});

	test('a comment does NOT hide a tag, and that is the second time it was decided', () => {
		// Skipping comments was a nicety — so a deck that merely MENTIONS `<style>` in a note is not
		// refused — and buying it meant deciding, from a string, which bytes a PARSER calls a comment.
		// That is a hand-rolled tokenizer, and it failed the way hand-rolled tokenizers do: a `<!--`
		// inside an ATTRIBUTE VALUE is ordinary text to a browser and a comment opener to a backward
		// scan, so ONE such attribute anywhere in a deck blinded all three channels on every later
		// slide. Measured: a document-wide off switch that shipped a hidden paragraph into an exported
		// PDF at exit 0. `<![CDATA[`, `<title>`, `<textarea>` and an unquoted attribute did it too.
		//
		// So the tag wins wherever it appears. The cost is refusing a deck that talks about `<style>` in
		// a comment, which the author fixes by deleting the comment; the benefit is that there is no
		// tokenizer to be wrong.
		assert.deepEqual(authorCss('<section><!-- drop the <style> hack --></section>', ''), { channel: 'style' });
		// The attribute that used to be an off switch:
		const kill = '<span title="<!--">.</span>';
		assert.deepEqual(authorCss(`<section>${kill}</section><section><style>p{}</style></section>`, ''), { channel: 'style' });
		assert.deepEqual(authorCss(`<section>${kill}</section><section><link rel=stylesheet></section>`, ''), { channel: 'link' });
		assert.deepEqual(authorCss(`<section><![CDATA[ <!-- ]]></section><section><script>x</script></section>`, ''), { channel: 'script' });
	});

	test('a `<script>` is a CSS channel, because it can build one at run time', () => {
		// Three lines on a KEPT slide put a positional rule in the shipped document with no `<style>`
		// anywhere in the markup, measured hiding a sentence in the full render and showing it in the
		// projection at exit 0. `crossSlideDrift` catches a script on a WITHHELD slide, because that one
		// differs between the two renders; a kept-slide script is byte-identical on both sides.
		assert.deepEqual(authorCss('<section><script>document.head.appendChild(s)</script></section>', ''), { channel: 'script' });
		assert.deepEqual(authorCss('<section><script src="x.js"></script></section>', ''), { channel: 'script' });
	});

	test('the front matter is asked FIRST, because the render cannot show it', () => {
		// The CLI injects `style:` into the document downstream of the render, so it never appears in
		// the slide markup. A version that only read the markup would pass every deck using it.
		assert.deepEqual(authorCss('<section><p>No style element here.</p></section>', 'style: |\n  section:nth-of-type(3) p { display: none }\n'), { channel: 'front-matter' });
	});
});

/**
 * WHAT THE COMPARISON IS DELIBERATELY BLIND TO, pinned so widening it is a visible decision.
 *
 * Each neutralizer buys a class of false alarm and sells a class of finding, and the list only grows.
 * `lib/diagnostics/slice-equivalence-core.mjs` — the repo's other "compare two renders of the same
 * slide" kernel — pins its own set for exactly this reason, in its own words: "Every neutralizer
 * flatters the result, so each is named and each is a choice… adding an entry back is not a tuning
 * knob." Changing this constant is how the next entry gets a reviewer.
 */
/**
 * A DIAGRAM'S BAKE INDEX IS POSITION-DERIVED, and the corpus sweep structurally cannot see it.
 *
 * `preprocessMermaid` stamps each diagram with its position in that render's own request list. The
 * proxy empties a withheld slide's body, so it renders one fewer diagram and every later stamp shifts
 * by one — and hop 1's section compare reported a kept slide as drifted on nothing but that number.
 * Measured on the real CLI: 6 of 6 shipped decks with a diagram refused any view that dropped one,
 * with a `cross-slide` message naming a `footer:`/`class:`/`<style>` none of those decks contains.
 *
 * The 147-deck sweep below drives `engine.render` DIRECTLY, with no mermaid bake, so `data-mmd-idx`
 * appears on neither side of any of its 882 comparisons — it certified the check clean over a document
 * the CLI does not produce. That is the same defect the author-CSS gate had one commit earlier, in the
 * sibling check, and this arm exists because a corpus measurement could not be the one to catch it.
 */
test.describe('a diagram\'s bake index does not read as drift', () => {
	/** A slide carrying `body`, with a diagram stamped by its position in THIS render when `idx` is
	 *  given. The body is keyed to the slide's CONTENT, not its number — a projection renumbers the
	 *  slide, and text that moved with the number would fail hop 2 for a reason this test is not about. */
	const sec = (at, idx, body) =>
		`<section data-authored-slide="${at}">${idx === null ? '' : `<div class="mermaid-svg" data-mmd-idx="${idx}"><svg></svg></div>`}<p>${body}</p></section>`;

	test('a withheld diagram shifts every later stamp, and that is not a finding', () => {
		const chunks = [
			'<!-- _lens: brief -->\n\n# Cover\n\nQ3.\n',
			'\n# Internal\n\n```mermaid\ngraph TD; A-->B\n```\n',
			'\n<!-- _lens: brief -->\n\n# The ask\n\n```mermaid\ngraph TD; C-->D\n```\n',
		];
		const src = deckFrom(chunks);
		const out = projectForExport(src, ['brief']);
		// Three documents, three stampings, and the shift is the whole point: slide 2's diagram is the
		// SECOND baked in the full deck and the FIRST once slide 1 is emptied or dropped.
		const stub = (source) => {
			if (source.includes('Internal')) return sec(0, null, 'Cover') + sec(1, 0, 'Internal') + sec(2, 1, 'Ask');
			// The proxy keeps the deck's length — slide 1 is present and empty, so the Ask's diagram is
			// the first baked rather than the second.
			if (source.includes('<!-- -->')) return sec(0, null, 'Cover') + sec(1, null, '') + sec(2, 0, 'Ask');
			// What ships: two slides, renumbered, same stamping as the proxy.
			return sec(0, null, 'Cover') + sec(1, 0, 'Ask');
		};
		assert.equal(crossSlideDrift(src, out.source, out.kept, stub), null, 'a renumbered bake index is not the deck changing');
	});
});

test.describe('the neutralizer set is a pinned decision, not a growing convenience', () => {
	test('the axes the comparison forgives are exactly these eight', () => {
		assert.deepEqual(Object.keys(POSITION_NEUTRALIZERS).sort(), [
			'accent',
			'attrs',
			'mermaidScope',
			'pageNumber',
			'rail',
			'sectionNumber',
			'svgDefs',
			'watermark',
		]);
		for (const [axis, why] of Object.entries(POSITION_NEUTRALIZERS)) {
			assert.ok(why.length > 20, `${axis} needs a reason a reviewer can weigh, not a label`);
		}
	});
});

test.describe('the render must number its slides the way the projection did', () => {
	test('a page-multiplier that forgets to mark its break is caught', () => {
		// `_focusSteps` did exactly this: each focus copy counted as a new authored slide, so the
		// carrier's map pointed at the wrong slides on `examples/focus.md`. The mark is fixed, and this
		// checks the INVARIANT rather than that one rule, so the next multiplier fails here too.
		const html = '<section data-authored-slide="0"></section><section data-authored-slide="1"></section>';
		assert.equal(authoredIndexDrift(html, 2), null, 'agreeing renders pass');
		assert.deepEqual(authoredIndexDrift(html, 3), { saw: [0, 1] }, 'a short count is caught');
		const shifted = '<section data-authored-slide="0"></section><section data-authored-slide="2"></section>';
		assert.deepEqual(authoredIndexDrift(shifted, 2), { saw: [0, 2] }, 'so is a gap');
	});

	test('_focusSteps keeps every copy on ONE authored slide', () => {
		const src = '---\nmarp: true\ntheme: indaco\n---\n\n# One\n\n---\n\n<!-- _focusSteps: a | b | c -->\n\n# Two\n\n---\n\n# Three\n';
		const ids = [...engine.render(src).html.matchAll(/data-authored-slide="(\d+)"/g)].map((m) => m[1]).join(',');
		assert.equal(ids, '0,1,1,1,2', 'three focus copies, one authored slide');
	});
});

test.describe('front-matter `captions:` is projected onto the slides that ship', () => {
	// A SECOND INDEX-KEYED CHANNEL the prune did not see. `captions:` is keyed by 1-based AUTHOR
	// SLIDE NUMBER, so leaving it alone leaked a withheld slide's caption verbatim into the envelope
	// — "LEAKED CAPTION - we expect to lose the Acme suit" in an export that withheld the slide it
	// belonged to — and, with `--captions`, spoke it over a DIFFERENT slide, because key 2 still
	// addressed the second slide and the second slide had changed.
	const capDeck = (chunks) => deckFrom(chunks).replace(
		'---\nmarp: true\ntheme: indaco\n',
		'---\nmarp: true\ntheme: indaco\ncaptions:\n  1: Welcome.\n  2: LEAKED - we expect to lose the Acme suit.\n  3: Please approve.\n',
	);
	const chunks = [
		'<!-- _lens: brief -->\n\n# Cover\n\nQ3.\n',
		'\n# Internal\n\nSecret.\n',
		'\n<!-- _lens: brief -->\n\n# The ask\n\nApprove.\n',
	];

	test('a withheld slide\u2019s caption does not ship, and the survivors are renumbered', () => {
		const out = projectForExport(capDeck(chunks), ['brief']);
		assert.equal(out.ok, true);
		assert.doesNotMatch(out.source, /LEAKED/, 'the withheld slide\u2019s caption is gone');
		assert.match(out.source, /\n {2}1: Welcome\./, 'slide 1 keeps its number');
		assert.match(out.source, /\n {2}2: Please approve\./, 'and slide 3 becomes slide 2, so it narrates the right slide');
	});

	test('a deck with no captions block is untouched', () => {
		const out = projectForExport(deckFrom(chunks), ['brief']);
		assert.equal(out.ok, true);
		assert.doesNotMatch(out.source, /captions:/);
	});

	test('and a captions block whose every entry was withheld loses its dangling header', () => {
		const only2 = deckFrom(chunks).replace(
			'---\nmarp: true\ntheme: indaco\n',
			'---\nmarp: true\ntheme: indaco\ncaptions:\n  2: LEAKED - internal only.\n',
		);
		const out = projectForExport(only2, ['brief']);
		assert.equal(out.ok, true);
		assert.doesNotMatch(out.source, /LEAKED/);
		assert.doesNotMatch(out.source, /captions:/, 'no empty block left behind');
	});
});
