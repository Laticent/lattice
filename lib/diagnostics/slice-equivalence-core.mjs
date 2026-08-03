/**
 * Slice/deck equivalence — the PURE core, shared by the two surfaces that ask the same question.
 *
 * THE QUESTION. The preview shows one slide. Rendering that slide ALONE is far cheaper than
 * re-parsing the whole deck on every keystroke — but a slide can render things whose value comes
 * from OTHER slides (its page number, its section on the progress rail, its `cat-N` hue). So:
 * **does the slide rendered alone come out the same as that slide rendered inside the deck?**
 *
 * Two surfaces ask it, and neither should own the answer alone (HARD RULE #15, and the shape
 * lib/authoring/lint-core.js already set — pure, fs-free, so it bundles for the browser):
 *
 *   - `tools/slice-equivalence.mjs` — HEADLESS. Sweeps every committed deck and reports a rate
 *     against a committed baseline. No browser, so it can be automated and gated.
 *   - `docs/src/components/studio/PreviewFidelityOverlay.tsx` — AUTHOR-FACING. Answers it for the
 *     one slide in front of the author, on their real device, when something looks wrong.
 *
 * This module holds only what BOTH need: how to cut a deck into slides, how to rebuild the
 * directive context a slice lost, **what deck position may be handed to a slice render**, how to
 * compare two renders fairly, and how to name a difference. Nothing here touches `fs`, the network,
 * or the DOM.
 *
 * The position half arrived late and is the reason the sweep can fail at all: while
 * `positionIsTrustworthy` / `deckSectionFor` lived only in `docs/src`, the headless sweep rendered
 * every slice with no supplied position and would have passed with the shipped repair stubbed out.
 * See THE SUPPLIED DECK POSITION below.
 *
 * NO IMPORTS, on purpose — the same constraint lib/authoring/lint-core.js works under, for the same
 * reason. The engine's directive VOCABULARY lives in lib/engine/directives.js, which is CommonJS;
 * the docs bundler resolves `lib/**.mjs` as ESM but will not do named-export interop on a CJS file
 * there, so importing it would break the browser build outright. The vocabulary is DATA, not logic,
 * so `synthesizePrelude` takes it as an argument: the Node CLI hands it the real sets, and the
 * browser — which never synthesizes a prelude, only compares renders — never loads it at all.
 */

/** Leading YAML front matter, or '' — kept verbatim so a slice renders under the deck's globals. */
export function frontMatterOf(src) {
	return (/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(String(src ?? '')) || [''])[0];
}

