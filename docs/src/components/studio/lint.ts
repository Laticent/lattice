// Pure, DOM-free helpers shared by the shell and its tests — so the splitting and
// the "unknown component" detection (the engine of the inline-validation badge)
// are property-testable without rendering anything.

import { type LensRegistry, lensPairs } from '@/lib/lente';
import { separatorRanges } from '../../../../lib/core/slide-boundaries.mjs';
import { frontMatterBlock } from './front-matter';
import { fenceRanges } from './slide-directives';

// WHERE A SLIDE BEGINS — asked once, of the one module that knows.
//
// This used to scan for `\r?\n-{3,}\r?\n` and mask fenced ranges itself. It found the
// separators the ENGINE finds only when they were written as a bare `---`: `***`, `___`,
// `- - -`, `--- ` with a trailing space, `----` and a `---` indented one to three spaces
// are all thematic breaks to markdown-it and were invisible here, while `Interlude` over
// `---` is a HEADING to the engine and was counted as a separator here. So the rail, the
// editor↔preview sync and the supplied page number were all counting a slide list the
// renderer does not have.
//
// `lib/core/slide-boundaries.mjs` reproduces the engine's own `hr` set from source text —
// fences, `$$` math, HTML blocks, blockquotes, lists, tables and setext underlines
// included — and every locator below reads it, so they cannot disagree with each other or
// with the render.
//
// FRONT MATTER IS EXCLUDED BY SLICING, not by filtering the results. Its closing `---` is
// a thematic break to any scanner that sees it and its opening `---` makes the first key a
// setext heading, so the block is cut off before the scan and the ranges are shifted back
// into full-document coordinates.
function separatorPositions(src: string): Array<{ index: number; length: number }> {
	const text = String(src ?? '');
	const fmLen = frontMatterBlock(text).length;
	return separatorRanges(text.slice(fmLen), fmLen).ranges;
}

/** Split deck source into trimmed, non-empty slide chunks on `---` fences (fence-aware). */
export function splitSlides(src: string): string[] {
	const text = String(src ?? '');
	const seps = separatorPositions(text);
	const chunks: string[] = [];
	let pos = 0;
	for (const s of seps) {
		chunks.push(text.slice(pos, s.index));
		pos = s.index + s.length;
	}
	chunks.push(text.slice(pos));
	return chunks.map((s) => s.trim()).filter(Boolean);
}

// First token of a `_class` value — the COMPONENT — tolerating extra modifier
// tokens (`_class: kpi dark scale-xl`), which the old single-token regex missed
// (so the rail chip read `text` and the score miscounted a modified slide).
//
// THE COMMENT MUST OWN ITS LINE, and that is not pedantry — it is what the ENGINE
// requires. This regex was unanchored, so it matched a `_class:` comment anywhere on
// any line, and the rail then labelled slides by a directive the render ignores.
// Measured against `lib/engine/index.js` `render()` on 2026-09-05, one slide per row:
//
//   source line                             engine renders   this file used to say
//   `<!-- _class: title -->`                title            title
//   `<!-- _class: title -->   ` (trailing)  title            title
//   `<!-- _class: title -->.`               content          title   <-- wrong
//   `<!-- _class: title --> trailing`       content          title   <-- wrong
//   `text <!-- _class: title -->`           content          title   <-- wrong
//   a `_class:` line inside a ``` fence     content          kpi     <-- wrong
//
// The first wrong row is not exotic: a stray keystroke at the end of the directive
// line is how a randomized walk over the real editor reached it, and the rail went on
// calling the slide `title` while the preview beside it painted `content`.
//
// LEADING WHITESPACE IS STILL ACCEPTED IN FULL, deliberately, even though markdown-it
// treats a four-space indent as a code block (so the engine reads `    <!-- _class: x -->`
// as content). `splitSlides` TRIMS every chunk, and the live preview renders the trimmed
// chunk — so the preview honors an indented directive and an export does not. Tightening
// this line to markdown-it's three-space rule would make the rail disagree with the
// preview sitting next to it while the deeper divergence stayed, so the indent rule is
// matched to `deck-source.ts`'s `DIRECTIVE_LINE_RE` (`^[ \t]*`) — the Compose pane's
// reading of the same line — and the preview/export split is recorded as its own finding.
const CLASS_RE = /^[ \t]*<!--\s*_class:\s*([A-Za-z0-9-]+)(?:[ \t][^\n>]*?)?\s*-->[ \t]*$/gm;

