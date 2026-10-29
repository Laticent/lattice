// THE LATTICE DECK OUTLINER — a slide deck as a Fuoco outline (docs/src/lib/fuoco/outline.ts).
//
// A `DeckIndex` is an immutable snapshot of one deck source. Its UNITS are the authored slides
// (the text between two separators, what the editors edit); its PARTS are the RENDERED slides
// each one becomes (what the engine draws and numbers). A unit is one part unless the deck
// splits on headings, the engine's default, where every second-or-later `#`/`##` in a unit
// starts a new part (lib/core/heading-split-core.js). Counting parts is counting what the PDF
// counts.
//
// This is the one Lattice-specific piece of the focus system: the hub, the plain-text outliner
// and the React hook in docs/src/lib/fuoco import nothing from Lattice, and this module is how
// the Studio plugs the engine's own slide rules into them.
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
//   · the unit model is `splitSlides`'s (docs/src/components/studio/lint.ts), so unit `i`
//     here is `splitSlides(body)[i]`. Both follow the engine: an empty slide is a unit
//     (the engine renders it), except an empty FIRST chunk, which the engine drops.
//
// INCREMENTAL. `updateDeckIndex(prev, next)` diffs the two sources to one changed span,
// re-parses only the separators-bounded region around it, and shifts everything else. A
// keystroke inside a slide parses that slide (and its neighbors), not the deck. The region
// parse INCLUDES the separator that closes it and checks that line is still a separator,
// so an edit that changes how later text parses — an opened fence, a setext underline, an
// HTML block running on — falls back to a full build instead of answering wrongly. The
// test suite holds every incremental result to the full build of the same text.
//
// STABLE IDS. Every unit carries an id that survives edits: units outside the edited region
// keep theirs, and inside it ids are matched from both ends by position. Splitting a slide in
// two keeps the first half's id; duplicating a slide gives the copy a new one. Parts are
// addressed as (unit id, ordinal), since a heading section only exists as part of its slide.

import { boundaryParser, boundaryRulesGeneration } from '../../../../lib/core/boundary-parser.mjs';
import { headingSplitPoints as headingSplitPointsJs } from '../../../../lib/core/heading-split-core.mjs';
import { resolveSplitMode as resolveSplitModeJs } from '../../../../lib/core/resolve-split.mjs';
import { parseSlideBoundaries, slideBoundaries } from '../../../../lib/core/slide-boundaries.mjs';
import { FORWARD_SCAN_LINES } from '../../../../lib/plugins/blocks.generated.mjs';
import { frontMatterBlock } from '../../components/studio/front-matter';
import { diffSpan, type EditSpan, type Kinds, nextRevision, nextUnitId, type Outline, type Outliner, partBaseOf, partEnd, partStart, spanHolds, type Unit, type UnitId } from '../fuoco/outline';
import { normalizeSourceText } from '../normalize-source-text';

const headingSplitPoints = headingSplitPointsJs as (tokens: unknown[]) => number[];
const resolveSplitMode = resolveSplitModeJs as (md: string) => 'rule' | 'headings';

/** A Lattice deck as a Fuoco outline: units are authored slides (the text between separators),
 *  parts are the rendered slides a unit becomes (heading sections). */
export interface DeckIndex extends Outline {
	/** Length of the front-matter block (and the blank lines after it). */
	readonly bodyStart: number;
	readonly mode: 'rule' | 'headings';
	/** Separator ranges, absolute. Kept so an incremental update can bound its region. */
	readonly seps: readonly { index: number; length: number }[];
	/** The parser rules this was built under (a plugin admission change invalidates it). */
	readonly rulesGeneration: number;
}

/**
 * Where the caret should land when navigation reveals section `k` of chunk `c`: the start of
 * its first line of CONTENT. A slide's first lines are usually machinery — the
 * `<!-- _class: … -->` directive and its siblings, plus blank lines — and a first keystroke
 * there corrupts the directive (#1288/#1291). Falls back to the section start when the
 * section is nothing but directives.
 *
 * A directive comment opens AND closes on its own line; a multi-line HTML comment is
 * authored content (a speaker note), so it is a landing spot. The body is "any run without
 * `-->`", not `[^>]*`, because a directive may carry inline HTML
 * (`<!-- _footer: <sup>1</sup> -->`); and `<!-- _class: kpi --> trailing text` carries
 * content, so it IS a landing spot. (Moved here from lint.ts `slideEditableOffset`.)
 */
export function deckEditableOffset(ix: Outline, c: number, k = 0): number {
	const src = ix.source;
	const start = partStart(ix, c, k);
	const end = partEnd(ix, c, k);
	let at = start;
	while (at < end) {
		const nl = src.indexOf('\n', at);
		const lineEnd = nl === -1 || nl > end ? end : nl;
		const line = src.slice(at, lineEnd).trim();
		if (line && !/^<!--(?:(?!-->).)*-->$/.test(line)) return at;
		if (nl === -1) break;
		at = nl + 1;
	}
	return start;
}