/** Fence-aware slide split — a `---` inside a fenced block is a horizontal rule, not a boundary. */
export function splitSlides(body) {
	const out = [[]];
	let fence = null;
	for (const line of String(body ?? '').split('\n')) {
		const m = /^[ \t]*(```|~~~)/.exec(line);
		if (m) fence = fence === m[1] ? null : (fence ?? m[1]);
		// `\r?` — a CRLF deck's boundary carries a trailing \r after split('\n'), so without this the
		// whole deck collapses to ONE chunk, misaligns against the engine's section count, and is
		// dropped from the sweep with no output at all. `frontMatterOf` already tolerates CRLF.
		if (!fence && /^-{3,}[ \t]*\r?$/.test(line)) {
			out.push([]);
			continue;
		}
		out[out.length - 1].push(line);
	}
	return out.map((l) => l.join('\n'));
}

/**
 * The running-global directives in force when slide `k` renders, rebuilt as a prelude.
 *
 * A directive comment WITHOUT the `_` spot prefix applies to its slide AND every one after, so a
 * slice loses everything it inherited. This is the GENERAL repair — unlike a page number or a
 * section index, a running `header:` is text, so there is no count to hand over; the context has to
 * be reconstructed and the engine left to derive from it.
 *
 * Keyed on the ENGINE's own vocabulary, in both directive spellings:
 *   - `key: value` — only for a key the engine actually knows. Treating any `name: value` comment
 *     as a running global injected slide-local `describe:` notes into every later slide (32 false
 *     mismatches, all this synthesizer's fault rather than the engine's).
 *   - the bare flag form — `build`, `debug` and `lens` are legal written `<!-- build -->`
 *     (FLAG_DIRECTIVES). Missing them UNDER-synthesizes the prelude, which likewise reports a
 *     mismatch this file caused. Found in review.
 *
 * `vocab` is `{ known, flags }` — the engine's own `KNOWN_DIRECTIVES` / `FLAG_DIRECTIVES` sets,
 * injected rather than imported (see the module header).
 */
export function synthesizePrelude(slides, k, vocab) {
	// REQUIRED, and it throws rather than defaulting to empty sets. An empty vocabulary silently
	// synthesizes an empty prelude for every slide — which reads as a plausible equivalence rate and
	// moves the baseline band by 0.0 points, so nothing anywhere would catch a caller that dropped
	// the argument. A loud failure is the only detectable one.
	if (!vocab?.known || !vocab?.flags) throw new TypeError('synthesizePrelude needs { known, flags } — the engine directive vocabulary');
	const known = vocab.known;
	const flags = vocab.flags;
	const running = new Map();
	for (let i = 0; i < k && i < slides.length; i++) {
		// BLANK FENCED CODE FIRST. A deck that documents `<!-- header: … -->` inside a ```md fence
		// would otherwise have that directive injected as a running global into every later slice —
		// the same defect class as the `describe:` bug this function's own header describes fixing
		// (32 mismatches the synthesizer caused, not the engine). `splitSlides` above is already
		// fence-aware and `positionIsTrustworthy` strips fences before testing; this was the odd one out.
		const src = String(slides[i] ?? '').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
		for (const m of src.matchAll(/<!--\s*([A-Za-z][\w]*)\s*(?::\s*([\s\S]*?))?-->/g)) {
			const [, key, value] = m;
			if (value === undefined) {
				if (flags.has(key)) running.set(key, '');
				continue;
			}
			if (known.has(key)) running.set(key, value.trim());
		}
	}
	return [...running].map(([key, v]) => (v === '' ? `<!-- ${key} -->` : `<!-- ${key}: ${v} -->`)).join('\n');
}

/** The rendered `<section>` elements of an engine render, in order. */
export function sectionsOf(html) {
	return String(html ?? '').match(/<section[\s\S]*?<\/section>/g) || [];
}

/**
 * Why an index CANNOT identify a slide in this render — or `undefined` when it can.
 *
 * THE ONLY COPY. It briefly had three — this one, `narrowToSlide`'s inline checks, and the compare
 * closure's — and they diverged within four days of being written: `narrowToSlide` let a MISSING
 * `slideCount` through and narrowed on the index alone, and the compare's copy was missing the raw
 * `<section` tally. Both now call this. That matters more than tidiness, because the two copies
 * disagreed in the DANGEROUS direction: narrowing without a count is exactly the
 * `_focusSteps` / `split: headings` case where "slide k" is not section k, so the preview paints a
 * slide the author did not select — worse than the wrong page number this whole path exists to fix.
 *
 * Fails CLOSED: every "unsure" returns a reason, and the caller reports it (or falls back) instead
 * of comparing a pair it cannot prove is the right one. A caller that does not know its slide count
 * gets no narrowing at all; every production caller passes one.
 */
export function alignmentFailure(deckHtml, sections, slideCount, slideIndex) {
	const opens = (String(deckHtml ?? '').match(/<section\b/g) || []).length;
	if (opens !== sections.length) return 'the deck contains nested or unbalanced `<section>` markup, so the slides cannot be told apart';
	if (typeof slideCount !== 'number') return 'this view does not know how many slides the deck has, so an index cannot identify one';
	if (sections.length !== slideCount) return `the deck renders ${sections.length} slides where the editor counts ${slideCount}, so an index can't identify this one`;
	if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= sections.length) return 'the deck renders no slide at this index';
	return undefined;
}

// ── THE SUPPLIED DECK POSITION ───────────────────────────────────────────────
// A slice renders "1 of 1" because the engine derives a slide's number from its ordinal among the
// sections of the document it parses. The repair is not to teach the engine a second numbering
// mode but to HAND IT the position the caller already holds (`page` on the render opts,
// lib/engine/index.js). These three functions decide what may be handed over.
//
// THEY LIVE HERE BECAUSE THE SWEEP HAS TO RUN THE SAME ONES. They were written in
// `docs/src/lib/single-slide-render.ts`, which the headless sweep cannot import (it is a browser
// module, and importing it would drag the whole docs bundle into a Node CLI). The result was a
// sweep that rendered all 1201 corpus slides with no supplied position at all: it reproduced the
// pre-#1272 behavior faithfully and would have passed with `positionIsTrustworthy` stubbed to
// `return false` — the originally reported bug, fully restored, at 0.0 points of movement. Moving
// the decision to the shared pure core is what makes the measurement able to fail (HARD RULE #1:
// one owner, both callers).
//
// All three are pure string functions over the deck source. `docs/src` imports them; nothing here
// touches the DOM.

