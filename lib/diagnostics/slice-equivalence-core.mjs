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
 * ONE IMPORT, and only one: `lib/core/slide-boundaries.mjs`, which is itself import-free. Every
 * other dependency is refused for the reason lib/authoring/lint-core.js refuses them — this has to
 * bundle for the browser. The engine's directive VOCABULARY lives in lib/engine/directives.js, which is CommonJS;
 * the docs bundler resolves `lib/**.mjs` as ESM but will not do named-export interop on a CJS file
 * there, so importing it would break the browser build outright. The vocabulary is DATA, not logic,
 * so `synthesizePrelude` takes it as an argument: the Node CLI hands it the real sets, and the
 * browser — which never synthesizes a prelude, only compares renders — never loads it at all.
 */

import { splitSlideChunks } from '../core/slide-boundaries.mjs';

/** Leading YAML front matter, or '' — kept verbatim so a slice renders under the deck's globals. */
export function frontMatterOf(src) {
	return (/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(String(src ?? '')) || [''])[0];
}

/**
 * Cut a deck body into slides on the engine's OWN boundary set.
 *
 * This used to be a private line scan for `/^-{3,}[ \t]*\r?$/` with a fence flag, and it disagreed
 * with the engine on `***`, `___`, `- - -` and an indented `---`, and with `slideSeparatorRe` — the
 * regex two functions in THIS FILE cut on — about a trailing space. A module holding two definitions
 * of its own subject is the shape #1271 named as the defect generator, so both are gone and
 * `lib/core/slide-boundaries.mjs` is the only one left.
 */