/** What a deck calls its two levels: an authored slide, and the page each one renders as. */
export const DECK_KINDS: Kinds = { unit: 'slide', part: 'page' };

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
// plus its terminator. Normalizes only for the PARSE; offsets index the raw string. A whole
// deck body goes through the engine kernel's memo (`slideBoundaries`), which the preview's
// call sites share; a REGION goes through the unmemoized parse, so region strings never evict
// the whole-deck entries.
function separatorsOf(text: string, base: number, whole = false): { index: number; length: number }[] {
	const normalized = normalizeSourceText(text);
	const { lines } = whole ? slideBoundaries(normalized) : parseSlideBoundaries(normalized);
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

// Chunks between consecutive separators (splitSlides' rule): an empty chunk is a unit, as the
// engine renders it, except a blank FIRST chunk, which the engine drops. (A first chunk holding
// only a link reference definition renders nothing either, but it is source an edit must keep,
// so it stays a unit, as splitSlides keeps it.) An empty unit starts where it ends.
function rawChunks(source: string, bodyStart: number, seps: readonly { index: number; length: number }[], lo = 0, hi = seps.length, from = bodyStart, to = source.length): Raw[] {
	const out: Raw[] = [];
	const push = (a: number, b: number) => {
		const s = source.slice(a, b);
		const lead = s.length - s.trimStart().length;
		if (lead === s.length && a === bodyStart) return;
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

function finish(source: string, bodyStart: number, mode: 'rule' | 'headings', units: Unit[], seps: { index: number; length: number }[]): DeckIndex {
	return { rev: nextRevision(), kinds: DECK_KINDS, source, bodyStart, mode, units, partBase: partBaseOf(units), seps, rulesGeneration: boundaryRulesGeneration() };
}

/**
 * Give each fresh unit an id, in three passes. `fresh` is the new units' text; `old` the units they may continue;
 * `byOffset[i]` the old unit that fresh unit `i` sits where (after mapping through the edit), if any.
 *
 *   1. SAME PLACE, SAME TEXT: the offset candidate, when its text is unchanged. This settles every slide the edit did
 *      not touch before text gets a say, so of two identical slides, typing in one cannot hand the untouched copy
 *      the edited one's id.
 *   2. SAME TEXT: a structural edit (a slide added, moved, duplicated or deleted) shifts slides past fixed offsets,
 *      so a unit whose trimmed text is an old unit's, unchanged, is that unit (2026-10-27-slide-structure-strip.md
 *      §10; by offset alone, deleting B handed B's id to C, and a Live viewer on C landed on the wrong slide). Old
 *      units match in order, each once; blank units are skipped, since every blank slide reads the same.
 *   3. SAME PLACE: what text cannot place, a slide being typed in, keeps the id of the unit at its offset.
 *
 * What none of them places is a new unit (`undefined`).
 */
function assignIds(fresh: readonly string[], old: readonly { id: UnitId; text: string }[], byOffset: readonly (UnitId | undefined)[]): (UnitId | undefined)[] {
	const textOf = new Map(old.map((o) => [o.id, o.text.trim()]));
	const ids: (UnitId | undefined)[] = new Array(fresh.length);
	const used = new Set<UnitId>();
	const give = (i: number, id: UnitId) => {
		ids[i] = id;
		used.add(id);
	};
	for (let i = 0; i < fresh.length; i++) {
		const c = byOffset[i];
		if (c !== undefined && !used.has(c) && textOf.get(c) === fresh[i].trim()) give(i, c);
	}
	const pool = new Map<string, UnitId[]>();
	for (const o of old) {
		const t = o.text.trim();
		if (!t || used.has(o.id)) continue;
		const list = pool.get(t);
		if (list) list.push(o.id);
		else pool.set(t, [o.id]);
	}
	for (let i = 0; i < fresh.length; i++) {
		const t = fresh[i].trim();
		const id = ids[i] === undefined && t ? pool.get(t)?.shift() : undefined;
		if (id !== undefined) give(i, id);
	}
	for (let i = 0; i < fresh.length; i++) {
		const c = byOffset[i];
		if (ids[i] === undefined && c !== undefined && !used.has(c)) give(i, c);
	}
	return ids;
}

/** Build an index of `source` from nothing. `prev`, when given, lends its ids to units that
 *  start at the same offset (the fallback path of `updateDeckIndex` uses it). */
export function buildDeckIndex(source: string, prev?: DeckIndex, carry?: (newFrom: number) => number | undefined): DeckIndex {
	const text = String(source ?? '');
	const bodyStart = frontMatterBlock(text).length;
	const mode = resolveSplitMode(text);
	const seps = separatorsOf(text.slice(bodyStart), bodyStart, true);
	const byFrom = new Map<number, UnitId>();
	if (prev && carry) for (const c of prev.units) {
		const f = carry(c.from);
		if (f !== undefined && !byFrom.has(f)) byFrom.set(f, c.id);
	}
	const raws = rawChunks(text, bodyStart, seps);
	// See `assignIds`: a rebuild after a structural edit keeps each slide's id.
	const ids = prev
		? assignIds(
				raws.map((r) => text.slice(r.from, r.end)),
				prev.units.map((c) => ({ id: c.id, text: prev.source.slice(c.from, c.end) })),
				raws.map((r) => byFrom.get(r.from)),
			)
		: [];
	const units: Unit[] = raws.map((r, i) => ({ id: ids[i] ?? nextUnitId(), from: r.from, start: r.start, end: r.end, parts: sectionsOf(text.slice(r.from, r.end), r.start - r.from, mode) }));
	return finish(text, bodyStart, mode, units, seps);
}

export interface UpdateOptions {
	span?: EditSpan;
	skipClosingCheck?: boolean;
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
	// Same text under the same parser rules is the same index. A plugin admission change
	// (the host narrowed its block rules) re-splits the SAME text, so it rebuilds.
	if (prev.source === text && prev.rulesGeneration === boundaryRulesGeneration()) return prev;
	const { from, toA, toB } = (opts?.span && spanHolds(prev.source, text, opts.span)) || diffSpan(prev.source, text);
	const delta = toB - toA;
	// Map an offset in the old text to the new one, for units outside the edit.
	const carry = (o: number) => (o <= from ? o : o >= toA ? o + delta : undefined);
	const full = () => {
		indexStats.full++;
		const built = buildDeckIndex(text, prev, carry);
		// The SAME text re-split under new parser rules (a plugin admission change) is the same
		// revision: an editor that fed this text holds this revision, and its next report must not
		// read as stale (found by the checker: caret moves went dead until the next keystroke).
		return prev.source === text ? { ...built, rev: prev.rev } : built;
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

	// Old units split three ways: wholly before the region, inside it, wholly after it.
	const regionEndOld = closing ? closing.index : prev.source.length;
	const before: Unit[] = [];
	const inside: Unit[] = [];
	const after: Unit[] = [];
	// By where a unit STARTS, not where it ends: an empty unit starts where it ends, so one right after the
	// region's opening separator, or at the very end of the text, would sit on both edges at once. A unit
	// before the region starts before its opening separator ends; one after it starts past the closing
	// separator's first character; with no closing separator the region runs to the end and nothing is after.
	for (const c of prev.units) {
		if (c.from < regionStart) before.push(c);
		else if (closing && c.from > regionEndOld) after.push(c);
		else inside.push(c);
	}
	const regionEndNewBody = closing ? closing.index + delta : text.length;
	const fresh = rawChunks(text, prev.bodyStart, found, 0, found.length, regionStart, regionEndNewBody);
	// Ids inside the region (`assignIds`). The offset candidates: match from the front while the starts agree, then from
	// the back while the distance to the region end agrees; and when the count is unchanged, a chunk edited in place
	// is the chunk at its index (its start may have moved, an edit at its very top, but it is still the same slide).
	const cand: (UnitId | undefined)[] = new Array(fresh.length);
	let f = 0;
	while (f < fresh.length && f < inside.length && fresh[f].from === inside[f].from) {
		cand[f] = inside[f].id;
		f++;
	}
	let k = 0;
	while (
		fresh.length - 1 - k >= f &&
		inside.length - 1 - k >= f &&
		regionEndNewBody - fresh[fresh.length - 1 - k].from === regionEndOld - inside[inside.length - 1 - k].from
	) {
		cand[fresh.length - 1 - k] = inside[inside.length - 1 - k].id;
		k++;
	}
	if (fresh.length === inside.length) for (let i = 0; i < fresh.length; i++) cand[i] ??= inside[i].id;
	const ids = assignIds(
		fresh.map((r) => text.slice(r.from, r.end)),
		inside.map((c) => ({ id: c.id, text: prev.source.slice(c.from, c.end) })),
		cand,
	);
	const mid: Unit[] = fresh.map((r, i) => ({
		id: ids[i] ?? nextUnitId(),
		from: r.from,
		start: r.start,
		end: r.end,
		parts: sectionsOf(text.slice(r.from, r.end), r.start - r.from, prev.mode),
	}));
	const moved: Unit[] = delta === 0 ? after : after.map((c) => ({ id: c.id, from: c.from + delta, start: c.start + delta, end: c.end + delta, parts: c.parts }));
	return finish(text, prev.bodyStart, prev.mode, [...before, ...mid, ...moved], newSeps);
}

/** The Lattice deck outliner, for `createFocusHub({ outliner: deckOutliner })`. */
export const deckOutliner: Outliner<DeckIndex> = {
	update: (prev, text, o) => updateDeckIndex(prev, text, o),
};
