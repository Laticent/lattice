// THE SLIDE INDEX — one answer to "which slide is this offset in", for every pane.
//
// A `DeckIndex` is an immutable snapshot of one deck source: where each authored slide
// (a CHUNK — the text between two separators, the unit the editors edit) begins and ends,
// and where each RENDERED slide (a SECTION — what the engine draws and numbers) begins
// inside its chunk. A chunk is one section unless the deck splits on headings, the
// engine's default, where every second-or-later `#`/`##` in a chunk starts a new section
// (lib/core/heading-split-core.js). Counting sections is counting what the PDF counts.
//
// WHY THIS EXISTS. Before it, each consumer derived its own answer: the markdown pane
// re-scanned the whole document per caret move, Compose counted ProseMirror nodes, the
// Playground ran a regex scanner, and none of them saw heading splits (#1570). The git
// history records about nine regressions from those answers disagreeing
// (engineering/decisions/2026-10-15-fuoco-focus-sync.md §3).
//
// WHAT IT REUSES, NOT REPLACES (HARD RULE #1):
//   · separators come from `parseSlideBoundaries` (lib/core/slide-boundaries.mjs), the
//     parser configured from the engine's own options;
//   · heading sections come from `headingSplitPoints`, the function the engine's ruler
//     injects its breaks at;
//   · the chunk model is `splitSlides`'s (docs/src/components/studio/lint.ts): an empty
//     chunk is dropped, so chunk `i` here is `splitSlides(body)[i]` and every existing
//     chunk-indexed caller keeps its meaning.
//
// INCREMENTAL. `updateDeckIndex(prev, next)` diffs the two sources to one changed span,
// re-parses only the separators-bounded region around it, and shifts everything else. A
// keystroke inside a slide parses that slide (and its neighbors), not the deck. The region
// parse INCLUDES the separator that closes it and checks that line is still a separator,
// so an edit that changes how later text parses — an opened fence, a setext underline, an
// HTML block running on — falls back to a full build instead of answering wrongly. The
// test suite holds every incremental result to the full build of the same text.
//
// STABLE IDS. Every chunk carries an id that survives edits: chunks outside the edited
// region keep theirs, and inside it ids are matched from both ends by position. Splitting
// a slide in two keeps the first half's id; duplicating a slide gives the copy a new one.
// Sections are addressed as (chunk id, ordinal), since a heading section only exists as
// part of its chunk.

import { boundaryParser, boundaryRulesGeneration } from '../../../../lib/core/boundary-parser.mjs';
import headingSplitCore from '../../../../lib/core/heading-split-core.js';
import resolveSplit from '../../../../lib/core/resolve-split.js';
import { parseSlideBoundaries } from '../../../../lib/core/slide-boundaries.mjs';
import { FORWARD_SCAN_LINES } from '../../../../lib/plugins/blocks.generated.mjs';
import { frontMatterBlock } from '../../components/studio/front-matter';
import { normalizeSourceText } from '../normalize-source-text';

const { headingSplitPoints } = headingSplitCore as { headingSplitPoints: (tokens: unknown[]) => number[] };
const { resolveSplitMode } = resolveSplit as { resolveSplitMode: (md: string) => 'rule' | 'headings' };

export type ChunkId = number;

/** One authored slide: the text between two separators. Offsets are absolute in `source`. */
export interface Chunk {
	readonly id: ChunkId;
	/** First character after the separator before it (or after front matter). */
	readonly from: number;
	/** First non-whitespace character: where a reveal should frame. */
	readonly start: number;
	/** Where the separator after it begins (or the end of the source). */
	readonly end: number;
	/** Where each rendered section begins, RELATIVE to `from`. `[start - from]` when unsplit. */
	readonly sections: readonly number[];
}

/** A rendered slide: section `k` of chunk `chunk` (an index into `chunks`). */
export interface SectionRef {
	readonly chunk: number;
	readonly section: number;
}

export interface DeckIndex {
	/** Bumped on every change of text; equal snapshots share a revision. */
	readonly rev: number;
	readonly source: string;
	/** Length of the front-matter block (and the blank lines after it). */
	readonly bodyStart: number;
	readonly mode: 'rule' | 'headings';
	readonly chunks: readonly Chunk[];
	/** `sectionBase[i]` = rendered sections before chunk `i`; the last entry is the total. */
	readonly sectionBase: readonly number[];
	/** Separator ranges, absolute. Kept so an incremental update can bound its region. */
	readonly seps: readonly { index: number; length: number }[];
	/** The parser rules this was built under (a plugin admission change invalidates it). */
	readonly rulesGeneration: number;
}