export function splitSlides(body) {
	return splitSlideChunks(body).chunks;
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
 * Cut `text` the way the CALLER counts slides.
 *
 * Formerly `text.split(slideSeparatorRe())` over a `\r?\n-{3,}\r?\n` literal that had four copies
 * in the tree. Amendment 4 of the preview-render-cost note made those four into one and argued the
 * caller's definition could never BE the engine's, because the engine decides after a full parse
 * and the editor needs an answer on every keystroke.
 *
 * The first half of that was right and the second was an assumption nobody measured. What the
 * caller needs is not the parse, it is the parse's ANSWER — and `lib/core/slide-boundaries.mjs`
 * reproduces that answer by scanning lines, in about 0.04ms on a 40-slide deck. So the caller-side
 * definition is gone rather than merely deduplicated, and the `hr`-form refusals below went with
 * it: there is no longer a form on which the two disagree.
 */
function callerChunks(text) {
	return splitSlideChunks(text).chunks;
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
	const source = String(deck ?? '');
	const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, ''); // front matter

	// A `_focusSteps` slide becomes one slide PER STEP; the count is not derivable here at all.
	if (/<!--\s*_?focusSteps\s*:/.test(body)) return false;

	// THREE REFUSALS RETIRED HERE, and it is worth naming them, because each was a real
	// divergence and none of them is one any more: an `hr` form the caller's splitter did not
	// recognize (`***`, `___`, `- - -`, `---` with a trailing space); a `---` inside an HTML
	// comment, which the caller split on and markdown-it did not; and a fenced `---`, which
	// was pre-stripped here by a regex that could not tell a ``` closer from a ~~~ one.
	// Boundaries now come from the engine's own parser, so refusing on any of them would cost
	// the fast path and buy nothing.
	//
	// AND NOTHING REPLACES THEM, which is the part worth stating. An interim cut of this fix
	// gated on a `certain` flag from a hand-written boundary scanner — a scanner that turned
	// out to be confidently wrong on six shapes, so the flag was reassurance rather than a
	// guard. A parse has no undecided answer: whatever the deck is mid-keystroke, it parses
	// here exactly as the engine parses it. What still refuses below is the HEADING-SPLIT
	// count, which is a different mechanism and genuinely not derivable without rendering.
	const chunks = splitSlideChunks(body).chunks;
	if (chunks.length !== slideCount) return false; // the caller and this splitter already disagree

	// Fenced code is blanked for the HEADING scan below, and only for it. The boundary split
	// above is already fence-aware and must see the real text; the heading counter is a plain
	// regex sweep, and a `# Not a heading` inside a ```md sample is exactly the false positive
	// it would refuse the whole deck over. Blanking used to happen once at the top, which
	// meant the splitter never saw a fence either — harmless while the splitter had its own
	// fence flag, wrong now that it is the one that gets fences right.
	const blankFenced = (t) => t.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');

	// Heading splitting is ON unless the deck opts out, and it inserts a break before every
	// top-level h1/h2 after the first in a chunk.
	const splitsOnHeadings = !/^\s*split\s*:\s*(rule|none|off)\b/m.test(source);
	if (splitsOnHeadings) {
		// SETEXT HEADINGS SPLIT TOO, and counting only ATX missed them entirely. `Interlude` over a
		// row of `=` is an h1 to markdown-it and invisible to `^#{1,2}`, so a 3-chunk deck rendered 4
		// sections while this returned TRUE — and the preview painted "3" on the slide the deck
		// numbers 4. That is the "plausible lie" this function exists to prevent, so the response is
		// to REFUSE rather than to try to count them: an underline's validity depends on what the
		// paragraph above it is, which is a parse, not a scan.
		//
		// This refusal SURVIVES the splitter reconciliation, and the reason is worth stating:
		// it is not about where a slide breaks — `slideBoundaries` reads `Text` over `---` as a
		// heading, exactly as the engine does — it is about how many SECTIONS heading-splitting
		// then carves that slide into. A setext h1/h2 divides a chunk just as an ATX one does,
		// and whether an underline IS a heading depends on the paragraph above it.
		if (/^(?![ \t]*$)(?![ \t]{0,3}(?:#|>|-|\*|\+|\d+[.)]|```|~~~))[^\n]+\n[ \t]{0,3}(?:=+|-+)[ \t]*$/m.test(blankFenced(body))) return false;
		for (const raw of chunks) {
			const chunk = blankFenced(raw);
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

// TOKEN-TEST the class value, exactly as the tiles do (`cls.split(/\s+/).includes('divider')` in
// progress.transform.js / watermark.transform.js). A substring match counts `divider-lite` and
// `section-divider` as dividers where the engine does not — the counter has to agree with the
// consumer it is standing in for, not merely look similar.
function dividerTokens(chunk) {
	const directives = [...chunk.matchAll(/<!--\s*_?class\s*:\s*([\s\S]*?)-->/g)];
	if (!directives.length) return false;
	const last = directives[directives.length - 1][1]; // last wins, as the engine resolves it
	return last.trim().split(/\s+/).includes('divider');
}

// ── ONE-ENTRY DERIVATION MEMO — the deck half of `deckSectionFor` ────────────
// Everything `deckSectionFor` computes is a pure function of the DECK except the final
// count-up-to-k, and the deck half is the expensive half: a whole-deck `md.block.parse` plus
// the code-blanking sweeps. The index half is a loop over a boolean array.
//
// It is asked for TWICE PER RENDER, on the same deck string, by two callers that do not know
// about each other — the preview's route gate (`DECK_DERIVED_FACTS` probes the divider count at
// index 0) and `supplyablePosition` (which needs the section for the shown slide).
//
// WHAT THE SECOND CALL COSTS WITHOUT THIS MEMO — stated carefully, because the first version of
// this comment got it wrong by ~4x. It said "1.354ms EACH … ~5.4ms of every keystroke", which is
// the cost of a COLD derivation and was measured before the boundary LRU landed in
// `lib/core/slide-boundaries.mjs`. With that LRU present the second derivation re-parses nothing
// — the string is already in the boundary cache — so its marginal cost is the code-blanking
// sweeps and the chunk walk, not a parse. Two changes in one branch must not each bank the same
// milliseconds. The honest figure is in Amendment 6 of
// engineering/decisions/2026-07-30-preview-deck-context-and-render-cost.md, measured with the
// two changes isolated from each other rather than stacked.
//
// ONE entry, replaced on any miss, so memory stays bounded at a single deck's chunk list rather
// than growing per deck — the same shape and the same reasoning as `deckMemo` in
// single-slide-render.ts. A KEYSTROKE MISSES BY CONSTRUCTION (the deck string changed) and that
// is correct: this collapses the duplicate calls WITHIN one render, which is where the waste is.
// Keyed on the whole deck string by identity-then-equality, so it can never serve one deck's
// sections for another.
let sectionDerivation = null;
let sectionDerivations = 0;
function dividerDerivation(deck) {
	if (sectionDerivation && sectionDerivation.deck === deck) return sectionDerivation;
	sectionDerivations += 1;
	const stripFm = deck.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
	// Blank every form of code the engine renders literally. A `_class: divider` inside a code
	// SAMPLE is documentation, not a directive — and decks that teach Lattice authoring are full of
	// them (examples/speaker-notes.md, split-headings.md, debug.md, …).
	const blankCode = (t) =>
		t
			.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '') // fenced
			.replace(/^(?: {4}|\t)[^\n]*$/gm, '') // indented block
			.replace(/`[^`\n]*`/g, ' '); // inline span

	// CHUNK ON THE RAW BODY, BLANK PER CHUNK. The order matters and getting it backwards is a
	// wrong-output bug, not a slow one.
	//
	// `slideIndex` is an index into the CALLER's slide list, which is chunked from the RAW source
	// (`positionIsTrustworthy` validates the caller's count against `splitSlideChunks(body)`, raw).
	// This used to chunk `blankCode(stripFm)` and then index the result with that same
	// `slideIndex` — two different index spaces held together only by the assumption that blanking
	// code never moves a thematic break. It does:
	//
	//     ---`a`        a paragraph to markdown-it; blank the inline span and it is `--- `, an hr
	//     `a` ---       same, one line
	//     `a`           a code-span-only line above `---`: setext underline raw, hr blanked
	//     ---
	//
	// Two of those in a deck shift every later slot by two, so slide k reads slot k+2 — and the
	// divider COUNT is unchanged, so the guard below could not see it. Reproduced on a 4-slide
	// deck: slides 2 and 3 both reported section 1 of 2 where the deck says 2 of 2, with
	// `positionIsTrustworthy` true, so nothing fell back. That paints the wrong progress-rail dot
	// and the wrong watermark glyph. Found by a red-team pass on this function; PRE-EXISTING (the
	// old `chunks[i]` walk had it), zero committed decks trip it, fixed here because it is on the
	// lines this change rewrites.
	//
	// Chunking raw and blanking EACH CHUNK for the divider test asks the actual question — "does
	// this slide carry a `_class: divider` that the engine would honor?" — in the caller's own
	// index space, so the two cannot desync. It also costs ONE whole-deck parse instead of two.
	const chunks = callerChunks(stripFm);
	const flags = chunks.map((chunk) => dividerTokens(blankCode(chunk)));
	const total = flags.filter(Boolean).length;

	// THE AMBIGUITY BAIL SURVIVES, PER CHUNK — and an earlier cut of this change DELETED it, which
	// was wrong in a way worth recording because the deletion looked principled.
	//
	// The argument for deleting it: blanking per chunk removes the disagreement "at its source", so
	// there is nothing left to be unsure between. That is true of the case the bail was written for
	// (a `_class: divider` shown inside a code span) and FALSE in general, because it assumes
	// `blankCode` and the engine agree about what code IS. They do not:
	//
	//     - item
	//
	//           <!-- _class: divider -->
	//
	// Four spaces of indent is an indented code block at top level and CONTINUATION CONTENT inside
	// a list item, where the engine honors the directive. `blankCode` blanks it either way, so the
	// derivation reported no divider where the engine renders one — and with the bail gone, nothing
	// refused. `main` gets that deck RIGHT (raw and blanked counts disagreed, so it bailed to the
	// whole-deck render); the deletion made it wrong. A self-inflicted regression, caught by an
	// inversion pass against the engine as oracle, before it shipped.
	//
	// The lesson is the one the red-team finding above already taught, recurring one level up: the
	// old code held two INDEX SPACES together with an unwritten assumption, and the first fix held
	// `blankCode` and the ENGINE together with a different unwritten one. The bail is not a patch
	// for the code-span case — it is a DIFFERENTIAL, and a differential covers divergences nobody
	// enumerated. That is what cannot be recovered by listing cases, so it stays.
	//
	// IT COVERS ONE DIRECTION, NOT TWO, and an earlier draft of this comment claimed two. Measured:
	// it fires when `blankCode` REMOVES a directive the engine honors (over-blanking — the list
	// item above). It is structurally blind to the opposite failure, `blankCode` NOT recognizing
	// code that the engine does (under-blanking): then the raw and blanked readings agree, nothing
	// disagrees, and the derivation counts a divider the engine never renders. Confirmed shapes,
	// each verified against a real render — a fence inside a blockquote (`> ```md`, invisible to
	// the `^[ \t]*` anchor), an UNCLOSED fence (i.e. every author part-way through typing a code
	// sample), a ``` opened and `~~~` closed, and a double-backtick span. All of them are
	// PRE-EXISTING — `main` returns the same wrong section — so they are logged rather than fixed
	// here (HARD RULE #18), but the honest statement of this guard's reach belongs next to it.
	//
	// The real repair is not another regex: it is to read the divider flag off the ENGINE'S OWN
	// token stream (`fence` / `code_block` / `html_block`), which cannot disagree about what code
	// is — the same argument that retired the hand-written boundary scanner in favor of
	// `md.block.parse` (#1433). `blankCode` is the last hand-written approximation of the engine
	// left on this path. See Amendment 7.
	//
	// PER CHUNK rather than over the whole body, which is what keeps the index-space fix: the
	// comparison is now between two readings of the SAME chunk, so a disagreement anywhere makes
	// the whole derivation refuse rather than silently shifting later slots. It costs one extra
	// regex pass per chunk and no additional parse.
	//
	// The price, stated plainly: a deck that merely MENTIONS a divider inside code goes back to the
	// whole-deck render, as it does on `main`. An earlier cut of this change advertised keeping such
	// decks on the fast path. That was a real improvement and it is being given up on purpose,
	// because it cannot be had without also giving up the general guard.
	const ambiguous = chunks.some((chunk, i) => dividerTokens(chunk) !== flags[i]);
	if (ambiguous) {
		sectionDerivation = { deck, flags: [], total: 0, ambiguous: true };
		return sectionDerivation;
	}
	sectionDerivation = { deck, flags, total, ambiguous: false };
	return sectionDerivation;
}

/** Drop the divider-derivation memo. Tests only — it is a pure-function cache, so clearing it
 *  only costs a recompute. Also resets the counter below. */
export function clearSectionDerivationMemo() {
	sectionDerivation = null;
	sectionDerivations = 0;
}

/**
 * How many times the deck half has actually been DERIVED (misses, not calls).
 *
 * Exported so the duplicate this memo removed is COUNTABLE rather than merely timed. The waste
 * was two identical derivations per render, and a count is the instrument that catches it coming
 * back: deterministic and machine-independent, where a wall-clock assertion on the same fact
 * would be the flaky gate `test/benchmark/preview-budget.json` explains at length. Pinned by
 * `test/unit/diagnostics/slice-equivalence-core.test.js`.
 */
export function sectionDerivationCount() {
	return sectionDerivations;
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
	const { flags, total, ambiguous } = dividerDerivation(String(deck ?? ''));
	// Explicit, not implied by `total === 0`: a bail must read as a bail at the call site, so a
	// future change that lets an ambiguous deck carry a non-zero count cannot quietly start
	// answering. Fail safe, never fail wrong — see the derivation above.
	if (ambiguous) return undefined;
	if (!total) return undefined;

	let index = 0;
	for (let i = 0; i <= slideIndex && i < flags.length; i++) if (flags[i]) index += 1;
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