/** Every `_class` directive in `src` that the engine would honor, with its offset —
 *  line-owning (see CLASS_RE) and outside any fenced code block. A deck that documents
 *  Lattice quotes `<!-- _class: … -->` inside a fence, and that is a code sample, not a
 *  component assignment. */
function classDirectives(src: string): Array<{ name: string; index: number }> {
	const text = String(src ?? '');
	const fences = fenceRanges(text);
	const out: Array<{ name: string; index: number }> = [];
	let m: RegExpExecArray | null;
	CLASS_RE.lastIndex = 0;
	while ((m = CLASS_RE.exec(text))) {
		const at = m.index;
		if (fences.some(([a, b]) => at >= a && at < b)) continue;
		out.push({ name: m[1], index: at });
	}
	return out;
}

/** The `_class` component names used in the source, in document order. */
export function usedComponents(src: string): string[] {
	return classDirectives(src).map((d) => d.name);
}

/** Component names used in the source that are NOT in the known set. */
export function unknownComponents(src: string, known: Iterable<string>): string[] {
	const set = new Set(known);
	return usedComponents(src).filter((n) => !set.has(n));
}

/** The component label for a single slide — its first `_class`, or `text` for a
 *  bare-Markdown slide. Drives the slide-navigator chips. */
export function slideClass(slideSrc: string): string {
	// THE LAST ONE, not the first. A slide may carry two `_class` directives, and the engine
	// applies the LAST — measured: `<!-- _class: big-number -->` … `<!-- _class: stats -->`
	// on one slide renders `stats form`. Taking the first is not an exotic mistake: it is
	// exactly what an author produces by deleting a `---` to merge two slides, after which
	// the rail went on naming the slide that was absorbed while the preview beside it painted
	// the one that won. Found by the fuzz walk, on that very op.
	const found = classDirectives(slideSrc);
	return found.length ? found[found.length - 1].name : 'text';
}

const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m;
/** The slide's human title — its first Markdown ATX heading, stripped of inline
 *  emphasis/code/link syntax — for a READER-facing navigator (the Read stop, where
 *  a component-class label like `big-number` is jargon the newcomer can't read).
 *  Empty string when the slide has no heading; the caller falls back to "Slide N". */