let nextRev = 1;
let nextId = 1;

// ── Reading a snapshot ─────────────────────────────────────────────────────────

/** The chunk containing `offset`: the last chunk whose `from` is at or before it, clamped to 0.
 *  An offset in the front matter, or before the first chunk, names chunk 0 (the rail always
 *  names a real slide). -1 only for a deck with no chunks. O(log n). */
export function chunkAt(ix: DeckIndex, offset: number): number {
	const { chunks } = ix;
	if (!chunks.length) return -1;
	let lo = 0;
	let hi = chunks.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (chunks[mid].from <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** The rendered section containing `offset`. */
export function sectionAt(ix: DeckIndex, offset: number): SectionRef | null {
	const c = chunkAt(ix, offset);
	if (c < 0) return null;
	const ch = ix.chunks[c];
	const rel = offset - ch.from;
	let k = 0;
	for (let i = 1; i < ch.sections.length; i++) if (ch.sections[i] <= rel) k = i;
	return { chunk: c, section: k };
}

/** Where a reveal of section `k` of chunk `c` should frame (absolute offset). */
export function sectionStart(ix: DeckIndex, c: number, k = 0): number {
	const ch = ix.chunks[c];
	if (!ch) return 0;
	if (k <= 0) return ch.start;
	return ch.from + ch.sections[Math.min(k, ch.sections.length - 1)];
}

/** Where section `k` of chunk `c` ends (absolute offset): the next section's start or the chunk's end. */
export function sectionEnd(ix: DeckIndex, c: number, k = 0): number {
	const ch = ix.chunks[c];
	if (!ch) return 0;
	return k + 1 < ch.sections.length ? ch.from + ch.sections[k + 1] : ch.end;
}

/** The trimmed text of chunk `c` — exactly `splitSlides(source)[c]`. */
export function chunkText(ix: DeckIndex, c: number): string {
	const ch = ix.chunks[c];
	return ch ? ix.source.slice(ch.from, ch.end).trim() : '';
}

/** The trimmed text of section `k` of chunk `c` — what the engine renders as that slide. */
export function sectionText(ix: DeckIndex, c: number, k = 0): string {
	const ch = ix.chunks[c];
	if (!ch) return '';
	const a = k <= 0 ? ch.from : ch.from + ch.sections[k];
	return ix.source.slice(a, sectionEnd(ix, c, k)).trim();
}

/** The chunk index holding `id`, or -1. O(n); callers that look up often keep a map. */
export function chunkIndexOf(ix: DeckIndex, id: ChunkId): number {
	for (let i = 0; i < ix.chunks.length; i++) if (ix.chunks[i].id === id) return i;
	return -1;
}

/** The flat rendered-slide number (0-based) of section `k` of chunk `c`. */
export function flatSection(ix: DeckIndex, c: number, k = 0): number {
	return (ix.sectionBase[c] ?? 0) + Math.max(0, Math.min(k, (ix.chunks[c]?.sections.length ?? 1) - 1));
}

/** The inverse of `flatSection`. */
export function sectionOfFlat(ix: DeckIndex, n: number): SectionRef | null {
	const { sectionBase, chunks } = ix;
	if (!chunks.length) return null;
	const total = sectionBase[chunks.length];
	const at = Math.max(0, Math.min(n, total - 1));
	let lo = 0;
	let hi = chunks.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (sectionBase[mid] <= at) lo = mid;
		else hi = mid - 1;
	}
	return { chunk: lo, section: at - sectionBase[lo] };
}

// ── Building ───────────────────────────────────────────────────────────────────

// Line starts in `text`, split on exactly the terminators markdown-it folds, so line N
// here is markdown-it's line N (the same rule `separatorRanges` documents).
function lineStarts(text: string): number[] {
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const starts = [bom];
	const TERMINATOR = /\r\n|\r|\n/g;
	TERMINATOR.lastIndex = bom;
	for (let m = TERMINATOR.exec(text); m; m = TERMINATOR.exec(text)) starts.push(m.index + m[0].length);
	return starts;
}

// The separators of `text` as absolute character ranges (`base` added), the separator line
// plus its terminator. Normalizes only for the PARSE; offsets index the raw string.
function separatorsOf(text: string, base: number): { index: number; length: number }[] {
	const normalized = normalizeSourceText(text);
	const { lines } = parseSlideBoundaries(normalized);
	if (!lines.length) return [];
	const starts = lineStarts(text);
	return lines.map((ln: number) => ({ index: starts[ln] + base, length: (starts[ln + 1] ?? text.length) - starts[ln] }));
}

// A chunk can only split on headings if it holds at least two top-level h1/h2 candidates.
// ATX: up to three spaces, then `#` or `##` and a space or the line end. Setext: an `=`
// or `-` underline. Anything in a container is indented or prefixed and never matches,
// which is correct: only a top-level heading splits. Over-counting (a candidate inside a
// fence) costs a parse, never a wrong answer, because the parse decides.
const ATX_CANDIDATE = /^ {0,3}#{1,2}(?:[ \t]|$)/gm;
const SETEXT_CANDIDATE = /^ {0,3}(?:=+|-+)[ \t]*$/m;
function mayHeadingSplit(text: string): boolean {
	if (SETEXT_CANDIDATE.test(text)) return true;
	ATX_CANDIDATE.lastIndex = 0;
	let n = 0;
	while (ATX_CANDIDATE.exec(text)) if (++n >= 2) return true;
	return false;
}

// Where each heading section of one chunk begins, relative to the chunk's `from`. A chunk
// parsed alone tokenizes exactly as it does inside the body: it is bounded by top-level
// separators, which close every open block, and `headingSplitPoints` resets its state at
// each separator anyway.
function sectionsOf(text: string, startRel: number, mode: 'rule' | 'headings'): number[] {
	if (mode !== 'headings' || !mayHeadingSplit(text)) return [startRel];
	const normalized = normalizeSourceText(text);
	const tokens = boundaryParser.parse(normalized, {}) as Array<{ map?: [number, number] | null }>;
	const points = headingSplitPoints(tokens);
	if (!points.length) return [startRel];
	const starts = lineStarts(text);
	const out = [startRel];
	for (const p of points) {
		const ln = tokens[p]?.map?.[0];
		if (typeof ln === 'number') {
			const at = starts[ln];
			if (at > out[out.length - 1]) out.push(at);
		}
	}
	return out;
}

interface Raw {
	from: number;
	start: number;
	end: number;
}

// Chunks between consecutive separators, dropping the empty ones (splitSlides' rule).
function rawChunks(source: string, bodyStart: number, seps: readonly { index: number; length: number }[], lo = 0, hi = seps.length, from = bodyStart, to = source.length): Raw[] {
	const out: Raw[] = [];
	const push = (a: number, b: number) => {
		const s = source.slice(a, b);
		const lead = s.length - s.trimStart().length;
		if (lead === s.length) return;
		out.push({ from: a, start: a + lead, end: b });
	};
	let pos = from;
	for (let i = lo; i < hi; i++) {
		push(pos, seps[i].index);
		pos = seps[i].index + seps[i].length;
	}
	push(pos, to);
	return out;
}

function finish(source: string, bodyStart: number, mode: 'rule' | 'headings', chunks: Chunk[], seps: { index: number; length: number }[], prevRev?: number): DeckIndex {
	const sectionBase = new Array<number>(chunks.length + 1);
	let n = 0;
	for (let i = 0; i < chunks.length; i++) {
		sectionBase[i] = n;
		n += chunks[i].sections.length;
	}
	sectionBase[chunks.length] = n;
	return { rev: prevRev ?? nextRev++, source, bodyStart, mode, chunks, sectionBase, seps, rulesGeneration: boundaryRulesGeneration() };
}

/** Build an index of `source` from nothing. `prev`, when given, lends its ids to chunks that
 *  start at the same offset (the fallback path of `updateDeckIndex` uses it). */
export function buildDeckIndex(source: string, prev?: DeckIndex, carry?: (newFrom: number) => number | undefined): DeckIndex {
	const text = String(source ?? '');
	const bodyStart = frontMatterBlock(text).length;
	const mode = resolveSplitMode(text);
	const seps = separatorsOf(text.slice(bodyStart), bodyStart);
	const byFrom = new Map<number, ChunkId>();
	if (prev && carry) for (const c of prev.chunks) {
		const f = carry(c.from);
		if (f !== undefined && !byFrom.has(f)) byFrom.set(f, c.id);
	}
	const used = new Set<ChunkId>();
	const chunks: Chunk[] = rawChunks(text, bodyStart, seps).map((r) => {
		let id = byFrom.get(r.from);
		if (id === undefined || used.has(id)) id = nextId++;
		used.add(id);
		return { id, from: r.from, start: r.start, end: r.end, sections: sectionsOf(text.slice(r.from, r.end), r.start - r.from, mode) };
	});
	return finish(text, bodyStart, mode, chunks, seps);
}

export interface EditSpan {
	/** Where the change starts (the same offset in both texts). */
	from: number;
	/** Where it ends in the old text. */
	toA: number;
	/** Where it ends in the new text. */
	toB: number;
}

export interface UpdateOptions {
	span?: EditSpan;
	skipClosingCheck?: boolean;
}

// Does `span` describe the change from `a` to `b`? Everything outside it must be equal.
function spanHolds(a: string, b: string, span: EditSpan): EditSpan | null {
	const { from, toA, toB } = span;
	if (from < 0 || toA < from || toB < from || toA > a.length || toB > b.length) return null;
	if (a.length - toA !== b.length - toB) return null;
	for (let i = 0; i < from; i++) if (a.charCodeAt(i) !== b.charCodeAt(i)) return null;
	for (let i = 1; i <= a.length - toA; i++) if (a.charCodeAt(a.length - i) !== b.charCodeAt(b.length - i)) return null;
	return span;
}

/** The one changed span between two strings: common prefix, then common suffix. */
export function diffSpan(a: string, b: string): { from: number; toA: number; toB: number } {
	const max = Math.min(a.length, b.length);
	let p = 0;
	while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
	let s = 0;
	const maxS = max - p;
	while (s < maxS && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
	return { from: p, toA: a.length - s, toB: b.length - s };
}

/**
 * Lines a FORWARD-SCANNING block rule reacts to. CommonMark's own block rules never decline
 * for want of a closer (a fence or an HTML block runs to the end of the input; a setext
 * underline is one line down, inside the region), so the region parse is exact for them. A
 * plugin rule may open only if some LATER line closes it, slides away. Each plugin block
 * rule must declare `scansAhead` in its manifest (lib/plugins/resolve.js refuses one that
 * does not), and the generated `FORWARD_SCAN_LINES` carries the patterns here.
 */
const LOOKAHEAD_LINE = new RegExp(
	Object.values(FORWARD_SCAN_LINES as Record<string, string>)
		.map((src) => `(?:${src})`)
		.join('|') || '(?!)',
	'm',
);

/** Counters for tests and the benchmark: how many updates went incremental vs full. */
export const indexStats = { incremental: 0, full: 0, regionChars: 0 };

/**
 * The index of `next`, reusing everything in `prev` the edit did not touch. Returns `prev`
 * itself when the text is identical, so `===` on snapshots means "same text".
 *
 * `opts.span` is the editor's own account of what changed. A text diff cannot tell typing
 * `---\n\n# B2` after `# B` from typing `B2\n\n---\n\n# ` before `C`: both produce the same
 * string, and the second moves slide C's id onto the new slide. The editor knows which it
 * was, so it says. A span that does not describe the two texts is ignored, never trusted.
 *
 * `opts.skipClosingCheck` exists for ONE caller, the test suite's failing arm: it switches
 * off the check that the region's closing separator survived, and the incremental-equals-
 * full property must then go red. A property that cannot fail is not evidence (§6 of the
 * decision note).
 */
export function updateDeckIndex(prev: DeckIndex | null | undefined, next: string, opts?: UpdateOptions): DeckIndex {
	const text = String(next ?? '');
	if (!prev) {
		indexStats.full++;
		return buildDeckIndex(text);
	}
	if (prev.source === text) return prev;
	const { from, toA, toB } = (opts?.span && spanHolds(prev.source, text, opts.span)) || diffSpan(prev.source, text);
	const delta = toB - toA;
	// Map an offset in the old text to the new one, for chunks outside the edit.
	const carry = (o: number) => (o <= from ? o : o >= toA ? o + delta : undefined);
	const full = () => {
		indexStats.full++;
		return buildDeckIndex(text, prev, carry);
	};
	// Front matter edits can change the split mode and the body start; plugin admission
	// changes the parser itself. Both rebuild.
	if (from < prev.bodyStart || prev.rulesGeneration !== boundaryRulesGeneration()) return full();
	if (frontMatterBlock(text).length !== prev.bodyStart) return full();
	// The split mode is read by its own front-matter regex, which is not the Studio's: an edit
	// just past a broken block can change one and not the other. Both are cheap anchored reads.
	if (resolveSplitMode(text) !== prev.mode) return full();

	// The region: from just after the last separator that ends at or before the edit, to the
	// end of the first separator that begins at or after the edit's old end. Both separators
	// are untouched by the edit, so their old offsets are valid (the second shifts by delta).
	const seps = prev.seps;
	let a = -1; // index of the separator before the region
	for (let i = 0; i < seps.length; i++) {
		// Strictly before: a separator at the end of the text has no terminator, and an edit
		// that starts where it ends gives it one, changing its range.
		if (seps[i].index + seps[i].length < from) a = i;
		else break;
	}
	let b = seps.length; // index of the separator after the region
	for (let i = a + 1; i < seps.length; i++) {
		if (seps[i].index >= toA) {
			b = i;
			break;
		}
	}
	// An edit that ENDS exactly where a separator line begins can still turn that line into
	// a setext underline (typing a paragraph line right above it). The region parse includes
	// the separator, so that is detected below rather than assumed away.
	const regionStart = a >= 0 ? seps[a].index + seps[a].length : prev.bodyStart;
	const closing = b < seps.length ? seps[b] : null;
	const regionEndNew = closing ? closing.index + delta + closing.length : text.length;
	const regionText = text.slice(regionStart, regionEndNew);
	// A block rule that scans FORWARD for its closer parses the region differently from the
	// deck when the closer (or the opener) sits outside it. Edits that add or remove such a
	// line, in either version of the region, rebuild.
	if (LOOKAHEAD_LINE.test(regionText) || LOOKAHEAD_LINE.test(prev.source.slice(regionStart, closing ? closing.index + closing.length : prev.source.length))) return full();
	const found = separatorsOf(regionText, regionStart);
	if (closing) {
		// The closing separator must still be one, at the same place, and must be the last
		// separator the region found; otherwise the text below it parses differently now.
		const last = found[found.length - 1];
		if (!opts?.skipClosingCheck && (!last || last.index !== closing.index + delta || last.length !== closing.length)) return full();
		if (last && last.index === closing.index + delta) found.pop();
	}
	indexStats.incremental++;
	indexStats.regionChars += regionText.length;

	const shifted = (s: { index: number; length: number }) => ({ index: s.index + delta, length: s.length });
	const newSeps = [...seps.slice(0, a + 1), ...found, ...(closing ? [shifted(closing)] : []), ...seps.slice(b + 1).map(shifted)];

	// Old chunks split three ways: wholly before the region, inside it, wholly after it.
	const regionEndOld = closing ? closing.index : prev.source.length;
	const before: Chunk[] = [];
	const inside: Chunk[] = [];
	const after: Chunk[] = [];
	for (const c of prev.chunks) {
		if (c.end <= regionStart) before.push(c);
		else if (c.from >= regionEndOld) after.push(c);
		else inside.push(c);
	}
	const regionEndNewBody = closing ? closing.index + delta : text.length;
	const fresh = rawChunks(text, prev.bodyStart, found, 0, found.length, regionStart, regionEndNewBody);
	// Ids inside the region: match from the front while the starts agree, then from the back
	// while the distance to the region end agrees; the rest are new chunks.
	const ids: (ChunkId | undefined)[] = new Array(fresh.length);
	let f = 0;
	while (f < fresh.length && f < inside.length && fresh[f].from === inside[f].from) {
		ids[f] = inside[f].id;
		f++;
	}
	let k = 0;
	while (
		fresh.length - 1 - k >= f &&
		inside.length - 1 - k >= f &&
		regionEndNewBody - fresh[fresh.length - 1 - k].from === regionEndOld - inside[inside.length - 1 - k].from
	) {
		ids[fresh.length - 1 - k] = inside[inside.length - 1 - k].id;
		k++;
	}
	// A single chunk edited in place: its start may have moved (an edit at its very top), but
	// it is still the same slide.
	if (fresh.length === inside.length && ids.some((x) => x === undefined)) for (let i = 0; i < fresh.length; i++) ids[i] ??= inside[i].id;
	const mid: Chunk[] = fresh.map((r, i) => ({
		id: ids[i] ?? nextId++,
		from: r.from,
		start: r.start,
		end: r.end,
		sections: sectionsOf(text.slice(r.from, r.end), r.start - r.from, prev.mode),
	}));
	const moved: Chunk[] = delta === 0 ? after : after.map((c) => ({ id: c.id, from: c.from + delta, start: c.start + delta, end: c.end + delta, sections: c.sections }));
	return finish(text, prev.bodyStart, prev.mode, [...before, ...mid, ...moved], newSeps);
}
