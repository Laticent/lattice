import { type Gesture, gestureRest, type RectSource } from '@/lib/vetrina';
import { frameGeom, innerRectToParent } from '@/playground/frame-geom.js';

// THE GUIDE RUNG — pointing at the part of the slide currently being narrated (#1397),
// with the deictic gesture vocabulary that stopped it being a karaoke follower (#1404).
//
// CC shows the words, Voice speaks them, Guide shows you WHERE TO LOOK. Three independent
// toggles over one narration.
//
// ── The cadence, and why it is the BLOCK ───────────────────────────────────────────────────
//
// A cue is a SENTENCE, and Guide shipped moving on every one of them: six or eight trips per
// dense slide, several of them between two sentences of the same paragraph. The eye gets
// dragged on every full stop, and a pointer whose only verb is "go somewhere" can only say
// "this" by traveling — so the delivery reads as monotonous even when every target is right.
//
// A presenter's hand is a DEICTIC: it rests, moves to a thing worth naming, makes a gesture
// that fits what it is naming, and withdraws. So the gesture fires on a BLOCK change; a cue
// that resolves to the same element as the last one is a REST — no move, no ink, nothing. A
// five-sentence paragraph gets one gesture and then a still hand.
//
// WHICH gesture is decided here rather than in Vetrina, because it is a judgment about prose:
// see `chooseGesture`. The vocabulary itself, and the property that the cursor ends up outside
// whatever it named, are the library's (`gestureRest`).
//
// ── Where the targets come from, and why NOT from the projection ───────────────────────────
//
// The design record proposed sourcing targets from `projectDeckSpeech`, on the grounds that it
// "already knows which DOM node each sentence came from and throws it away". Reading the
// pipeline, that is half true and the half that is false is the load-bearing half:
//
//   `speakGeneric` (lib/transformers/prose-projection.mjs) does hold `el` alongside its text —
//   but per BLOCK, not per sentence, and it joins those blocks into ONE string per slide.
//   Sentences do not exist yet at that point. They are created much later and somewhere else,
//   by `buildTrack` segmenting the projected string in read-aloud.ts.
//
// So there is no per-sentence node to keep. Threading one through would mean carrying node
// identity across four string-only boundaries — the projection primitives, `normalizeProjected`,
// the `string[]` return that both Present AND the CLI export consume, and `buildTrack`'s cue
// construction — i.e. changing the shared export kernel's contract for a Studio-only feature.
//
// Worse, it would be threading identity through the WRONG DOCUMENT. The projection parses a
// detached copy of the render; the slide a viewer is looking at is a live iframe whose DOM the
// runtime has since mutated (Mermaid inflated, charts drawn, KaTeX typeset). A node from the
// detached parse is not a node you can point at.
//
// So Guide resolves LATE, against the live frame, by matching the cue's DISPLAY text to the
// smallest block that contains it. That works on every existing deck with zero authoring —
// which was the actual requirement — costs the shared kernel nothing, and is robust to whatever
// the runtime did to the DOM after render, because it reads the DOM that is on screen.
//
// ── The two named constraints ──────────────────────────────────────────────────────────────
//
// CROSS-FRAME. Vetrina's stage sits over the live app and never enters a preview iframe. The
// slide IS an iframe. Handled by `RectSource` (the target widening from #1400) fed by the shared
// `frame-geom` bridge — so the library still knows nothing about frames.
//
// ONE CONDUCTOR. Read-aloud owns the clock. Nothing here has a timer: the cursor moves when the
// reader says the cue changed, full stop. A second clock (Vetrina's storyboard `readMs` dwell)
// would drift against the audio within a slide and point at the wrong thing — which is the
// most likely way this feature ships feeling broken.

/** Collapse whitespace the way the projection does, so DOM text and cue text compare equal. */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Strip what a reader normalizes away but the DOM still shows, so a match is not defeated by
 *  punctuation the projection rewrote (a terminating period it added, curly quotes, dashes).
 *
 *  LETTERS OF EVERY SCRIPT, not `[a-z0-9]`. An ASCII-only class does not merely fail on a
 *  Cyrillic or Greek deck — it fails DANGEROUSLY: every letter is dropped and the sentence
 *  collapses to a run of spaces, which still clears the length guard, so `hay.includes(needle)`
 *  degrades into "does this block have at least as many words" and the cursor lands on an
 *  arbitrary line, confidently. (CJK collapses to the empty string and merely goes silent.)
 *  `\p{L}\p{N}` keeps the letters, so matching stays matching. `frontMatterLang` makes
 *  non-English decks a supported surface, so this is a real deck, not a hypothetical. */
const loose = (s: string): string =>
	norm(s)
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^\p{L}\p{N}' -]+/gu, '');

/** Blocks worth pointing at — the same shape the projection walks, minus the containers, so a
 *  match lands on the paragraph rather than on the `<section>` that also contains it. */
const BLOCK_SELECTOR = 'p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, th, td, code';

/**
 * The element inside `frameDoc` that a spoken sentence came from, or null.
 *
 * Smallest-containing-block first; a cue that no single block contains is then matched piecewise
 * (`findSpanningTarget`), which is how a label joined to its body finds the thing it names.
 */
export function findCueTarget(frameDoc: Document | Element | null, text: string): Element | null {
	return findCueTargetIn(frameDoc, text) ?? findSpanningTarget(frameDoc, text);
}

/**
 * The smallest BLOCK containing the sentence, or null.
 *
 * Not first-match: a `<li>` inside a `<ul>` inside a `<section>` all "contain" the sentence, and
 * only the `<li>` is worth pointing at. Ties break INWARD — see the loop, where document order
 * would otherwise hand back the wrapper.
 */
