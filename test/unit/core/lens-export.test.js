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

const { authoredIndexDrift, crossSlideDrift, projectForExport, exportableViews, REFUSAL_REASONS } = require('../../../lib/core/lens-export.mjs');
const { frontMatterBlockOf, slideBoundaries } = require('../../../lib/core/slide-boundaries.mjs');
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
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
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