/**
 * The CALLER-SIDE slide separator: `---` (three or more hyphens) alone on a line, flanked by
 * newlines. A FACTORY, not a shared RegExp — a `/g` literal carries `lastIndex`, and two modules
 * sharing one instance interleave their scans.
 *
 * **This is not the engine's splitter, and it never can be.** The engine breaks on any markdown-it
 * `hr` token (`***`, `___`, `- - -`, `---` with a trailing space) AFTER a full parse; the caller
 * needs an answer on every keystroke, in a browser, before the engine bundle has even loaded, so it
 * scans text. That is a deliberate difference in kind, not a duplication to be merged — and it is
 * exactly why `positionIsTrustworthy` exists: it enumerates the shapes on which the two can
 * disagree and refuses to supply a position for any of them.
 *
 * What CAN be shared is the definition of the separator itself, which is what this is. Four copies
 * of the literal existed across `docs/src/components/studio/lint.ts`, `positionIsTrustworthy` and
 * `deckSectionFor` (twice); a change to any one of them silently desynchronized the rail, the
 * editor↔preview sync, and the supplied position from each other.
 */
export function slideSeparatorRe(flags = '') {
	return new RegExp('\\n-{3,}\\n', flags);
}

/** Cut `text` on the caller-side separator — the chunk list `lint.ts::splitSlides` counts. */
function callerChunks(text) {
	return String(text ?? '').split(slideSeparatorRe());
}

/**
 * Can the caller's slide indices be TRUSTED as engine section indices?
 *
 * Supplying a page position is only sound if "slide k of N" means the same thing to the caller and
 * to the engine. The whole-deck route VERIFIES that (it bails when the section count disagrees and
 * falls back to an honest 1-of-1); the slice route has no such backstop, so it has to earn the
 * right to supply a number.
 *
 * WHY A PROBE IS NOT ENOUGH, and how this was caught. An earlier cut gated on a `split: headings`
 * probe — but heading splitting is the DEFAULT (`DEFAULT_SPLIT` in lib/core/resolve-split.js), so a
 * deck splits on headings with no directive to match. A deck whose `---` chunk carries two
 * top-level h1/h2 therefore renders THREE sections while the caller counts TWO slides, and the
 * preview confidently painted "2 of 2" where the truth was "3 of 3". On the whole-deck route the
 * same deck failed CLOSED to "1 of 1". Trading an honest fallback for a plausible lie is strictly
 * worse than the bug being fixed.
 *
 * So this COUNTS what the engine will produce, conservatively, and returns false the moment it is
 * unsure. Every "unsure" costs only the optimization — the render falls back to no supplied
 * position, i.e. exactly the pre-existing 1-of-1 — so the failure direction is honest, never wrong.
 */