function findCueTargetIn(frameDoc: Document | Element | null, text: string): Element | null {
	if (!frameDoc) return null;
	const needle = loose(text);
	// Long enough to identify something, and carrying at least one letter or digit. A needle of
	// pure separators would match the first block with as many of them, which is not a match.
	if (needle.length < 3 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	let best: Element | null = null;
	let bestLen = Number.POSITIVE_INFINITY;
	for (const el of frameDoc.querySelectorAll(BLOCK_SELECTOR)) {
		const hay = loose(el.textContent ?? '');
		if (!hay) continue;
		// CONTAINMENT ONE WAY ONLY: the block must contain the sentence. The reverse — a block
		// whose text is a SUBSTRING of the sentence — was allowed here for reach, and it is a
		// target-picking machine for the wrong element: any such block is by definition shorter
		// than the paragraph that really holds the sentence, so smallest-wins always prefers it.
		// A heading, a kicker, a table cell or an inline `<code>` whose words recur in the
		// sentence beneath it takes the cursor every time — the everyday Lattice slide shape.
		//
		// Measured over the 124 decks in `examples/` + `test/integration/baseline-decks/`
		// (5,551 cues): the reverse branch raised the match rate from 83.5% to 90.7% and
		// produced 639 hits on an element holding less than half the spoken sentence. Without
		// it: ZERO such hits, and the number of slides where the cursor never moves barely
		// changes (64 → 62). It bought reach by pointing somewhere wrong.
		if (!hay.includes(needle)) continue;
		// Strictly smaller wins. On a TIE, prefer the one nested inside the incumbent: a
		// `<blockquote>` wrapping a single `<p>` has byte-identical text, and document order hands
		// you the blockquote — so a plain `<` kept pointing at the wrapper instead of the line.
		// (The `quote` component is exactly that shape, so this is not a hypothetical.)
		if (hay.length < bestLen || (hay.length === bestLen && (best as Element | null)?.contains(el))) {
			best = el;
			bestLen = hay.length;
		}
	}
	return best;
}

// ── A cue the projection built out of TWO blocks ───────────────────────────────────────────
//
// `speakGeneric` joins a slot label to its body with ": " — "Build everything: Owns the plumbing
// and the scoring alike." — and `buildTrack` then segments that into ONE sentence, because it is
// one sentence. No single element contains it, so smallest-containing-block returned null and the
// cursor HID. On the everyday label+body shapes that is not an edge case, it is the FIRST item of
// every group: split-compare's two options, and every `stats` figure (where the projection also
// puts the label BEFORE the value, so the joined string is not even in DOM order).
//
// Measured on the four shapes the maintainer named: split-compare lost its first bullet on both
// sides and `stats` lost every cue on the slide — which is exactly the reported symptom, "the
// first bullet is not highlighted but the subsequent ones are".
//
// So a cue that no block contains is matched PIECEWISE: split it at the join, resolve each part,
// and name the smallest element that contains the parts that resolved.

/** Where the projection joins a label to what it labels. Not a general sentence splitter — a
 *  colon or semicolon FOLLOWED BY A SPACE, which is what the join emits and what prose rarely
 *  carries inside a clause worth splitting on. */
const JOIN = /[:;]\s+/;

/** The lowest element containing both, or null when they share no element under the root. */
function commonAncestor(a: Element, b: Element): Element | null {
	let node: Element | null = a;
	while (node && !node.contains(b)) node = node.parentElement;
	return node;
}

/**
 * The element a JOINED cue names, when no single block holds the whole thing.
 *
 * TWO GUARDS, because "widen the search until something matches" is how a cursor ends up pointing
 * at the slide:
 *
 *   - only parts that are themselves long enough to identify a block are used, so a stray "Q3"
 *     cannot drag the answer somewhere;
 *   - the common ancestor is rejected when it holds much more text than the cue does. A container
 *     that is three times the cue is not "the thing being said", it is the group the thing is in —
 *     and pointing at the group is the failure this feature already refused once (the reverse
 *     containment branch, §findCueTarget). On rejection the answer is the element holding the
 *     LONGEST part, which is a real block that carries most of what is being said.
 */
export function findSpanningTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const parts = text.split(JOIN).map((s) => s.trim());
	// TWO PARTS BEFORE THE FILTER, not after. A stats figure narrates "<label>: <value>." and the
	// value is a bare number — `loose('42%.')` is "42", two characters, too short to identify a
	// block on its own. Requiring two SEARCHABLE parts threw the whole cue away over that, and
	// every stats slide in the corpus went dark. The split is the evidence that this cue was
	// joined; whether both halves are searchable is a separate question, answered below.
	if (parts.length < 2) return null;
	const hits: { el: Element; len: number }[] = [];
	for (const part of parts.filter((s) => loose(s).length >= 3)) {
		const el = findCueTargetIn(root, part);
		if (el) hits.push({ el, len: loose(part).length });
	}
	if (!hits.length) return null;
	const longest = hits.reduce((a, b) => (b.len > a.len ? b : a)).el;
	// CLIMB TO WHAT HOLDS ALL OF IT, from wherever the parts landed. Starting at the common
	// ancestor of the matched parts and climbing is not the same as taking the common ancestor:
	// a stats figure whose VALUE was too short to search matches one part and would otherwise stop
	// at that part's own block, so the same slide would resolve differently figure by figure
	// depending on whether its number happened to be three characters long. The climb asks the
	// same question of every cue — "what element holds everything this sentence says" — so the
	// answer is a property of the slide, not of the arithmetic.
	let node: Element | null = hits[0].el;
	for (const h of hits.slice(1)) {
		if (!node) break;
		node = commonAncestor(node, h.el);
	}
	const pieces = parts.map(loose).filter((p) => p.length > 0);
	const budget = loose(text).length * SPAN_SLACK;
	while (node && node !== root) {
		const hay = loose(node.textContent ?? '');
		// The bound is what stops "widen until something matches" from walking to the slide: a
		// container holding several times the cue is the GROUP the thing is in, and pointing at the
		// group is the failure this feature already refused once (§findCueTarget).
		if (hay.length > budget) break;
		if (pieces.every((p) => hay.includes(p))) return node;
		node = node.parentElement;
	}
	return longest;
}

/** How much more text than the cue a spanning container may hold before it stops being "the
 *  thing being said" and becomes the group it belongs to. Set from the corpus sweep. */
const SPAN_SLACK = 3;

// ── The sentence's OWN rectangles, inside the block ────────────────────────────────────────
//
// A block is where the sentence lives; it is not the sentence. Naming the paragraph when the
// narrator is speaking one clause of it is the same error as pointing at the table when the
// deck said `_focus: row 4`. So the spoken text is located INSIDE the block's text nodes and
// turned into a `Range`, whose `getClientRects()` are the per-line boxes the ink follows.
//
// The mapping is the fiddly part and it is done by CONSTRUCTION rather than by cleverness:
// build the same `loose()` string the matcher already uses, carrying an index back to the raw
// text at every step, then VERIFY the reconstruction equals `loose(raw)` before trusting it.
// If the two ever disagree — a locale where `toLowerCase` changes a character's length is the
// realistic case — the answer is null and every caller degrades to the block's own box. A
// wrong range would paint a highlighter over words nobody is saying, which is worse than no
// highlighter at all.

type NodeSpan = { node: Text; start: number };

/** The block's raw text, plus where each character came from. */
function textIndex(block: Element): { raw: string; spans: NodeSpan[] } {
	const spans: NodeSpan[] = [];
	let raw = '';
	const walk = block.ownerDocument.createTreeWalker(block, 4 /* SHOW_TEXT */);
	for (let n = walk.nextNode(); n; n = walk.nextNode()) {
		const t = n as Text;
		if (!t.data) continue;
		spans.push({ node: t, start: raw.length });
		raw += t.data;
	}
	return { raw, spans };
}

/** `loose(raw)`, rebuilt character by character with an index back into `raw`. Null when the
 *  rebuild does not reproduce `loose` exactly — see the note above. */