export function slideTitle(slideSrc: string): string {
	const m = HEADING_RE.exec(String(slideSrc ?? ''));
	if (!m) return '';
	return m[1]
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
		.replace(/[*_`~]/g, '') // emphasis / code / strike marks
		.trim();
}

/**
 * The slides `splitSlides` returns, located as ranges in the FULL document (front matter included) —
 * the ONE derivation `slideIndexAt` and `slideStartOffset` both read, so the caret→rail and
 * rail→editor directions cannot disagree with each other or with the rail.
 *
 * WHY THIS EXISTS. Both functions used to count `---` separators over the whole document, which
 * disagrees with `splitSlides` in two ways, and both showed up as the editor framing a DIFFERENT
 * slide than the one selected in the preview:
 *
 *   1. FRONT MATTER. Its closing `---` is preceded and followed by a newline, so it matched the
 *      separator pattern and was counted as separator #0 — while the rail counts slides in the
 *      STRIPPED body. Every deck with front matter (i.e. every real deck) was off by one:
 *      `revealSlide(3)` framed slide 2, and a caret in slide 0 reported slide 1.
 *      `examples/gallery-jargon.md` reproduces it exactly.
 *   2. EMPTY CHUNKS. `splitSlides` drops them (`.trim()` then `.filter(Boolean)`); a raw separator
 *      count does not, so two consecutive separators shifted every later slide by one more.
 *
 * The old fuzz test could not catch either: it built decks as `bodies.join('\n---\n')` from non-empty
 * bodies — no front matter, no empties — and the two functions were self-consistent on exactly that
 * shape. The round-trip property was true and the pair was still wrong on every real deck.
 *
 * Ranges carry BOTH edges deliberately. `from` is the raw chunk start (immediately after the
 * separator), so a caret anywhere in a slide — including the blank line above its first line — maps
 * to that slide, which is what the cursor→rail direction needs and matches the previous behavior.
 * `start` skips leading whitespace, so revealing a slide frames its TEXT rather than the blank line.
 */
function slideRanges(src: string): Array<{ from: number; start: number; end: number }> {
	const text = String(src ?? '');
	// The front-matter block is not a slide, and its terminator is not a separator. `frontMatterBlock`
	// consumes the delimiters plus any blank lines after them, so `fmLen` is the first body character
	// and every separator inside the block sits below it.
	const fmLen = frontMatterBlock(text).length;
	const out: Array<{ from: number; start: number; end: number }> = [];
	const push = (from: number, end: number) => {
		const raw = text.slice(from, end);
		if (!raw.trim()) return; // matches splitSlides' drop-empties
		out.push({ from, start: from + (raw.length - raw.trimStart().length), end });
	};
	let pos = fmLen;
	// No `s.index < fmLen` guard: `separatorPositions` scans the body ALONE and shifts its
	// answers back, so a separator inside the front matter is not reported rather than
	// reported-and-skipped. A filter that can never match is the same defect as a test that
	// cannot fail — it reads like a guard and guards nothing.
	for (const s of separatorPositions(text)) {
		push(pos, s.index);
		pos = s.index + s.length;
	}
	push(pos, text.length);
	return out;
}

/** Zero-based index of the slide containing character offset `pos`. Pairs with splitSlides() to sync
 *  editor cursor ↔ preview — see slideRanges for why this is not a separator count. */
export function slideIndexAt(src: string, pos: number): number {
	const at = Math.max(0, pos);
	const ranges = slideRanges(src);
	// The LAST slide that starts at or before `pos`. A position inside the front matter (or before the
	// first slide) has no such slide and clamps to 0, so the rail always names a real slide.
	let idx = 0;
	for (let i = 0; i < ranges.length; i++) if (ranges[i].from <= at) idx = i;
	return idx;
}

/** Character offset where slide `index` begins — the first character of its text.
 *  The inverse of slideIndexAt, for scrolling the editor to a slide. */
export function slideStartOffset(src: string, index: number): number {
	if (index <= 0) {
		const first = slideRanges(src)[0];
		// Slide 0 starts after the front matter, NOT at offset 0 — revealing it used to frame the YAML
		// block instead of the title slide.
		return first ? first.start : 0;
	}
	const ranges = slideRanges(src);
	const r = ranges[Math.min(index, ranges.length - 1)];
	return r ? r.start : 0;
}

/**
 * Where the caret should land when you jump to a slide: the start of its first
 * line of actual CONTENT.
 *
 * A slide's first lines are usually machinery — the `<!-- _class: … -->` directive
 * and its siblings (`<!-- _footer: … -->`, `<!-- _key … -->`), plus blank lines.
 * Parking the caret at the raw slide start therefore drops you into a comment you
 * did not come to edit, and a first keystroke there corrupts the directive
 * (#1288/#1291). This walks past directive comments and blank lines to the first
 * line that carries something to write on.
 *
 * Falls back to the slide start when a slide is nothing BUT directives — there is
 * no better place to be, and the caret must still be inside the right slide.
 */
export function slideEditableOffset(src: string, index: number): number {
	const start = slideStartOffset(src, index);
	const ranges = slideRanges(src);
	const r = ranges[Math.min(Math.max(index, 0), ranges.length - 1)];
	const end = r ? r.end : src.length;
	let at = start;
	while (at < end) {
		const nl = src.indexOf('\n', at);
		const lineEnd = nl === -1 || nl > end ? end : nl;
		const line = src.slice(at, lineEnd).trim();
		// A directive comment opens AND closes on its own line; a multi-line HTML
		// comment is authored content (a speaker note), so it is a landing spot.
		//
		// The body is "any run that does not itself contain `-->`", NOT `[^>]*`: a
		// directive may legitimately carry inline HTML (`<!-- _footer: <sup>1</sup> -->`),
		// and a `>`-excluding body stops matching at the first tag — so the line read as
		// content and the caret parked inside the directive after all, which is the exact
		// failure this function exists to prevent. The negative lookahead also keeps
		// `<!-- _class: kpi --> trailing text` correctly OUT of the directive set: that
		// line does carry content, so it IS a valid landing spot.
		const isDirective = /^<!--(?:(?!-->).)*-->$/.test(line);
		if (line && !isDirective) return at;
		if (nl === -1) break;
		at = nl + 1;
	}
	return start;
}

/** A reader-lens id. Any string so a deck-defined `lenses:` registry (projected by @workwel/lente)
 *  can name its own lenses. `full` is always the identity; every other id is a registry (tag-driven,
 *  author-approved) lens. The old author-blind `exec`/`onepager` heuristics are RETIRED. */
export type PresentLens = string;

/** The slides to present under a reader lens, EACH PAIRED with its original 0-based deck index (the
 *  author's slide order) — so a filtered/reordered lens still maps every shown slide back to the number
 *  the author wrote, which the front-matter `captions:` map is keyed on. Pure; always non-empty for a
 *  non-empty deck under `full` (falls back to the full deck for an unknown lens rather than nothing).
 *
 *  Projection source: when `registry` defines `lens`, the deterministic, tag-driven @workwel/lente
 *  read path (`lensPairs`) owns it. `full` (or an unknown lens with no registry entry) is the whole deck. */
export function presentationPairs(slides: string[], lens: PresentLens, registry?: LensRegistry): Array<{ slide: string; index: number }> {
	const all = (Array.isArray(slides) ? slides : [])
		.map((slide, index) => ({ slide, index })) // index = ORIGINAL author position (survives the lens filter)
		.filter((p) => typeof p.slide === 'string');
	if (lens === 'full' || all.length === 0) return all;
	// Registry (tag-driven) lens → the library projects it deterministically from approved tags.
	// HONEST projection: an empty lens returns an EMPTY set, NOT the whole deck — a fail-OPEN fallback
	// to `all` would show a scoped reader everything the author kept out of that view, on the one
	// path where nobody vetted the result. (Not a confidentiality claim: client-side projection hides,
	// it does not withhold — design §6.3 as corrected 2026-07-18.) The
	// reader path (PresentOverlay) gates through lensEligibility and renders an explicit "unavailable"
	// state; the author preview shows the real (possibly empty) membership.
	if (registry?.lenses.some((l) => l.id === lens && l.id !== 'full')) {
		return lensPairs(slides, registry, lens);
	}
	return all; // unknown lens with no registry entry → safe fallback to the whole deck
}

/** The slides to present under a reader lens (plan §17: "meet the reader where
 *  they are"). Pure; always non-empty when given a non-empty deck (falls back to the
 *  full deck rather than nothing). */
export function presentationSet(slides: string[], lens: PresentLens, registry?: LensRegistry): string[] {
	return presentationPairs(slides, lens, registry).map((p) => p.slide);
}

/** The ORIGINAL 0-based deck index of each slide in `presentationSet(slides, lens)`,
 *  positionally aligned: `presentationIndices(...)[i]` is the author slide index of the
 *  i-th presented slide. So a number-keyed front-matter caption resolves under ANY lens —
 *  `fmCaptions.get(presentationIndices(slides, lens)[i] + 1)` — not just `full`. */
export function presentationIndices(slides: string[], lens: PresentLens, registry?: LensRegistry): number[] {
	return presentationPairs(slides, lens, registry).map((p) => p.index);
}

// NOTE: the toy `scoreDeck` heuristic (a 3-check 0–10 score) was DELETED here — the
// Studio Coach now renders the engine's REAL scorecard (`scorecard.scoreDeck` over
// lint + review findings) via coach/coach-core.ts, so there is one deck assessment,
// not two that drift (HARD RULE #1; succession doc §2.1).