export function positionIsTrustworthy(deck, slideCount) {
	if (!(typeof slideCount === 'number' && slideCount > 0)) return false;
	const body = String(deck ?? '')
		.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '') // front matter
		.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, ''); // fenced code — never a boundary

	// A `_focusSteps` slide becomes one slide PER STEP; the count is not derivable here at all.
	if (/<!--\s*_?focusSteps\s*:/.test(body)) return false;
	// An hr form the caller's `\n---\n` splitter does not recognize but markdown-it does (`***`,
	// `___`, `- - -`, `---` with trailing space). Either side miscounts; bail.
	if (/^[ \t]*(?:\*[ \t]*\*[ \t]*\*[-* \t]*|_[ \t]*_[ \t]*_[_ \t]*|-[ \t]+-[ \t]+-[- \t]*|-{3,}[ \t]+)$/m.test(body)) return false;

	const chunks = callerChunks(body);
	if (chunks.length !== slideCount) return false; // the caller and this splitter already disagree

	// A `---` INSIDE AN HTML COMMENT. The caller's line scan splits on it; markdown-it does not,
	// because the comment is one block. The counts then differ by one in the direction the chunk
	// check above cannot see (the caller believes the larger number and so does this splitter).
	// `(?:(?!-->)[\s\S])*?`, NOT `[\s\S]*?`. A lazy any-run happily spans an intervening `-->`, so
	// `<!-- _class: a -->` … `\n---\n` … `<!-- _class: b -->` matched as ONE comment containing a
	// separator — which is nearly every deck in the corpus. Measured before the fix: 126 of 128 decks
	// refused, i.e. the whole optimization silently switched off while every test stayed green.
	if (/<!--(?:(?!-->)[\s\S])*?\n-{3,}\n(?:(?!-->)[\s\S])*?-->/.test(body)) return false;

	// Heading splitting is ON unless the deck opts out, and it inserts a break before every
	// top-level h1/h2 after the first in a chunk.
	const splitsOnHeadings = !/^\s*split\s*:\s*(rule|none|off)\b/m.test(deck);
	if (splitsOnHeadings) {
		// SETEXT HEADINGS SPLIT TOO, and counting only ATX missed them entirely. `Interlude` over a
		// row of `=` is an h1 to markdown-it and invisible to `^#{1,2}`, so a 3-chunk deck rendered 4
		// sections while this returned TRUE — and the preview painted "3" on the slide the deck
		// numbers 4. That is the "plausible lie" this function exists to prevent, so the response is
		// to REFUSE rather than to try to count them: an underline's validity depends on what the
		// paragraph above it is, which is a parse, not a scan.
		//
		// The `-` underline is the worse half: `Text` over `---` is a setext h2 to markdown-it and a
		// SLIDE SEPARATOR to the caller, so the two disagree about the same three characters.
		if (/^(?![ \t]*$)(?![ \t]{0,3}(?:#|>|-|\*|\+|\d+[.)]|```|~~~))[^\n]+\n[ \t]{0,3}(?:=+|-+)[ \t]*$/m.test(body)) return false;
		for (const chunk of chunks) {
			// Column-0 ATX is unambiguous: always a top-level heading, always divides after the first.
			let headings = (chunk.match(/^#{1,2}[ \t]+\S/gm) || []).length;
			// An ATX indented 1–3 spaces is ALSO a top-level heading to markdown-it — anchoring at
			// column 0 let `  ## Two` split for the engine while staying invisible here. But the same
			// indent is how a heading sits INSIDE A LIST ITEM, where it is list content and does not
			// divide at all. Counting both alike over-refused that shape and broke a real committed
			// case (`- item` / `  # nested`), so an indented heading counts only when nothing earlier
			// in the chunk opened a list. Telling the two apart properly is a parse; this errs toward
			// refusing, which costs the fast path and never a wrong number.
			for (const m of chunk.matchAll(/^[ \t]{1,3}#{1,2}[ \t]+\S/gm)) {
				if (!/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+\S/m.test(chunk.slice(0, m.index))) headings += 1;
			}
			if (headings > 1) return false;
		}
	}
	return true;
}

/**
 * Which divider-delimited SECTION the shown slide sits in, and how many the deck has.
 *
 * The progress rail and the watermark glyph both derive this by walking every section
 * (`progress.transform.js`, `watermark.transform.js`), which is why a deck with dividers had to
 * re-render in full on every keystroke — 63ms of engine work per keypress on a 40-slide gallery
 * deck, against 3ms for a deck without them. It is the same positional metadata the page number is,
 * so the caller supplies it rather than making the engine recount.
 *
 * Only ever called behind `positionIsTrustworthy`, which is what guarantees chunk k IS section k.
 * `index` counts dividers at or before the shown slide, matching exactly where the transform's own
 * walk would have arrived; `total` is the deck's divider count. Both zero → no rail, which is also
 * what a deck with no dividers gets.
 */
export function deckSectionFor(deck, slideIndex) {
	const stripFm = String(deck ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
	// Blank every form of code the engine renders literally. A `_class: divider` inside a code
	// SAMPLE is documentation, not a directive — and decks that teach Lattice authoring are full of
	// them (examples/speaker-notes.md, split-headings.md, debug.md, …).
	const blankCode = (t) =>
		t
			.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '') // fenced
			.replace(/^(?: {4}|\t)[^\n]*$/gm, '') // indented block
			.replace(/`[^`\n]*`/g, ' '); // inline span

	// TOKEN-TEST the class value, exactly as the tiles do (`cls.split(/\s+/).includes('divider')` in
	// progress.transform.js / watermark.transform.js). A substring match counts `divider-lite` and
	// `section-divider` as dividers where the engine does not — the counter has to agree with the
	// consumer it is standing in for, not merely look similar.
	const dividerTokens = (chunk) => {
		const directives = [...chunk.matchAll(/<!--\s*_?class\s*:\s*([\s\S]*?)-->/g)];
		if (!directives.length) return false;
		const last = directives[directives.length - 1][1]; // last wins, as the engine resolves it
		return last.trim().split(/\s+/).includes('divider');
	};

	const chunks = callerChunks(blankCode(stripFm));
	const total = chunks.filter(dividerTokens).length;

	// FAIL SAFE, NOT FAIL WRONG. This is the property the gate design rests on, and it INVERTS the
	// moment a fact stops being a probe and becomes a counter. As a probe, matching a `divider`
	// mentioned in prose merely forced the whole-deck render: a wasted parse, correct output. As a
	// counter the same match paints an extra dot and bumps the watermark glyph — wrong output. Found
	// by an inversion review, reproduced: a slide showing `<!-- _class: divider -->` in an inline
	// code span rendered "02" against the deck's "01".
	//
	// The question is ONLY "does a divider appear inside code?", so compare the divider COUNTS with
	// and without code blanked. An earlier cut also compared chunk counts, which was wrong for a
	// different reason: a `---` inside a mermaid fence changes the chunk count without touching any
	// divider, and that bailed on gallery.md — the very deck the performance numbers measure,
	// silently reverting the win. Caught by two independent reviewers.
	if (callerChunks(stripFm).filter(dividerTokens).length !== total) return undefined;
	if (!total) return undefined;

	let index = 0;
	for (let i = 0; i <= slideIndex && i < chunks.length; i++) if (dividerTokens(chunks[i])) index += 1;
	return { index, total };
}

/**
 * The deck position that COULD be supplied for this slide — `{ offset, total, deckSection }`, or
 * `undefined` when nothing may be handed over.
 *
 * Split out because the answer has three consumers with different gates. The RENDER path supplies
 * it only on the slice route (a whole-deck render counts for itself; an offset there would shift
 * every section). The author-facing DIAGNOSTIC needs the same answer on either route, because its
 * job is to render the counterfactual — "what would the fast route have produced here?" — and the
 * fast route would have supplied it. The headless SWEEP asks for it on every slide, because every
 * slide it renders IS a slice.
 */
export function supplyablePosition(deck, slideIndex, slideCount) {
	return typeof slideIndex === 'number' && slideIndex >= 0 && positionIsTrustworthy(deck, slideCount)
		? { offset: slideIndex, total: slideCount, deckSection: deckSectionFor(deck, slideIndex) }
		: undefined;
}

/**
 * Neutralize differences before comparing two renders. **Every neutralizer flatters the result**,
 * so each is named and each is a choice.
 *
 * Defaults are the strict reading — nothing hidden unless a caller asks for it.
 *
 *   ids         positional `id="N"` — a counter from the document start (`idx + 1` in
 *               lib/engine/slides.js), so a slice is always `id="1"`. Supplying `page` does NOT
 *               repair it: the number the caller hands over drives pagination, not the anchor id.
 *               Invisible on the slide, and the residual a re-stamp would close.
 *   pagination  the `data-lattice-pagination` attribute AND its painted `.lat-pagination` span.
 *               They move together or not at all — neutralizing the attribute but not the span
 *               once read 34.2% where the truth was 90.5%.
 *   rail        the progress tile.
 *   whitespace  inter-block whitespace. An artifact of rendering a fragment rather than a deck:
 *               block adjacency shifts, so the body re-parses tight-vs-loose. Not a visible
 *               difference, and owed to a better instrument on both surfaces.
 */
export function normalizeSection(s, { ids = false, pagination = false, rail = false, whitespace = false } = {}) {
	let out = String(s ?? '');
	if (ids) out = out.replace(/\sid="\d+"/g, '');
	if (pagination) {
		out = out.replace(/data-lattice-pagination(?:-total)?="\d+"/g, '').replace(/(<span class="lat-pagination">)\d+(<\/span>)/g, '$1$2');
	}
	// DEPTH-AWARE, not `/<div class="tile-progress"[\s\S]*?<\/div>/`. lib/core/split-envelope.js names
	// that exact non-greedy-over-a-nestable-tag pattern and refuses it: the day a dot or a wrapper
	// inside the rail becomes a `<div>`, it truncates at the first close and carries half the rail
	// through. Today the children are `<span>`s, so it is a latent trap rather than a live bug —
	// which is when it is cheap to close (HARD RULE #15). It matters more here than there: the rail
	// neutralizer is worth ~24 points of the headline rate, so silently mis-stripping it would swing
	// the number and read as an engine regression.
	if (rail) out = stripRail(out);
	if (whitespace) out = out.replace(/>\s+</g, '><');
	return out.trim();
}

/**
 * What BOTH surfaces neutralize: only what no shipped repair closes yet.
 *
 * THIS USED TO BE A PAIR, and retiring it is the point of the change that did so. The sweep
 * rendered every slice with NO supplied position — it could not, since `positionIsTrustworthy` and
 * `deckSectionFor` lived in `docs/src` — so it hid `pagination` and `rail` to keep differences it
 * had no way to repair out of the prototype's score. That made ~81 of its 91.9 points neutralizer,
 * and it meant breaking `positionIsTrustworthy` outright moved `equiv:check` by **0.0 points**: the
 * sweep was measuring the pre-#1272 engine, not the shipped preview.
 *
 * Now that the supply functions live HERE and the sweep calls them, both surfaces run the same
 * repair and compare the same way, so the asymmetry has nothing left to express. A page number or a
 * rail that differs is now a real finding on BOTH — the sweep's rate falls when a shipped repair
 * breaks, which is the property the split was preventing.
 *
 * Adding an entry back is therefore not a tuning knob: it re-blinds the sweep to a repair that
 * ships. `test/unit/diagnostics/slice-equivalence-core.test.js` pins the set for that reason.
 */
export const RESIDUAL_NEUTRALIZERS = { ids: true, whitespace: true };

/**
 * Name WHY two normalized renders differ. The buckets map to the repair-cascade rows of
 * engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md §5, so a residual points
 * at the fix that would close it rather than at a raw diff.
 */
export function classifyDivergence(got, want) {
	// SPLIT, not fused. `cat-N` and the id counters were one bucket, and on the corpus it reads ~90
	// invisible id counters to 5 `cat-N` — so most of a bucket named for both was the harmless half,
	// and the visible half (a proof panel showing the wrong hue, the bug this whole feature line
	// exists to fix) was labeled with it. Worse, the overlay renders that bucket with a reassuring
	// line about a known repair being owed, which is the last thing an author should read when their
	// slide is actually the wrong color. Test them separately, most-visible first.
	const noIds = (s) => String(s ?? '').replace(GENERATED_ID, '');
	const noCat = (s) => String(s ?? '').replace(/\bcat-\d\b/g, '');
	if (noCat(got) === noCat(want)) return 'cat-N (categorical hue)';
	if (noIds(got) === noIds(want)) return 'generated ids (unscoped counter)';
	if (noIds(noCat(got)) === noIds(noCat(want))) return 'cat-N + generated ids';
	if (/tile-watermark/.test(got) !== /tile-watermark/.test(want)) return 'watermark glyph';
	// A rail on one side and not the other. Named because "unclassified" is useless to an author and
	// this one has a specific, statable meaning: no section position was supplied, which on the slice
	// route means `deckSectionFor` declined (its fail-safe: a `divider` inside code makes the deck's
	// own divider count ambiguous, so it refuses to guess rather than paint an extra dot).
	if (/tile-progress/.test(got) !== /tile-progress/.test(want)) return 'progress rail absent';
	return 'unclassified';
}

/**
 * Every id shape the engine MINTS from a document-start counter, so a normalizer can set them
 * aside. Two independent families, and leaving one out is what made 51 corpus slides read
 * `unclassified` when their whole difference was a counter offset:
 *
 *   · `lat-svgt-N` / `lat-svgd-N` — the `<svg>` title/desc wiring (lib/core/svg-a11y-names.js),
 *     numbered once per assembled document;
 *   · `pie-wedge-N`, `radar-area-N`, `chart-spine-N`, `gantt-fill-pass-N`, `q-tint-N` — chart
 *     `<defs>` gradients (lib/core/render-ids.js). The `[\w-]*` is load-bearing: callers own their
 *     id TEMPLATE, so the family name is a prefix, not the whole id (`gantt-fill` mints
 *     `gantt-fill-pass-1`) — a `-\d+` anchored straight to the family name misses it.
 *
 * DUPLICATED FROM `render-ids.js` ON PURPOSE — this module takes no imports (see the header) and
 * that one is CommonJS. `test/unit/diagnostics/slice-equivalence-core.test.js` reads its source and
 * fails if the two lists diverge, so the copy cannot rot silently.
 */
const GENERATED_ID = /\b(?:lat-svg[td]|pie-wedge|radar-area|chart-spine|gantt-fill|q-tint)[\w-]*-\d+\b/g;

/**
 * Break two rendered `<section>`s into the NAMED things that differ, rather than a window of raw
 * markup.
 *
 * WHY. Quoting the first N characters where two renders part company is honest but unreadable: it
 * lands mid-attribute and prints `ndaco" data-lattice-pagination="2" style="--paginate:true`, which
 * an author cannot act on. What actually differs between two renders of the same slide is almost
 * always one of three named things — a section attribute, a class token, or the text — and naming
 * them is the difference between a dump and a diagnostic.
 *
 * Returns one entry per difference, most identifiable first:
 *   { kind: 'attribute' | 'class' | 'text' | 'markup', name, got, want }
 * `got`/`want` are `undefined` when that side does not have the thing at all (a missing attribute,
 * a class only one side carries). `markup` is the honest fallback for a difference inside the body
 * that isn't attributable to any of the above — it carries the raw window, clearly labeled as the
 * last resort rather than the headline.
 */
export function diffSections(got, want) {
	const A = parseSectionTag(got);
	const B = parseSectionTag(want);
	const out = [];

	// Class TOKENS, compared as sets — the engine's own reading (`cls.split(/\s+/)`). Reporting the
	// whole class string would make one added token look like a wholesale rewrite.
	const ca = new Set(A.classes);
	const cb = new Set(B.classes);
	const onlyGot = A.classes.filter((c) => !cb.has(c));
	const onlyWant = B.classes.filter((c) => !ca.has(c));
	if (onlyGot.length || onlyWant.length) {
		out.push({ kind: 'class', name: 'class', got: onlyGot.join(' ') || undefined, want: onlyWant.join(' ') || undefined });
	}

	// Every other attribute on the section, by name. Sorted so the readout is stable between runs.
	for (const key of [...new Set([...Object.keys(A.attrs), ...Object.keys(B.attrs)])].sort()) {
		if (key === 'class') continue;
		if (A.attrs[key] !== B.attrs[key]) out.push({ kind: 'attribute', name: key, got: A.attrs[key], want: B.attrs[key] });
	}

	// The words on the slide. Compared after tag-stripping, so a markup-only difference does not
	// masquerade as changed copy.
	// The PAINTED page number lives in a `<span class="lat-pagination">`, so it lands in the visible
	// words — and the overlay deliberately keeps pagination un-neutralized so page-number differences
	// show. The result was that the single most expected finding came back as `text`, whose
	// explanation reads "the words on the slide differ … the strongest signal that the two renders
	// are not the same slide at all". They are the same slide, one character apart. Strip it here and
	// let the `lattice-pagination` attribute row carry it alone, which is what it is for.
	const dropPageNo = (t) => String(t ?? '').replace(/<span class="lat-pagination">[^<]*<\/span>/g, '');
	const ta = sectionText(dropPageNo(got));
	const tb = sectionText(dropPageNo(want));
	if (ta !== tb) out.push({ kind: 'text', name: 'text', got: ta || undefined, want: tb || undefined });

	// The raw window, as the LAST RESORT: the bodies differ but neither the section tag nor the words
	// explain it (a nested element's attribute, a reordered child).
	//
	// Gated on `ta === tb` DELIBERATELY, not incidentally. When the words already differ, that is the
	// bigger and more legible signal, and appending a markup window underneath it would add noise to
	// 755 of the corpus's 1076 real divergences. An earlier cut wrote `(!out.length || ta === tb)`,
	// which is the same condition with a dead disjunct — `ta !== tb` always pushes a row above, so
	// `!out.length` implies `ta === tb`. Stated plainly so the precedence reads as a choice.
	//
	// Bodies are compared WHITESPACE-COLLAPSED, because HTML collapses whitespace when it paints, so
	// a re-wrap is not a difference an author can see and reporting it would be noise dressed as a
	// finding. (`<pre>` is the exception where whitespace does paint — a known gap, and the caller's
	// empty-list wording is careful not to claim otherwise.)
	const ba = collapse(A.body);
	const bb = collapse(B.body);
	if (ba !== bb && ta === tb) {
		const d = firstDivergence(ba, bb);
		if (d) out.push({ kind: 'markup', name: 'markup', got: d.got, want: d.want });
	}
	return out;
}

/**
 * The opening `<section …>` tag broken into class tokens + attributes, plus everything inside it.
 *
 * Both regexes are QUOTE-AWARE, which matters because the failure mode of a naive one is a
 * confidently WRONG row rather than a missing one:
 *   - `[^>]*` for the tag stopped at the first `>`, so a value containing one (`data-x="a>b"`) cut
 *     the tag in half and the remainder surfaced as a difference labeled `text` — under a tap
 *     explanation reading "the words on the slide differ", quoting attribute markup.
 *   - matching only `="…"` made a single-quoted `class='a b'` parse as three empty attributes
 *     (`class`, `a`, `b`), inventing rows named after class tokens.
 * Neither is reachable from engine output today (markdown-it escapes `>` and always double-quotes),
 * but this parses author HTML too, and "wrong" is the expensive direction.
 *
 * THE ALTERNATIVES MUST STAY DISJOINT — the catch-all is `[^>"']`, not `[^>]`. With `[^>]` a quote
 * is matchable by BOTH the quoted branch and the catch-all, so a run of `""` decomposes
 * exponentially many ways and the regex backtracks catastrophically on a crafted section tag
 * (CodeQL js/redos, flagged high on this file). Excluding quotes from the catch-all leaves exactly
 * one parse. The cost is that an UNBALANCED quote inside a tag no longer matches at all — which
 * degrades to "no attributes named", the safe direction, rather than a wrong row.
 */
function parseSectionTag(html) {
	const s = String(html ?? '');
	const m = /^\s*<section\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(s);
	const attrs = {};
	for (const a of (m?.[1] ?? '').matchAll(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
		if (a[1]) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? '';
	}
	const classes = (attrs.class ?? '').trim().split(/\s+/).filter(Boolean);
	const body = m ? s.slice(m[0].length).replace(/<\/section>\s*$/i, '') : s;
	return { attrs, classes, body };
}

/**
 * Two values shortened around WHERE THEY DIFFER, not around their start.
 *
 * A naive head-truncation is useless for the values that actually show up here: two `style`
 * attributes that share 40 characters of custom properties before diverging both render as
 * `--paginate:tr…`, so the row says "these differ" and shows the part that doesn't. This finds the
 * first parting point and takes the window from there, marking any elision with an ellipsis so a
 * shortened value is never mistaken for the whole one.
 */
export function contrastValues(a, b, span = 14) {
	const x = String(a ?? '');
	const y = String(b ?? '');
	let i = 0;
	while (i < x.length && i < y.length && x[i] === y[i]) i += 1;
	// Back off a few characters so the window has a little of the shared run for context.
	const from = Math.max(0, i - 3);
	const cut = (v) => (from > 0 ? '…' : '') + v.slice(from, from + span) + (from + span < v.length ? '…' : '');
	return { got: cut(x), want: cut(y) };
}

/**
 * Remove the progress-rail tile, counting `<div>` depth so a nested one cannot truncate the strip
 * early. The repo's own prior art for this is lib/core/split-envelope.js's `matchingDivClose`; that
 * module is CommonJS and this one takes no imports (see the header), so the scan is repeated here
 * rather than the trap being repeated.
 */
function stripRail(html) {
	const open = /<div class="tile-progress"/g;
	let out = String(html ?? '');
	let m = open.exec(out);
	while (m) {
		let depth = 0;
		const i = m.index;
		const tag = /<div\b|<\/div>/g;
		tag.lastIndex = i;
		let t = tag.exec(out);
		while (t) {
			depth += t[0] === '</div>' ? -1 : 1;
			if (depth === 0) {
				out = out.slice(0, m.index) + out.slice(t.index + t[0].length);
				break;
			}
			t = tag.exec(out);
		}
		if (t === null) break; // unbalanced — leave the rest alone rather than eat the document
		open.lastIndex = m.index;
		m = open.exec(out);
	}
	return out;
}

/** Runs of whitespace to a single space — what HTML itself does when it paints. */
const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The visible words of a rendered section — tags stripped, whitespace collapsed.
 *
 * The tag pattern is QUOTE-AWARE for the same reason parseSectionTag's is: a naive `<[^>]*>` stops
 * at the first `>`, so an attribute value containing one leaks the rest of the tag into the "words"
 * and surfaces as a wording difference that quotes markup. Its alternatives are disjoint
 * (`[^>"']`, never `[^>]`) so it cannot backtrack exponentially — see parseSectionTag's note.
 */
export function sectionText(html) {
	return String(html ?? '')
		.replace(/<(?:"[^"]*"|'[^']*'|[^>"'])*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The first place two strings part company, with a little context either side — what an author
 * needs to SEE the difference, rather than a boolean telling them one exists. `span` is how much
 * of each side to quote.
 */
export function firstDivergence(got, want, span = 60) {
	const a = String(got ?? '');
	const b = String(want ?? '');
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
	if (i === a.length && i === b.length) return undefined;
	const from = Math.max(0, i - 12);
	return { at: i, got: a.slice(from, i + span), want: b.slice(from, i + span) };
}