function looseIndex(raw: string): { s: string; map: number[] } | null {
	// Stage 1 — collapse whitespace runs to one space (what `norm` does), keeping indices.
	let n1 = '';
	const m1: number[] = [];
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (/\s/.test(c)) {
			if (n1.length && n1[n1.length - 1] !== ' ') {
				n1 += ' ';
				m1.push(i);
			}
			continue;
		}
		n1 += c;
		m1.push(i);
	}
	// …and trim, which `norm` does after the collapse.
	let lo = 0;
	let hi = n1.length;
	while (lo < hi && n1[lo] === ' ') lo++;
	while (hi > lo && n1[hi - 1] === ' ') hi--;
	// Stage 2 — lowercase, fold the quotes/dashes, drop everything `loose` drops.
	let s = '';
	const map: number[] = [];
	for (let i = lo; i < hi; i++) {
		const c = n1[i];
		let ch = c.toLowerCase();
		// ONE CHARACTER IN, ONE CHARACTER OUT — the invariant the whole map rests on. A few case
		// folds are length-changing (`İ` lowercases to two code points), and emitting both would
		// push one index for two characters and slide every offset after it. Keeping the original
		// character holds the invariant; the reconstruction check at the end then notices the
		// difference from `loose()` and refuses the range outright, which is the honest answer.
		if (ch.length !== 1) ch = c;
		if ('‘’“”'.includes(ch)) ch = "'";
		else if ('–—'.includes(ch)) ch = '-';
		if (!/[\p{L}\p{N}' -]/u.test(ch)) continue;
		s += ch;
		map.push(m1[i]);
	}
	return s === loose(raw) ? { s, map } : null;
}

/** Turn a raw-text offset into the (text node, offset) pair a `Range` needs. */
function at(spans: readonly NodeSpan[], rawIndex: number): { node: Text; offset: number } | null {
	for (let i = spans.length - 1; i >= 0; i--) {
		if (spans[i].start <= rawIndex) return { node: spans[i].node, offset: rawIndex - spans[i].start };
	}
	return null;
}

/**
 * A `Range` over `text` inside `block`, or null when the sentence cannot be located precisely —
 * which is a normal outcome, not a failure.
 *
 * A RANGE rather than the rectangles it currently has, because a range is itself a live rect
 * source: it stays valid as long as its text nodes do, and `getClientRects()` re-reads the
 * layout. Resolving the range once and re-measuring it per frame is what lets the wash track
 * its words (#1400) without a tree walk and a string rebuild on every animation frame — the
 * readiness-band lesson, applied before it costs anything.
 */
export function sentenceRange(block: Element, text: string): Range | null {
	const needle = loose(text);
	if (needle.length < 3) return null;
	const { raw, spans } = textIndex(block);
	if (!spans.length) return null;
	const idx = looseIndex(raw);
	if (!idx) return null;
	const hit = idx.s.indexOf(needle);
	if (hit < 0) return null;
	const a = at(spans, idx.map[hit]);
	// Reach through the trailing punctuation `loose()` threw away, so the ink ends where the
	// SENTENCE ends and not one character short of its full stop. Non-space only: swallowing the
	// space would run the highlighter into the first letter of the next sentence.
	let end = idx.map[hit + needle.length - 1];
	while (end + 1 < raw.length && !/[\s\p{L}\p{N}]/u.test(raw[end + 1])) end++;
	const b = at(spans, end);
	if (!a || !b) return null;
	try {
		const range = block.ownerDocument.createRange();
		range.setStart(a.node, a.offset);
		range.setEnd(b.node, b.offset + 1);
		return range;
	} catch {
		return null;
	}
}

/** A range over everything an element says — the fallback ink when a sentence cannot be located
 *  inside it, and the source of the text's own geometry below. */
export function contentRange(el: Element): Range | null {
	try {
		const r = el.ownerDocument.createRange();
		r.selectNodeContents(el);
		return r;
	} catch {
		return null;
	}
}

/**
 * The TEXT's own geometry, as opposed to the box that contains it.
 *
 * Two things a shape classifier gets wrong without it, both from real slide shapes:
 * PADDING — a table cell with 20px of padding is 64px tall around one 24px line, so
 * `height / lineHeight` calls it a multi-line block; and COLUMN WIDTH — a `<p>` holding the
 * word "42%" has the full column's width, so a width threshold calls it a wide line of prose.
 * Line boxes have neither problem: they are exactly where the words are.
 *
 * Rects on the same line are merged by their top edge, because inline markup splits a line into
 * several — a line with a `<strong>` in it is three rects and one line.
 *
 * Null when there is no layout to read (jsdom), so every caller keeps a box-based fallback.
 */
export function textGeometry(range: Range | null): { rects: DOMRect[]; box: Box; lines: number } | null {
	const rects = rectsOf(range);
	if (!rects) return null;
	const left = Math.min(...rects.map((r) => r.left));
	const top = Math.min(...rects.map((r) => r.top));
	const right = Math.max(...rects.map((r) => r.left + r.width));
	const bottom = Math.max(...rects.map((r) => r.top + r.height));
	// LINES ARE CLUSTERED, NOT BINNED ON `top`. Inline fragments on the same visual line do not
	// share a top — a line carrying a `<code>` measures 11 / 12 / 11 in real Chromium, and rounding
	// counts that as three lines. Measured on the committed gallery render: 74 of 770 blocks report
	// more lines than they occupy, and 45 of those get a DIFFERENT gesture for it. Sort by top and
	// start a new line only when the gap exceeds most of a line's own height, which is scale-free
	// (the old `Math.round` was an absolute-pixel bin, so the same deck reclassified at 1.5x).
	const tops = rects.map((r) => r.top).sort((a, b) => a - b);
	const h = Math.max(1, Math.min(...rects.map((r) => r.height)));
	let lines = 1;
	for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > h * 0.6) lines += 1;
	return { rects, box: { left, top, width: right - left, height: bottom - top }, lines };
}

/** The range's per-line boxes, with the empty ones dropped. Null rather than `[]`, so "there is
 *  no usable ink here" is one answer everywhere instead of two. */
export function rectsOf(range: Range | null): DOMRect[] | null {
	if (!range) return null;
	try {
		const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
		return rects.length ? rects : null;
	} catch {
		return null;
	}
}

/** The per-line rectangles of `text` inside `block`, in the frame's INNER coordinates. */
export const sentenceRects = (block: Element, text: string): DOMRect[] | null => rectsOf(sentenceRange(block, text));

// ── "Notable" is `_focus:`, and nothing else ───────────────────────────────────────────────
//
// Lattice already has an authored call-this-out grammar: `<!-- _focus: row 4 -->` tags the
// named element `.lat-focus` on the render path Present uses. When a slide declares focus the
// DECK has already said what matters, and Guide forming a second opinion about importance
// would be a parallel notion of the same thing — the thing this deliberately does not build.
// (`mark-*` / `tint-*` are slide-level ATMOSPHERE, not inline emphasis, so they are not it.)

/** The element to actually name, given the block the sentence resolved to.
 *
 *  If the block CONTAINS a focused element smaller than itself, the focused element wins: the
 *  deck said "row 4", so pointing at the table would be ignoring it. Escalation then falls out
 *  of the vocabulary — a smaller box picks a stronger gesture through `chooseGesture` — rather
 *  than being a second knob bolted beside it. */
export function aimTarget(block: Element, text = ''): { el: Element; notable: boolean } {
	if (block.classList.contains('lat-focus') || block.closest('.lat-focus')) return { el: block, notable: true };
	const inner = block.querySelector('.lat-focus');
	// THE REFINED AIM MUST STILL HOLD THE SPOKEN WORDS. `_focus:` names an ordinal — `row 4`,
	// `item 3`, `line 8-9` — with no relation to which sentence is being read, so an unconditional
	// re-aim is the one path in this whole feature that can point at text nobody is saying. That is
	// the failure #1403 set the bar against ("strictly worse than not pointing at all"), so the
	// deck's call-out wins only when it actually contains the sentence; otherwise the block keeps
	// the aim and the cue is merely drawn at notable weight.
	if (inner && inner !== block && loose(inner.textContent ?? '').includes(loose(text))) return { el: inner, notable: true };
	return { el: block, notable: !!inner };
}

// ── THE HANDLE — what a presenter actually points AT ───────────────────────────────────────
//
// Round two picked a gesture from the target's geometry alone, and geometry alone drew a box
// around a card that already had a border, a box around a timeline stage that was already a node
// on a rail, and an underline under a whole bullet whose bullet was sitting right there. Four
// separate reports, one cause: it named the CONTAINER when a hand names a HANDLE.
//
// The handle is the smallest visual token that STANDS FOR the thing. There is a real result
// behind that, not a preference:
//
//   OBJECT-BASED ATTENTION. Cue any part of a perceptual object and attention spreads across the
//   whole object, faster than it spreads to an equidistant point in a different object (Egly,
//   Driver & Rafal 1994). So ringing a bullet DOES deliver its line. The box around the line buys
//   nothing that the bullet did not already buy — and it costs, because:
//
//   THE EYE LANDS ON A POINT, NOT AN AREA. A saccade is aimed at a location; a 368x438 outline
//   gives it no location, so the eye lands somewhere in the middle and then searches. A ring
//   around a 23px disc is a landing point.
//
//   SMALLEST EFFECTIVE DIFFERENCE (Tufte). The least ink that makes the distinction, because the
//   audience is READING — every pixel of cue competes with the words for the same fovea. Mayer's
//   signaling principle says cue; his coherence principle says cue and nothing else.
//
//   COMMON REGION, ONCE (Gestalt / Palmer). A card with a border is ALREADY grouped. A second
//   outline around it is not emphasis, it is a duplicate boundary — the eye reads two nested
//   regions and has to decide which one is the message. This is the "no box on the timeline
//   items" report stated as a rule, and it is the one below that the code enforces literally.
//
// Priority is the point of the ordering: a PHRASE beats everything (naming part of a thing has to
// show WHICH part), then the MARKER, then the HEADER, then the element's own words.

/** What kind of thing the ink is on — the semantic half of the gesture choice. */
export type AnchorRole = 'phrase' | 'marker' | 'header' | 'body';

export type GuideAnchor = {
	role: AnchorRole;
	/** What the ink follows and, for everything but a phrase, what the cursor clears. */
	box: Box;
	/** Per-line rects for a text handle; the single box for a marker. */
	rects: DOMRect[] | null;
	/** The live source for a TEXT handle — re-measured per frame, never replayed. */
	range: Range | null;
	/** A MARKER has no node and no range, so it is carried as an offset from its owner's box and
	 *  re-derived from one `getBoundingClientRect()` per frame. A computed-style read per
	 *  animation frame is the cost this avoids. */
	markerOffset: { dx: number; dy: number; width: number; height: number } | null;
};

/** Below this there is no handle worth pointing at, only a rounding error. */
const MARKER_MIN = 4;
/**
 * How much of its own font size a `::marker` GLYPH actually inks, by list-style-type.
 *
 * Not the gutter: the parent list's `padding-left` is authored for the widest marker the list will
 * ever hold plus its gap, so measuring the gutter reports a bullet three times its real size — and
 * a bullet reported at 19px crosses the ring threshold that a bullet at 9px does not. A disc is a
 * dot a little under half an em; a number or a letter runs about an em plus its separator.
 */
const MARKER_GLYPH_EM: Record<string, number> = { disc: 0.42, circle: 0.42, square: 0.42 };
const MARKER_GLYPH_DEFAULT = 1.05;

const styleOf = (el: Element, pseudo?: string): CSSStyleDeclaration | null => {
	try {
		return el.ownerDocument.defaultView?.getComputedStyle(el, pseudo ?? null) ?? null;
	} catch {
		return null;
	}
};
const num = (v: string | undefined): number => Number.parseFloat(v ?? '');

/**
 * Does this element draw its OWN boundary — a border, a fill, a shadow?
 *
 * The redundant-boundary rule's input. An element that is already a common region does not get a
 * second one drawn around it; the cue goes to its handle, or sweeps its words, instead.
 *
 * A fully transparent border/shadow is NOT a boundary. Chromium reports `rgba(0, 0, 0, 0) 0px 0px
 * 0px 0px` for `box-shadow` on elements that merely inherit a shadow token slot, and treating that
 * as a boundary would exempt half the slide from `bracket` for nothing.
 */
export function hasOwnBoundary(el: Element): boolean {
	const cs = styleOf(el);
	if (!cs) return false;
	const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
	for (const s of sides) {
		const w = num(cs.getPropertyValue(`border-${s.toLowerCase()}-width`));
		const style = cs.getPropertyValue(`border-${s.toLowerCase()}-style`);
		const color = cs.getPropertyValue(`border-${s.toLowerCase()}-color`);
		if (w >= 0.5 && style !== 'none' && style !== 'hidden' && !isTransparent(color)) return true;
	}
	if (!isTransparent(cs.backgroundColor)) return true;
	if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
	const shadow = cs.boxShadow;
	return !!shadow && shadow !== 'none' && !isTransparent(shadow);
}

/** `rgba(…, 0)` and anything that parses to alpha 0. Substring-safe: a shadow string carries its
 *  color inline, so this is asked of the whole declaration as well as of a bare color. */
function isTransparent(value: string): boolean {
	if (!value || value === 'transparent' || value === 'none') return true;
	const m = /rgba?\(([^)]*)\)/.exec(value);
	if (!m) return false;
	const parts = m[1].split(/[,/]/).map((s) => Number.parseFloat(s.trim()));
	return parts.length >= 4 && Number.isFinite(parts[3]) && parts[3] <= 0.02;
}

/**
 * The LIST MARKER's box — the bullet, the number, the rail disc — in the frame's coordinates.
 *
 * A marker is not a node: it is a `::marker`, or a `::before` a component draws in its place. So
 * it cannot be measured directly and is instead DERIVED from three things that can be: the
 * element's own box, where its first line of text actually starts, and the pseudo-element's
 * computed size (which Chromium does resolve to real pixels for a `::before`).
 *
 * Three shapes, and they are the three Lattice ships:
 *
 *   BLOCK ABOVE — `list-steps.timeline`'s rail disc, a flex child at the top of a centered column.
 *   INLINE LEFT — `list-criteria`'s big index, an absolutely-placed gutter number.
 *   THE REAL `::marker` — split-compare's `list-style: disc`, drawn OUTSIDE the item in the list's
 *   own left padding, which is why the gutter is where it has to be looked for.
 *
 * Null whenever the answer would be a guess: no marker, no text to measure against, or a gap that
 * does not agree with the pseudo's own size. Every caller then falls through to the next handle.
 */
export function markerBox(el: Element, firstLine: Box | null): Box | null {
	if (el.tagName !== 'LI' || !firstLine) return null;
	const r = el.getBoundingClientRect();
	const box: Box = { left: r.left, top: r.top, width: r.width, height: r.height };
	if (!(box.width > 0 && box.height > 0)) return null;
	const cs = styleOf(el);
	if (!cs) return null;
	const before = styleOf(el, '::before');
	const pw = num(before?.width);
	const ph = num(before?.height);
	const drawn = !!before && before.content !== 'none' && before.display !== 'none' && pw >= MARKER_MIN && ph >= MARKER_MIN;
	if (drawn) {
		const gapTop = firstLine.top - box.top;
		const gapLeft = firstLine.left - box.left;
		// A marker ABOVE the text: the gap over the first line is at least the pseudo's height.
		if (gapTop >= ph * 0.8) {
			// Centered or leading? MEASURED, not read off `text-align` — the text can be centered by
			// its own rule, by the flex container's `align-items`, or by an ancestor, and only the
			// resulting geometry knows which happened.
			const centered = Math.abs(firstLine.left + firstLine.width / 2 - (box.left + box.width / 2)) < box.width * 0.08;
			return { left: centered ? box.left + (box.width - pw) / 2 : box.left, top: box.top, width: pw, height: ph };
		}
		// A marker LEFT of the text, inside the element's own box.
		if (gapLeft >= pw * 0.8) return { left: box.left, top: box.top + Math.max(0, (box.height - ph) / 2), width: pw, height: Math.min(ph, box.height) };
		return null;
	}
	if (cs.listStyleType === 'none' && (cs.listStyleImage === 'none' || !cs.listStyleImage)) return null;
	const em = num(styleOf(el, '::marker')?.fontSize) || num(cs.fontSize) || 16;
	const glyph = em * (MARKER_GLYPH_EM[cs.listStyleType] ?? MARKER_GLYPH_DEFAULT);
	// `inside` draws the marker in the element's own first line; `outside` draws it in the parent
	// list's left padding, which is the default and the one every Lattice list uses.
	const gutter = cs.listStylePosition === 'inside' ? Math.max(firstLine.left - box.left, 0) : num(styleOf(el.parentElement ?? el)?.paddingLeft);
	if (!(gutter >= MARKER_MIN)) return null;
	const w = Math.min(gutter, glyph);
	const h = Math.min(w, firstLine.height);
	if (w < MARKER_MIN || h < MARKER_MIN) return null;
	const top = firstLine.top + (firstLine.height - h) / 2;
	return { left: cs.listStylePosition === 'inside' ? box.left : box.left - w, top, width: w, height: h };
}

/** Block-level children that end an element's own leading text — the boundary between a card's
 *  HEADER and its body. `div` is in: the engine wraps a card body in one on several components. */
const NESTED_BLOCK = new Set(['UL', 'OL', 'P', 'DL', 'BLOCKQUOTE', 'TABLE', 'DIV', 'FIGURE', 'PRE']);

/**
 * The element's OWN leading text — everything before its first nested block.
 *
 * That is a card's header, whether the engine gave it an element (`<strong>` in split-compare's
 * options, in `list-criteria`, in `list-steps`) or left it as a bare text node (`cards-grid`'s
 * `<li>Title<ul>body</ul></li>`). One range covers both, which is why this is a range and not a
 * `querySelector` for whatever tag a given component happens to use.
 *
 * Null when the element has no nested block at all — then it is not a container with a header, it
 * is just text, and its own words are the handle.
 */
export function headerRange(el: Element): Range | null {
	const kids = el.childNodes;
	let cut = -1;
	for (let i = 0; i < kids.length; i++) {
		const n = kids[i];
		if (n.nodeType === 1 && NESTED_BLOCK.has((n as Element).tagName)) {
			cut = i;
			break;
		}
	}
	if (cut <= 0) return null;
	try {
		const r = el.ownerDocument.createRange();
		r.setStart(el, 0);
		r.setEnd(el, cut);
		// ONE CHARACTER IS ENOUGH. A `stats` figure's header is its VALUE — "42%", "7" — and a
		// two-character floor silently rejected the one-digit ones, so the same slide handed back a
		// header for two figures and the whole card for the third. What disqualifies a header is
		// having no content at all, not being short; short is what a header usually is.
		return /[\p{L}\p{N}]/u.test(r.toString()) ? r : null;
	} catch {
		return null;
	}
}

/** The handle for one cue: what the ink goes on, and what kind of thing that is.
 *
 *  `sentence` is the cue's own range inside `el` when it could be located; `coverage` is how much
 *  of the element the cue is. A cue that is a PHRASE keeps its words — pointing at a bullet while
 *  one clause of its line is being read would name the whole line, which is not what is being
 *  said. Everything else goes to the smallest token that stands for the element. */
export function anchorFor(el: Element, sentence: Range | null, coverage: number): GuideAnchor {
	const asBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
	const own = contentRange(el);
	const ownRects = rectsOf(own);
	if (sentence && coverage < PHRASE_COVERAGE) {
		const rects = rectsOf(sentence);
		if (rects) return { role: 'phrase', box: hull(rects), rects, range: sentence, markerOffset: null };
	}
	const marker = markerBox(el, ownRects ? asBox(ownRects[0]) : null);
	if (marker) {
		const r = el.getBoundingClientRect();
		return {
			role: 'marker',
			box: marker,
			rects: [asRect(marker)],
			range: null,
			markerOffset: { dx: marker.left - r.left, dy: marker.top - r.top, width: marker.width, height: marker.height },
		};
	}
	const header = headerRange(el);
	const headRects = rectsOf(header);
	if (header && headRects) return { role: 'header', box: hull(headRects), rects: headRects, range: header, markerOffset: null };
	const range = sentence ?? own;
	const rects = sentence ? rectsOf(sentence) : ownRects;
	return { role: 'body', box: rects ? hull(rects) : boxOf(el.getBoundingClientRect()), rects, range, markerOffset: null };
}

/** The bounding box of a set of rects. */
const hull = (rects: readonly DOMRect[]): Box => {
	const left = Math.min(...rects.map((r) => r.left));
	const top = Math.min(...rects.map((r) => r.top));
	return { left, top, width: Math.max(...rects.map((r) => r.left + r.width)) - left, height: Math.max(...rects.map((r) => r.top + r.height)) - top };
};

// ── The vocabulary, chosen by the SHAPE of the thing being named ───────────────────────────

export type GuideShape = {
	/** The TEXT's own box, in the frame's inner coordinates — not the element's, which carries
	 *  padding and column width that have nothing to do with the shape of the thing (see
	 *  `textGeometry`). Every width test is a fraction of `slideW`, so the classifier reads the
	 *  same on a 1280 deck and a 1920 one. */
	box: Box;
	/** How many lines that text actually occupies. */
	lines: number;
	/** The spoken sentence's own line rects inside the block, when they could be resolved. */
	rects: readonly Box[] | null;
	/** The slide's own width, for the "is this a wide thing or a compact one" thresholds. */
	slideW: number;
	/** How much of the block's text the spoken sentence is, 0..1. */
	coverage: number;
	/** What kind of thing the ink is on (`anchorFor`). The SEMANTIC half of the choice — a marker
	 *  is named the way a marker is named whatever its measurements say. */
	role: AnchorRole;
	/** True when the thing being named already draws its own border / fill / shadow. */
	enclosed: boolean;
};

/** More lines than this is a BLOCK, not a line — and the bound is 1, deliberately.
 *
 *  It was 2, which let a two-line target fall through to `underline`. But underline is the
 *  one-line gesture in both halves: it strokes the first line rect and rests beside it, so on a
 *  two-line sentence the ink named half the words and the hand parked in the middle of the rest.
 *  32% of underlines in the corpus were that shape. A wrapped sentence is a block; `bracket` says
 *  "all of this", which is what a wrapped sentence needs. */
const LINES_BLOCK = 1;
/** A sentence covering less than this much of its block is a PHRASE inside it. */
const PHRASE_COVERAGE = 0.7;
/** Narrower than this share of the slide, on a single line, is "small and discrete". */
const TAP_WIDTH = 0.1;
/** Compact-and-substantial: within this share of the slide and this aspect ratio. */
const RING_WIDTH = 0.42;
const RING_ASPECT = 3.2;
/** A marker at least this wide (as a share of the slide) is substantial enough to RING; below it,
 *  the ring would be mostly empty space and a `tap` is the honest cue. ~15px on a 1280 deck: a
 *  timeline rail disc and a criteria index are above it, a `disc` bullet is well below. */
const MARKER_RING = 0.012;

/**
 * Which gesture names this thing. MOTIVATED VARIETY, NEVER A DIE ROLL — what the target IS picks
 * the verb first, and only then how it measures. First rule that matches wins.
 *
 * THE ORDER IS THE ARGUMENT:
 *
 *  1. A PHRASE is a fact about the cue, not about the box — one clause of a paragraph needs the
 *     gesture that names part of a block without naming the block, whatever shape the block is.
 *  2. A MARKER is a small round token that already means "this item". Ring it if there is enough
 *     of it to ring, tap it if there is not. Nothing about its container enters into it.
 *  3. THE REDUNDANT-BOUNDARY RULE. `bracket` draws a common region around what it names, so it is
 *     only ever right for something that does not already have one. A card with a border, a cell
 *     with a fill, a stage on a rail: drawing a second outline around it makes the eye choose
 *     between two nested regions. Those sweep their words instead.
 *  4. Then, and only then, the measurements: narrow → tap, compact → ring, a line → underline.
 *
 * The thresholds are not taste. `tools/sweep-guide-gestures.mjs` renders the whole committed
 * corpus and reports the distribution each one produces; they were set from that distribution
 * rather than the other way round (HARD RULE #19's discipline applied to a design constant).
 */
export function chooseGesture(shape: GuideShape): Gesture {
	const { box, lines, slideW, role, enclosed } = shape;
	if (role === 'phrase') return 'wash';
	if (role === 'marker') return Math.min(box.width, box.height) >= MARKER_RING * slideW ? 'circle' : 'tap';
	if (lines > LINES_BLOCK) return enclosed ? 'wash' : 'bracket';
	if (box.width <= TAP_WIDTH * slideW && lines <= 1) return 'tap';
	if (box.width <= RING_WIDTH * slideW && box.width / Math.max(1, box.height) <= RING_ASPECT) return 'circle';
	return 'underline';
}

/** The spoken text of a cue, in the form the DOM would show it (display, not spoken — the
 *  spoken form has acronyms expanded and say-as applied, which the slide does not contain). */
export function cueDisplayText(cue: { words?: { display?: string }[] } | null | undefined): string {
	if (!cue?.words?.length) return '';
	return norm(cue.words.map((w) => w.display ?? '').join(' '));
}

/** The Vetrina cursor's own footprint, in PARENT pixels — a 28x28 box centered on the point it
 *  is placed at (`stage.ts`: `width:28px;height:28px;transform:translate(-50%,-50%)`). It does
 *  not scale with the frame, because the cursor lives in the parent document, not in the slide. */
export const POINTER_BOX = 28;

export type Box = { left: number; top: number; width: number; height: number };

const overlaps = (a: Box, b: Box): boolean => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
const boxAt = (x: number, y: number, half: number): Box => ({ left: x - half, top: y - half, width: half * 2, height: half * 2 });
const inside = (b: Box, f: Box): boolean => b.left >= f.left && b.top >= f.top && b.left + b.width <= f.left + f.width && b.top + b.height <= f.top + f.height;

/**
 * Where to put the pointer so it POINTS AT `target` without covering ANY text on the slide.
 *
 * THE POINTER MUST NEVER OBSCURE THE TEXT IT IS READING. Vetrina's `aimAt` lands a cue INSIDE
 * its target's box (`left + 22`, `top + 18`) — right for a walkthrough aiming at a button,
 * because that is where a click lands, and exactly wrong for a line of prose: the arrow tip lands
 * mid-first-line and its 28px body hangs across the opening words. Guide shipped that.
 *
 * CLEARING THE TARGET IS NOT ENOUGH, and that is the whole reason this takes `obstacles`. The
 * first version tried four positions around the target's own box and still failed on the real
 * surface, because the obvious place to stand — just below a heading — is where the paragraph
 * is. A slide is mostly text; the pointer has to find the whitespace, not merely step off one
 * block.
 *
 * So: candidate positions on the four sides at three distances, plus the slide's own left and
 * right margins, scored by how much text they would cover and then by how far they sit from the
 * thing being named. The nearest position that covers nothing wins; if a slide genuinely has no
 * clear spot the least-covering one does, because a pointer slightly over a neighbor still beats
 * a pointer half off the card.
 *
 * Everything is in ONE coordinate space — the caller works in the frame's INNER coordinates and
 * maps the result out, so the anchor is computed once per cue and rides the frame's scale and
 * position for free rather than being recomputed every animation frame.
 */
export function pointerAnchor(target: Box, frame: Box, obstacles: readonly Box[] = [], half: number = POINTER_BOX / 2): { x: number; y: number } {
	const pad = half + 5;
	const midY = target.top + target.height / 2;
	const nearX = target.left + Math.min(target.width / 2, pad);
	const candidates: Array<{ x: number; y: number }> = [];
	for (const gap of [5, 20, 44]) {
		candidates.push({ x: target.left - gap - half, y: midY }); // left margin, level — the classic deictic
		candidates.push({ x: nearX, y: target.top + target.height + gap + half }); // under the line
		candidates.push({ x: nearX, y: target.top - gap - half }); // above it
		candidates.push({ x: target.left + target.width + gap + half, y: midY }); // right margin, level
	}
	// The slide's own margins, as a last resort before giving up on clearance entirely.
	candidates.push({ x: frame.left + pad, y: midY }, { x: frame.left + frame.width - pad, y: midY });

	let best: { x: number; y: number } | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const c of candidates) {
		const box = boxAt(c.x, c.y, half);
		if (!inside(box, frame)) continue; // a pointer half off the card reads as a bug, not a gesture
		const hits = obstacles.reduce((n, o) => n + (overlaps(box, o) ? 1 : 0), 0);
		const dist = Math.hypot(c.x - target.left, c.y - midY);
		const score = hits * 1e6 + dist;
		if (score < bestScore) {
			bestScore = score;
			best = c;
		}
	}
	if (best) return best;
	const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
	return {
		x: clamp(nearX, frame.left + pad, frame.left + frame.width - pad),
		y: clamp(target.top + target.height + 5 + half, frame.top + pad, frame.top + frame.height - pad),
	};
}

const GONE = { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
const asRect = (b: Box): DOMRect => ({ x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({ ...b }) }) as DOMRect;

/** A live source for a FIXED point in the frame's inner coordinates — a 2x2 box, so Vetrina's
 *  `aimAt` (`left + min(w/2, 22)`) resolves to the point itself rather than an offset into it. */
function innerPoint(getFrame: () => HTMLIFrameElement | null, alive: () => boolean, p: { x: number; y: number }): RectSource {
	return {
		getBoundingClientRect(): DOMRect {
			try {
				const geom = frameGeom(getFrame());
				if (!geom || !alive()) return GONE;
				return asRect(innerRectToParent({ left: p.x - 1, top: p.y - 1, width: 2, height: 2 }, geom)) as DOMRect;
			} catch {
				return GONE; // a cross-origin or torn-down frame is "nowhere", never a throw
			}
		},
	};
}

/** What the element's line height actually is, for the classifier's units. `normal` computes to
 *  the literal string on some engines, so fall back to the font size rather than to `NaN`. */
function lineHeightOf(el: Element): number {
	const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
	const lh = Number.parseFloat(cs?.lineHeight ?? '');
	if (Number.isFinite(lh) && lh > 0) return lh;
	const fs = Number.parseFloat(cs?.fontSize ?? '');
	return Number.isFinite(fs) && fs > 0 ? fs * 1.35 : 24;
}

const overlapsAny = (b: Box, obstacles: readonly Box[]) => obstacles.some((o) => overlaps(b, o));
const boxOf = (r: DOMRect | { left: number; top: number; width: number; height: number }): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

export type GuideCue = {
	/** The element being named — the identity the BLOCK-change cadence compares on. */
	el: Element;
	kind: Gesture;
	strength: 'quiet' | 'notable';
	/** What Vetrina points at: the element's box in parent coordinates, with the sentence's own
	 *  line rects as `getClientRects()` — the two-rectangles-two-jobs contract. Live on both. */
	target: RectSource;
	/** Where the cursor must end up, when the gesture's own ending would not do. Null means
	 *  "the stroke's own end is fine", which is the common case. */
	rest: RectSource | null;
};

/**
 * The whole cue for one spoken sentence: what to name, how to name it, and where the hand ends.
 *
 * Returns null when nothing on the slide contains the sentence. That is a real state, not an
 * error — a slide narrated by a speaker note says things the slide does not show — and the
 * CALLER must then hide the cursor rather than leave it parked on the last sentence's target.
 *
 * Everything is solved ONCE, here, in the frame's inner coordinates, and mapped out per frame.
 * Not per frame: classifying the shape means measuring the element and the slide, and the
 * inputs cannot change while one sentence is spoken. What moves is the FRAME, and mapping an
 * inner rect out through `frameGeom` picks that up for free — the same reason `frameRectSource`
 * re-measures instead of snapshotting (#1400).
 */
export type GuideDecision = {
	/** The element being named — the identity the BLOCK-change cadence compares on. */
	el: Element;
	kind: Gesture;
	/** Which handle inside the element the ink is on (`anchorFor`). */
	role: AnchorRole;
	strength: 'quiet' | 'notable';
	/** The HANDLE's box in `root`'s coordinates: the cursor's KEEP-OUT. A phrase clears the whole
	 *  block it interrupts; everything else clears only what it named. */
	box: Box;
	/** The range the ink follows — the handle's own words. Null for a MARKER, which has no node
	 *  and no range and is carried as `markerOffset` on the anchor instead. Live where it exists:
	 *  re-measured, never replayed. */
	inkRange: Range | null;
	/** The handle's line rects — one box for a marker. */
	rects: DOMRect[] | null;
	/** A MARKER's box as an offset from its element's, so it can be re-derived live from one
	 *  `getBoundingClientRect()` per frame instead of a computed-style read. Null otherwise. */
	markerOffset: { dx: number; dy: number; width: number; height: number } | null;
	/** Where the hand ends, in `root`'s coordinates. Null = the stroke's own ending will do. */
	rest: { x: number; y: number } | null;
	/** True when the stroke's own ending was occupied and `pointerAnchor` had to be asked. */
	fellBack: boolean;
};

/**
 * THE DECISION — what to name, how to name it, and where the hand ends, entirely in one
 * element's coordinate space. No frames, no scale, no Vetrina.
 *
 * Split out from `guideCueFor` so the corpus sweep can drive the code that SHIPS rather than a
 * re-assembly of it that agrees today and drifts next month. `tools/sweep-guide-gestures.mjs`
 * bundles this module and calls this function per cue over every committed deck.
 *
 * Returns null when nothing under `root` contains the sentence. That is a real state, not an
 * error — a slide narrated by a speaker note says things the slide does not show.
 */
export function guideCueIn(root: Document | Element, text: string, frame: Box, half: number, pad: number = half + 5): GuideDecision | null {
	const block = findCueTarget(root, text);
	if (!block) return null;

	const { el, notable } = aimTarget(block, text);
	// A refined aim is a DIFFERENT element from the one the sentence was found in, so the
	// sentence's rects are not inside it — using them would paint ink outside the thing being
	// named. The deck's own call-out is the target now; the box is the whole cue.
	const range = el === block ? sentenceRange(block, text) : null;
	const t0 = boxOf(el.getBoundingClientRect());
	if (!(t0.width > 0 && t0.height > 0)) return null;

	// THE HANDLE. What the ink actually goes on: the cue's own words when it is a phrase, else the
	// smallest token that stands for the element — its marker, its header, or its text. See
	// § "THE HANDLE" for why a hand names a handle and not the container it sits in.
	const coverage = loose(text).length / Math.max(1, loose(el.textContent ?? '').length);
	const anchor = anchorFor(el, range, coverage);
	const rects = anchor.rects;
	// A marker is one solid box, not a run of line boxes, so it has no text geometry to read; its
	// own measurements ARE the shape. Everything else asks the text where its lines are.
	const geo = anchor.role === 'marker' ? null : textGeometry(anchor.range);

	const kind = chooseGesture({
		// The HANDLE's geometry decides the shape. The element's box (`t0`) survives only as the
		// keep-out for a phrase, where the cursor has to clear the whole block it interrupts.
		box: geo?.box ?? anchor.box,
		// The fallback is a FLOOR, not a ratio: with real line boxes `lines` is a whole number, and
		// a box carrying one line plus padding must not read as one-and-two-thirds of a block.
		lines: geo?.lines ?? (anchor.role === 'marker' ? 1 : Math.max(1, Math.floor(t0.height / lineHeightOf(el)))),
		rects: rects?.map(boxOf) ?? null,
		slideW: frame.width || 1280,
		coverage,
		role: anchor.role,
		// Asked of the ELEMENT, not of the handle: it is the card that already has the border, and
		// it is the card a `bracket` would draw its second outline around.
		enclosed: hasOwnBoundary(el),
	});
	// WHAT THE CURSOR MUST CLEAR. The handle, except for a phrase — resting just past a phrase puts
	// the hand on the words that follow it, so a phrase clears its whole block (the round-two
	// reasoning, unchanged). Everything else clears only what it named, which is what keeps the cue
	// and the cursor in the same ~2 degrees of the viewer's fovea.
	const keepOut = anchor.role === 'phrase' ? t0 : anchor.box;

	// WHERE THE GESTURE WILL LEAVE THE HAND — asked, not re-derived. Geometry alone cannot know
	// what ELSE is near: "past the block's right edge" is the slide margin on a full-width
	// paragraph and the second column on a two-column layout. So one candidate from the stroke,
	// one mechanical check against the slide's own blocks, and `pointerAnchor`'s search only as
	// the fallback for exactly the case it was written for.
	// THE OBSTACLES ARE THE WORDS, NOT THE BOXES. "Do not cover the text" is what the check has
	// always meant, and a block's bounding box is not its text: a card is mostly padding, a
	// timeline stage is mostly the gap above its label. Checking against boxes rejected the margin
	// beside a bullet — the one place a presenter's hand actually goes — and pushed almost every
	// small handle onto the fallback search. Line rects put the check on the ink.
	const obstacles: Box[] = [];
	for (const node of root.querySelectorAll(BLOCK_SELECTOR)) {
		if (!(node.textContent ?? '').trim()) continue;
		const lines = rectsOf(contentRange(node));
		if (lines) for (const r of lines) obstacles.push(boxOf(r));
		else {
			const r = node.getBoundingClientRect();
			if (r.width > 0 && r.height > 0) obstacles.push(boxOf(r));
		}
	}
	// The full rect list, and the library picks the line its own stroke will use — it reads the
	// FIRST for `underline` and the LAST for `wash`. This used to be sliced here to compensate for
	// a library that read the last for both; the compensation lived on the wrong side of the
	// boundary, so the disagreement is fixed in `gestureRest` and the host just asks.
	// A MARKER ENDS ITS GESTURE ON THE OUTSIDE. Every library ending is derived from a stroke over
	// TEXT — down-and-right off a tap, the ring's right edge — and a marker's text is exactly what
	// lies that way: the bullet's own line, or the label under its rail disc. So the hand stands off
	// on the far side, further into the margin the marker already lives in, which is where a
	// presenter's hand goes and what keeps the cue and the cursor inside one fixation.
	const natural =
		anchor.role === 'marker' ? { x: anchor.box.left - pad, y: anchor.box.top + anchor.box.height / 2 } : gestureRest(kind, keepOut, rects?.map(boxOf) ?? null, pad);
	const footprint = (p: { x: number; y: number }): Box => ({ left: p.x - half, top: p.y - half, width: half * 2, height: half * 2 });
	// OFF THE CARD COUNTS AS OCCUPIED. `pointerAnchor` rejects any candidate not inside the frame
	// (a pointer half off the card reads as a bug, not a gesture); the geometry path checked only
	// against BLOCKS, so "past the block's right edge" could run off the slide with nothing there
	// to object. Measured: ten gestures in the corpus came to rest on the Present backdrop.
	// The containment half FAILS OPEN on an unmeasurable frame (a zero-area root, which is what a
	// layout-free host reports): a frame with no area would otherwise veto every geometric rest and
	// silently turn the fallback search back into the only placement mechanism.
	const offCard = frame.width > 0 && frame.height > 0 && !inside(footprint(natural ?? { x: 0, y: 0 }), frame);
	const occupied = !natural || offCard || overlapsAny(footprint(natural), obstacles);
	// `circle`'s orbit ends a quarter turn past wherever the cursor came in from, so it has no
	// deterministic ending of its own — the library reports an advisory one and expects the host
	// to hand it back. Every other kind rides its own stroke's end unless that end is occupied,
	// and passing no rest there is what keeps the withdrawal a single continuous motion.
	// A marker's ending is the HOST's, not the stroke's, so it is always handed back explicitly —
	// same as `circle`, and for the same reason: the library would otherwise apply its own.
	const rest = occupied ? pointerAnchor(keepOut, frame, obstacles, half) : kind === 'circle' || anchor.role === 'marker' ? natural : null;
	return { el, kind, role: anchor.role, strength: notable ? 'notable' : 'quiet', box: keepOut, inkRange: anchor.range, rects, markerOffset: anchor.markerOffset, rest, fellBack: occupied };
}

/** The document behind a preview frame, or null for a frame that is gone or cross-origin. */
const frameDoc = (getFrame: () => HTMLIFrameElement | null): Document | null => {
	try {
		return getFrame()?.contentDocument ?? null;
	} catch {
		return null;
	}
};

/**
 * WHICH element a cue would name — and nothing else.
 *
 * Split out because it reads no layout at all (text matching, a `classList`, a `closest`), while
 * the full decision measures every block on the slide. The cadence asks this question once per
 * SENTENCE and acts on it once per BLOCK, so on the common path — the next sentence of the
 * paragraph already named — Guide now forces no reflow at all.
 *
 * That is not a micro-optimization, it is this feature's own history: an amendment to the
 * narration record is about a progress indicator that saturated the main thread and made audio
 * chop, and the fix there was the same shape — make the expensive thing RARER rather than
 * cheaper. A layout flush per spoken sentence, on the one surface that must not stutter, is the
 * same bill arriving in a different envelope.
 */
export function guideAimFor(getFrame: () => HTMLIFrameElement | null, text: string): Element | null {
	const block = findCueTarget(frameDoc(getFrame), text);
	return block ? aimTarget(block, text).el : null;
}

/**
 * The same decision, wired across the preview-iframe boundary — what Present actually calls.
 *
 * Everything is solved ONCE and mapped out per frame. Not per frame: classifying the shape
 * means measuring the element and the slide, and the inputs cannot change while one sentence is
 * spoken. What moves is the FRAME, and mapping an inner rect out through `frameGeom` picks that
 * up for free — the same reason `frameRectSource` re-measures instead of snapshotting (#1400).
 */
export function guideCueFor(getFrame: () => HTMLIFrameElement | null, text: string): GuideCue | null {
	const doc = frameDoc(getFrame);
	if (!doc) return null;
	const root = doc.documentElement.getBoundingClientRect();
	// THE CURSOR'S KEEP-OUT, in INNER units. Its 28px is PARENT pixels and does not scale with
	// the preview, so the half-extent inside the frame is `half / S` — the one conversion that
	// has to happen for this to clear on the Playground AND cover nothing in the Studio.
	const S = frameGeom(getFrame())?.S || 1;
	// BOTH numbers cross the scale boundary. The cursor's 28px footprint AND the 5px breathing room
	// the library adds are PARENT pixels, so inside the frame they are `/ S` — predicting with a
	// parent-space 5 while the stage applies an inner-space one puts the check a few pixels off
	// on every scaled preview, which is exactly the class of error #1403 wrote `POINTER_BOX` down for.
	const half = POINTER_BOX / 2 / S;
	const cue = guideCueIn(doc, text, { left: root.left, top: root.top, width: root.width, height: root.height }, half, half + 5 / S);
	if (!cue) return null;

	const { el, inkRange, markerOffset, role } = cue;
	const alive = () => el.isConnected;
	// THE HANDLE, RE-MEASURED PER FRAME. A phrase keeps the block as its keep-out (the cursor has
	// to clear the words that follow it); every other handle IS the box, so the cue's ink and the
	// cursor's clearance are the same rectangle and stay one fixation apart.
	//
	// A MARKER has no node to measure, so it rides its element's box plus the offset the classifier
	// solved once. That keeps it live under scroll and reflow — the property `frameRectSource`
	// exists for — without a `getComputedStyle` on every animation frame.
	const innerBox = (): { left: number; top: number; width: number; height: number } | null => {
		const r = el.getBoundingClientRect();
		if (markerOffset) return { left: r.left + markerOffset.dx, top: r.top + markerOffset.dy, width: markerOffset.width, height: markerOffset.height };
		if (role === 'phrase') return r;
		const live = rectsOf(inkRange);
		return live ? hull(live) : r;
	};
	return {
		el,
		kind: cue.kind,
		strength: cue.strength,
		target: {
			getBoundingClientRect(): DOMRect {
				try {
					const geom = frameGeom(getFrame());
					const b = geom && alive() ? innerBox() : null;
					return b ? (asRect(innerRectToParent(b, geom as NonNullable<typeof geom>)) as DOMRect) : GONE;
				} catch {
					return GONE;
				}
			},
			getClientRects(): DOMRect[] {
				try {
					const geom = frameGeom(getFrame());
					if (!geom || !alive()) return [];
					// RE-MEASURED off the range, not replayed from the snapshot the classifier
					// used: the ink tracks its words the way every cue tracks its target (#1400).
					// The snapshot decided WHICH gesture; it does not decide where the words are.
					// A marker has no range — its one box IS its ink, and it moves with its element.
					const live = markerOffset ? [asRect(innerBox() as Box)] : rectsOf(inkRange);
					return (live ?? []).map((r) => asRect(innerRectToParent(r, geom)) as DOMRect);
				} catch {
					return [];
				}
			},
		},
		rest: cue.rest ? innerPoint(getFrame, alive, cue.rest) : null,
	};
}
