import { GUIDE_HANDLES } from '@/components/studio/guide-handles.generated.js';
import { toSpokenText } from '@/lib/cadenza';
import { type Gesture, gestureRest, type RectSource } from '@/lib/vetrina';
import { frameGeom, innerRectToParent } from '@/playground/frame-geom.js';
import { spokenValue } from '@/playground/read-along-core.generated.js';

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
/**
 * WORD-AWARE CONTAINMENT, over a `loose()`-normalized haystack and needle.
 *
 * `loose` strips punctuation but does not tokenize, so a bare `startsWith` / `includes` is a
 * CHARACTER test and every short label becomes a prefix of some word. Both of these were
 * measured on the real corpus, and both are the reverse-containment mistake `findCueTargetIn`
 * already refused, arriving through a different door:
 *
 *   - `data-label="AI"`  led  "Airlines were the worst performer."
 *   - `data-value="8"` -> "eight"  corroborated  "Budget: eighteen."
 *   - `data-value="N/A"` -> "na"   corroborated  "Budget analysis pending." — a mark declaring
 *     N/A corroborated practically any cue.
 *
 * A boundary is the string's edge or a space, which is all `loose` leaves between words.
 */
function boundedAt(hay: string, sub: string, at: number): boolean {
	if (at < 0) return false;
	const before = at === 0 || hay[at - 1] === ' ';
	const end = at + sub.length;
	return before && (end === hay.length || hay[end] === ' ');
}

/** Does `hay` contain `sub` as whole words, anywhere? */
function containsWord(hay: string, sub: string): boolean {
	for (let at = hay.indexOf(sub); at !== -1; at = hay.indexOf(sub, at + 1)) if (boundedAt(hay, sub, at)) return true;
	return false;
}

/** Does `hay` OPEN with `sub` as whole words? */
function leadsWord(hay: string, sub: string): boolean {
	return !!sub && hay.startsWith(sub) && boundedAt(hay, sub, 0);
}


const BLOCK_SELECTOR = 'p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, th, td, code';

/**
 * The element inside `frameDoc` that a spoken sentence came from, or null.
 *
 * Smallest-containing-block first; a cue that no single block contains is then matched piecewise
 * (`findSpanningTarget`), which is how a label joined to its body finds the thing it names.
 */
export function findCueTarget(frameDoc: Document | Element | null, text: string): Element | null {
	const found =
		findCueTargetIn(frameDoc, text) ??
		findSpanningTarget(frameDoc, text) ??
		findMarkTarget(frameDoc, text) ??
		findNamedTarget(frameDoc, text) ??
		findDetailTarget(frameDoc, text) ??
		findChartTextTarget(frameDoc, text) ??
		findParaphraseTarget(frameDoc, text) ??
		findValueLedMark(frameDoc, text) ??
		findFigureTarget(frameDoc, text);
	return found ? drawnTwin(found) : null;
}

/**
 * A mark that is not drawn hands off to the one that is.
 *
 * A chart may measure in HTML and paint in SVG. state-chart does (#2355): its `<li class="state-node">`
 * list is the measuring column, set to `display: none` once the runtime has drawn each state as an
 * SVG `<rect class="state-node-shape">`. Every tier still finds the `<li>` — it carries the name, the
 * `data-label` and the manifest handle — but a hidden element has no box, so the pointer had nowhere
 * to go and hid: 77 of 144 cues on the state-chart gallery, every "From Draft, …" among them.
 *
 * The two are the same mark, and the transform says so: both carry one `data-mark`. So a target
 * inside a `display: none` subtree resolves to the first element in the same chart with that
 * `data-mark` that IS rendered. Nothing changes for a visible target, or for a hidden one with no
 * drawn twin.
 */
function drawnTwin(el: Element): Element {
	if (!inHiddenSubtree(el)) return el;
	const mark = el.getAttribute('data-mark');
	const chart = el.closest('.chart-body, section');
	if (mark == null || !chart) return el;
	for (const twin of chart.querySelectorAll('[data-mark]')) {
		if (twin !== el && twin.getAttribute('data-mark') === mark && !inHiddenSubtree(twin)) return twin;
	}
	return el;
}

/** Is this element, or an ancestor inside its section, `display: none`? */
function inHiddenSubtree(el: Element): boolean {
	// A parsed document (DOMParser) has no window of its own; the host's computes its style.
	const view = el.ownerDocument?.defaultView ?? (typeof window !== 'undefined' ? window : null);
	if (!view) return false;
	for (let n: Element | null = el; n && n.tagName !== 'SECTION'; n = n.parentElement) {
		if (view.getComputedStyle(n).display === 'none') return true;
	}
	return false;
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
		// Screen-reader-only text paints nothing, so it is never a place to point: a chart's
		// hidden data table (`buildSrDataTable`) is all `th`/`td`, which this selector lists.
		if (el.closest('.chart-sr-only')) continue;
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

/**
 * THE MARK TIER — a cue that no TEXT on the slide can answer, because the words are not there.
 *
 * `chart-narration.js` BUILDS a chart's speech from its data model rather than reading it off the
 * slide, and it spells numbers: a funnel band rendered as `Visitors` + `12,000` narrates as
 * "Visitors: twelve thousand." Neither the block matcher nor the piecewise one can find that —
 * "twelve thousand" is nowhere in the document — so 85% of that deck's cues resolved to nothing
 * and the pointer hid. Measured across the corpus, `funnel` resolved 15.8% of its cues.
 *
 * But the element is not hiding. The transform stamps its own marks with what they mean:
 *
 *     <polygon class="funnel-band" data-label="Visitors" data-value="12,000">
 *
 * So this tier matches a cue against the DOM's own DECLARED identity instead of its text. Two
 * things keep that from becoming the reverse-containment mistake `findCueTargetIn` already
 * refused (which bought reach by pointing at the wrong element 639 times):
 *
 *   - THE LABEL MUST LEAD, as WHOLE WORDS. The projection emits "<label>: <value>", so the label
 *     opens the sentence. A label that merely recurs later in a cue is not what the cue is about.
 *     The word boundary is not decoration: a character prefix let `data-label="AI"` lead
 *     "Airlines were the worst performer."
 *   - THE VALUE CORROBORATES when the mark declares one, through the SAME function that produced
 *     the cue's wording. `toSpokenText('12,000')` is `twelve thousand` because that is literally
 *     the call `chart-narration.js` makes. Whole words again, or `data-value="8"` corroborates
 *     "eighteen" and `N/A` corroborates any cue containing "analysis".
 *
 * WHAT THE SECOND GUARD DOES NOT COVER, stated because an earlier draft of this comment claimed
 * it did: a mark with a `data-label` and NO `data-value` has nothing to corroborate, and rests on
 * the lead rule alone. 16% of the corpus's marks are that shape — `scatter`, `quadrant` and
 * `slope` emit labels without values by construction. For them the word-boundary lead and the
 * ambiguity refusal are the whole defense, which is why the lead rule is strict rather than a
 * prefix test.
 *
 * Ambiguity resolves to NOTHING, not to a guess: two marks that both pass is the one case where
 * this tier could point somewhere wrong, and hiding is what the feature already does when it
 * cannot place a cue.
 *
 * Runs LAST, so it only ever answers cues the existing two tiers dropped. It cannot change an
 * existing resolution, which is what makes its effect measurable as a pure addition.
 */
export function findMarkTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const needle = loose(text);
	// The same floor `findCueTargetIn` carries, and for the same reason: a needle of pure
	// separators matches whatever holds as many of them, which is not a match.
	if (needle.length < 3 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	const passed: { el: Element; labelLen: number; corroborated: boolean }[] = [];
	for (const el of root.querySelectorAll('[data-label]')) {
		const rawLabel = (el as HTMLElement).dataset?.label ?? el.getAttribute('data-label') ?? '';
		// A region CODE (`GA`, `USA`) is spoken spelled, "G A" (`narrateDataSeries` spells it so the
		// read-aloud lexicon cannot expand it), so the code leads in that form too.
		const spelled = /^[A-Z]{2,3}$/.test(rawLabel.trim()) ? loose(rawLabel.trim().split('').join(' ')) : '';
		const label = spelled && leadsWord(needle, spelled) ? spelled : loose(rawLabel);
		// A COMPOUND label names a crossing: a heatmap cell is `Jan 2026 · M3`, and its sentence
		// reads "Jan 2026 is lowest at M3, forty-four." — the row leads and the column follows. It
		// counts when its first part leads and every other part appears as a whole word; its length
		// is every part's, so the cell outranks the bare row label `Jan 2026` that also leads.
		// Measured before: every heatmap cue landed on its row label, never on a cell.
		const parts = rawLabel.includes(' · ') ? rawLabel.split(' · ').map(loose).filter((x) => x.length >= 2) : [];
		const compound = parts.length > 1 && leadsWord(needle, parts[0]) && parts.slice(1).every((x) => containsWord(needle, x));
		// A one-character label identifies nothing and would lead half the cues on the slide.
		if (!compound && (label.length < 2 || !leadsWord(needle, label))) continue;
		const raw = (el as HTMLElement).dataset?.value ?? el.getAttribute('data-value') ?? '';
		let corroborated = false;
		if (raw) {
			corroborated = corroborates(needle, raw);
			// A mark that declares a value the cue never says, in either spelling, is not this cue's.
			if (!corroborated) continue;
		}
		passed.push({ el, labelLen: compound ? parts.join(' ').length : label.length, corroborated });
	}
	if (!passed.length) return null;
	// THE LONGER LABEL WINS FIRST, and corroboration only breaks its ties. Ranking corroboration
	// above specificity let a short, wrong, value-bearing mark beat the exact one: `Rev` (value 40)
	// outranked `Revenue growth` on "Revenue growth: forty million dollars." Length is the better
	// signal because every candidate is already a word-leading prefix of the same sentence, so the
	// longest one is the most of the sentence any mark accounts for.
	passed.sort((a, b) => b.labelLen - a.labelLen || Number(b.corroborated) - Number(a.corroborated));
	const [top, next] = passed;
	// Equal length means IDENTICAL label text — every candidate leads the same needle — so this
	// two-element check is complete for the label dimension rather than a shortcut.
	if (next && next.labelLen === top.labelLen && next.corroborated === top.corroborated) {
		const tied = passed.filter((p) => p.labelLen === top.labelLen && p.corroborated === top.corroborated);
		// A GROUP answers for its members. A grouped bar's sentence names the CATEGORY —
		// "Americas: Plan, three point two; Actual, three point nine." — and both of its bars
		// lead with "Americas" and corroborate, so they tie as two different marks. The one
		// element that sentence is about is the category itself: the axis label carrying the same
		// name and no value of its own. Taken only when it is UNIQUE; otherwise nothing, as ever.
		const group = passed.filter((p) => p.labelLen === top.labelLen && !p.corroborated && !p.el.hasAttribute('data-value'));
		const one = oneMark(tied.map((p) => p.el)) ?? (group.length === 1 ? group[0].el : null);
		if (!one) return null;
		markHit += 1;
		return one;
	}
	markHit += 1;
	return top.el;
}

/**
 * Does the cue SAY the mark's declared value, in any spelling a producer uses for it?
 *
 * THREE spellings, because three producers say a value and each spells it its own way:
 *   - as typed (`data-value="92%"` is also what a caption may display verbatim);
 *   - through `toSpokenText`, Cadenza's normalizer (`12,000` → "twelve thousand");
 *   - through `spokenValue`, which is how `chart-narration.js` SAYS a chart pill — by its value,
 *     magnitude applied (`$0.6M` → "six hundred thousand dollars", `−0.3M` → "down three hundred
 *     thousand"). Before it was here, the check only knew the second spelling, so it REJECTED the
 *     right bar on every sub-unit or signed value: LATAM's `$0.6M` never matched "LATAM, six
 *     hundred thousand dollars", and a waterfall's negative steps hid the pointer.
 *
 * A RANGE is confirmed when BOTH ends are said. Two charts declare one: gantt's drawn span
 * (`Q1–Q2`, said "Q1 to Q2") and slope's before/after (`31% to 24%`, said "2023, thirty-one
 * percent; 2026, twenty-four percent" — the years sit between the two numbers, so the range was
 * never a contiguous phrase and every slope cue failed the check it was built to pass).
 */
function corroborates(needle: string, raw: string): boolean {
	if (valueSpellings(raw).some((v) => saysValue(needle, v))) return true;
	const ends = raw.split(/\s*(?:[–—]|\.\.|\bto\b)\s*/).filter((p) => p.trim());
	return ends.length > 1 && ends.every((end) => valueSpellings(end).some((v) => saysValue(needle, v)));
}

/**
 * A spoken value is said only when it is the WHOLE number, not the head of a longer one. "four"
 * is a whole word inside "four point three" and inside "four hundred", so a whole-word test alone
 * let a line's `4.0` dot corroborate the Mid-market sentence "Q1 2026, four point three." — two
 * dots tied and the pointer fell back to the axis label (found by the round-two checker).
 */
const CONTINUES_NUMBER = /^ (?:point|hundred|thousand|million|billion|trillion)\b/;
function saysValue(hay: string, sub: string): boolean {
	if (!sub) return false;
	for (let at = hay.indexOf(sub); at !== -1; at = hay.indexOf(sub, at + 1)) {
		if (boundedAt(hay, sub, at) && !CONTINUES_NUMBER.test(hay.slice(at + sub.length))) return true;
	}
	return false;
}

function valueSpellings(raw: string): string[] {
	const forms = new Set<string>();
	for (const speak of [(r: string) => r, (r: string) => toSpokenText(r), (r: string) => spokenValue(r, toSpokenText)]) {
		try {
			const v = loose(speak(raw));
			if (v) forms.add(v);
		} catch {
			/* a speller that throws on this token simply offers no spelling */
		}
	}
	return [...forms];
}

/**
 * Several marks that tie are still ONE thing when they are one mark drawn in pieces.
 *
 * A map's highlight group is the case that forced this: `ASEAN` is ten country outlines, each
 * stamped `data-mark="1" data-label="ASEAN"`, so every ASEAN cue tied ten ways and the tie rule —
 * rightly, for two DIFFERENT marks with one label — hid the pointer. Pieces of one mark share its
 * `data-mark` inside one chart; that is the transform saying they are the same thing. Point at
 * the largest piece, which is where a presenter's hand would go.
 *
 * Anything else — different marks, or no `data-mark` to prove sameness — is a real ambiguity
 * and still resolves to nothing.
 */
function oneMark(els: Element[]): Element | null {
	const mark = els[0]?.getAttribute('data-mark');
	const chart = els[0]?.closest('svg, .chart-body');
	if (mark == null || !els.every((e) => e.getAttribute('data-mark') === mark && e.closest('svg, .chart-body') === chart)) return null;
	let best = els[0];
	let bestArea = -1;
	for (const e of els) {
		const r = e.getBoundingClientRect?.();
		const area = r ? r.width * r.height : 0;
		if (area > bestArea) {
			best = e;
			bestArea = area;
		}
	}
	return best;
}

/**
 * THE VALUE-LED MARK — a sentence that opens with a number and names the mark after it.
 *
 * A presenter reads a funnel from its numbers: "870 reached a proposal, and 214 signed." The mark
 * tier needs a LABEL to lead, and none does; the paraphrase tier finds two bands that each have a
 * word and a value in the sentence, ties, and gives up; so the cue fell to the whole figure. But the
 * sentence is plainly about the band whose value it OPENS with, as a pointing hand would be.
 *
 * Taken only when all three hold, and only for a cue every other tier dropped (it runs just before
 * the whole figure, so it cannot change an answer that already existed):
 *   - the sentence OPENS with the mark's declared value as TYPED DIGITS, decimal point and all,
 *     read from the raw text (`loose` drops the point, and "1.2" would then lead "12 months");
 *     a value with no digit (a state, a category) never qualifies;
 *   - the sentence shares a content word with the mark's label, compared the way the paraphrase
 *     tier compares (`contentKeys`: suffixes stripped, five-letter keys), so "Proposal sent" is
 *     named by "proposal" and "Signed" by "signed", but not by "sentence" or "significant";
 *   - exactly one mark passes both, or the passing pieces are one mark drawn in pieces (`oneMark`).
 */
const LEADING_NUMBER = /^\s*([$€£¥]?[-−]?\p{N}[\p{N},.]*)/u;
const digitsOf = (s: string): string => s.replace(/[\s,$€£¥]/g, '').replace(/−/g, '-').replace(/[.]$/, '');
export function findValueLedMark(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const lead = LEADING_NUMBER.exec(text)?.[1];
	if (!lead) return null;
	const said = digitsOf(lead);
	const cue = contentKeys(text);
	const hits: Element[] = [];
	for (const el of root.querySelectorAll('[data-label][data-value]')) {
		const raw = (el as HTMLElement).dataset?.value ?? el.getAttribute('data-value') ?? '';
		if (!/\p{N}/u.test(raw) || digitsOf(raw) !== said) continue;
		const label = contentKeys((el as HTMLElement).dataset?.label ?? el.getAttribute('data-label') ?? '');
		if (![...label.keys()].some((k) => k.length >= 4 && !/\p{N}/u.test(k) && cue.has(k))) continue;
		hits.push(el);
	}
	const one = hits.length === 1 ? hits[0] : hits.length > 1 ? oneMark(hits) : null;
	if (one) valueLedHit += 1;
	return one;
}

/** Did the value-led tier answer the last cue? Its own counter, like every tier's: the sweep must
 *  tell its hits apart from the mark tier's to measure it. */
export let valueLedHit = 0;
export function resetValueLedHit(): number {
	const n = valueLedHit;
	valueLedHit = 0;
	return n;
}

/**
 * THE DECLARED-PART TIER — a cue whose sentence is on the slide, in a token nothing can find.
 *
 * `findCueTargetIn` searches `BLOCK_SELECTOR`, one hardcoded element list for every component.
 * A transform that renders its parts as spans is invisible to it: team-profile's roster is
 * `<li class="person">` holding a photo and three `<span>`s, so "Marcus Vale, Program Director:
 * Runs the weekly cadence." matched no block, no piecewise part and no `data-label`, and the
 * pointer hid — 47 of 86 cues on the component's own gallery.
 *
 * The manifest is where that anatomy is already written down, so this tier asks it: a component
 * declares `handles: [{ part, names }]`, and a cue LED by a part's own name resolves to that
 * part. `tools/build-guide-handles.js` projects the declarations into
 * `guide-handles.generated.ts`; the Guide reads a generated catalog rather than holding one,
 * which is the same arrangement `density.domSelector` already has with the Fix-Me overlay.
 *
 * ONE GUARD, AND IT IS THE MARK TIER'S. The name must LEAD the sentence as WHOLE WORDS. The
 * projection emits "<name>: <body>" or "<name>, <role>: <body>", so the name opens the sentence;
 * a name that merely recurs later is not what the cue is about, and a character prefix would let
 * a person called `Al` lead "Already shipped." There is no second guard here: unlike a chart mark
 * this token declares no value to corroborate, so the lead rule and the ambiguity refusal are the
 * whole defense — which is why the lead is strict and the longest name wins.
 *
 * Ambiguity resolves to NOTHING. Two parts whose names both lead the cue is the one case this
 * tier could point somewhere wrong, and hiding is what the feature already does when it cannot
 * place a cue.
 *
 * Runs LAST, after the mark tier, so it only ever answers cues every existing tier dropped. It
 * cannot change an existing resolution, which is what makes its effect measurable as a pure
 * addition rather than a trade.
 */
export function findNamedTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const needle = loose(text);
	// The same floor the other tiers carry: a needle of pure separators matches whatever holds as
	// many of them, which is not a match.
	if (needle.length < 3 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	const passed: { el: Element; nameLen: number }[] = [];
	for (const row of GUIDE_HANDLES) {
		for (const part of root.querySelectorAll(row.part)) {
			const name = loose(part.querySelector(row.names)?.textContent ?? '');
			// A one-character name identifies nothing and would lead half the cues on the slide.
			// OR LEADS AFTER "from". A transition is said from its source — "From Approved, publish
			// goes to Published." (`narrateStateTransitions`) — so the state it names is the second
			// word, not the first. Only here, not in the mark tier: a mark there may declare a value
			// the sentence never says (a state's status), and would be rejected anyway.
			if (name.length < 2 || !(leadsWord(needle, name) || leadsWord(needle, `from ${name}`))) continue;
			passed.push({ el: part, nameLen: name.length });
		}
	}
	if (!passed.length) return null;
	// THE LONGER NAME WINS. Every candidate already leads the same sentence, so the longest is the
	// most of it any declared part accounts for — "Ada Okafor" over an "Ada" elsewhere on the slide.
	passed.sort((a, b) => b.nameLen - a.nameLen);
	const [top, next] = passed;
	// Equal length means the names are the same text (both lead the same needle), so checking the
	// runner-up alone is complete rather than a shortcut — the same argument as the mark tier's.
	if (next && next.nameLen === top.nameLen) return null;
	partHit += 1;
	return top.el;
}

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
	// WHERE THE CLIMB STOPS, structurally as well as by size. `node !== root` looked like the stop
	// and was inert: `root` is a Document on the shipping path and `node` is always an Element, so
	// the comparison could never be true and the only bound left was the size budget — which a
	// SPARSE slide passes. Measured in a real Chromium: a slide holding one heading and one
	// paragraph resolved to the `<section>` itself, and the cue underlined 1152px of slide. The
	// CHANGELOG's "can never climb to the slide" was false as written.
	while (node && !STOP_CLIMB.has(node.tagName) && node !== root) {
		const hay = loose(node.textContent ?? '');
		// The bound is what stops "widen until something matches" from walking to the slide: a
		// container holding several times the cue is the GROUP the thing is in, and pointing at the
		// group is the failure this feature already refused once (§findCueTarget).
		if (hay.length > budget) break;
		if (pieces.every((p) => hay.includes(p))) return node;
		node = node.parentElement;
	}
	// THE PARTIAL ANSWER — bounded, and counted rather than trusted.
	//
	// Round two measured that buying reach by relaxing the matcher produced 639 hits on an element
	// holding less than half the spoken sentence, and refused the change on that ground. This branch
	// relaxes the matcher, so it owes the same test. Restoring the measurement (the sweep reports
	// both numbers below) said the climb finds a real container for only a small share of joined
	// cues; the rest land on `longest`, which by construction does NOT hold the whole sentence.
	//
	// That is tolerable exactly as far as the part it DID match is most of what is being said. Below
	// that the honest answer is the one this feature already gives when it cannot place a cue: hide.
	// A cursor on a block carrying a fifth of the sentence is the failure #1403 set the bar against,
	// and "it used to hide" is not a license to point somewhere worse than hiding.
	const share = hits.reduce((a, b) => (b.len > a.len ? b : a)).len / Math.max(1, loose(text).length);
	spanPartial += 1;
	return share >= LONGEST_SHARE ? longest : null;
}

/** How much of the spoken sentence the matched part has to carry before a partial answer beats no
 *  answer. Set from the corpus sweep's own ratio distribution, not from taste. */
const LONGEST_SHARE = 0.5;

/** How many spanning matches fell back to the longest single part instead of finding a container
 *  that holds the whole cue — the honesty counter for this branch's reach gain. Read and reset by
 *  the corpus sweep; nothing in the product reads it. */
export let spanPartial = 0;
export const resetSpanPartial = (): number => {
	const n = spanPartial;
	spanPartial = 0;
	return n;
};

/**
 * Did the MARK tier answer the last cue? The same shape as `spanPartial`, for the same reason.
 *
 * The corpus sweep derives "matched piecewise" from the ABSENCE of a containing block, which was
 * a sound proxy while `findSpanningTarget` was the only tier that could answer such a cue. It is
 * not one now: every mark-tier hit has no containing block either, so without this counter all of
 * them are booked to the piecewise row — inflating it, and driving its "how much of the cue does
 * the resolved element hold" ratio to zero, because a `<polygon>` has no text at all. That ratio
 * is round two's wrong-element cross-check, and a branch that relaxes the matcher owes it rather
 * than quietly voiding it.
 */
export let markHit = 0;
export const resetMarkHit = (): number => {
	const n = markHit;
	markHit = 0;
	return n;
};

/**
 * Did the DECLARED-PART tier answer the last cue? Same shape and same reason as `markHit`.
 *
 * Without it every declared-part hit is booked to the piecewise row — it has no containing block
 * either — which is the exact mis-attribution the mark tier already had to fix once (§7 of the
 * gesture audit). A tier that cannot be told apart in the instrument cannot be measured, and an
 * addition nobody can measure is indistinguishable from a trade.
 */
export let partHit = 0;
export const resetPartHit = (): number => {
	const n = partHit;
	partHit = 0;
	return n;
};

// ── Three tiers for a CHART slide, run after every other tier has declined ─────────────────
//
// Measured before they existed, over the 22 chart galleries (`sweep-guide-gestures.mjs --deck
// … --misses`): the pointer hid on 49% of chart cues, and the misses fell into three shapes no
// earlier tier can answer. Each tier below is one of them, and each is narrow on purpose: it
// only ever answers a cue the rest dropped, so it adds reach without moving an existing target.

/**
 * THE DETAIL TIER — a mark's reveal note, spoken as its own sentence.
 *
 * A chart mark may carry a nested detail bullet (mark-detail.js): the hover popover on screen, a
 * speaker note in the PDF, and — because narration speaks what the slide authors — a sentence of
 * its own after the mark's reading. "Two enterprise renewals landed in Q4." is that sentence. The
 * text sits only in an inert `<template class="chart-detail" data-mark="i">`, which renders
 * nothing, so no block matched it and the pointer hid mid-bar. The template names its mark, so
 * the answer is the mark it belongs to.
 */
export function findDetailTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const needle = loose(text);
	if (needle.length < 8 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	for (const tpl of root.querySelectorAll('template.chart-detail[data-mark]')) {
		const content = (tpl as HTMLTemplateElement).content;
		const items = content ? [...content.querySelectorAll('li')] : [];
		const texts = items.length ? items.map((li) => li.textContent ?? '') : [content?.textContent ?? ''];
		// Most of the note, not a word of it: a short cue that merely APPEARS in a note ("Enterprise.")
		// is not that note being read. Half is the floor because Cadenza may split a long note into
		// two sentences, and each half must still find its mark.
		if (!texts.some((t) => {
			const hay = loose(t);
			return hay.includes(needle) && needle.length * 2 >= hay.length;
		})) continue;
		const chart = tpl.closest('.chart-body') ?? tpl.parentElement?.parentElement ?? root;
		const mark = tpl.getAttribute('data-mark');
		const el =
			chart.querySelector(`[data-mark="${mark}"][data-label]:not(template)`) ??
			chart.querySelector(`[data-mark="${mark}"]:not(template)`);
		if (el) {
			figureHit += 1;
			return el;
		}
	}
	return null;
}

/**
 * THE CHART-TEXT TIER — words that ARE on the chart, in an element `BLOCK_SELECTOR` does not list.
 *
 * A flow chart draws its text in `<div>`s (a progress note, a kanban card body, a timeline
 * milestone's body line) and an SVG chart draws it in `<text>`. `BLOCK_SELECTOR` deliberately
 * lists only prose blocks — widening it to `div` would make every layout wrapper on every slide a
 * candidate. So this looks INSIDE `.chart-body` only, with the same one-way containment and the
 * same smallest-wins rule `findCueTargetIn` uses, skipping anything that is not painted (the
 * inert detail payload, screen-reader-only text, a hidden description).
 */
export function findChartTextTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const needle = loose(text);
	if (needle.length < 8 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	// SPACES OUT OF BOTH SIDES. A chart draws a phrase as sibling spans — roadmap's card head is
	// `Phase 01` · `Horizon 1` · `Now` — and `textContent` welds them ("Phase 01Horizon 1Now")
	// while the narration, built by a walker that separates element siblings, says them spaced.
	// Scoped to the chart body and to a needle of eight or more characters, so the looser test
	// cannot reach prose.
	const tight = needle.replace(/ /g, '');
	let best: Element | null = null;
	let bestLen = Number.POSITIVE_INFINITY;
	for (const body of root.querySelectorAll('.chart-body')) {
		for (const el of body.querySelectorAll('*')) {
			if (el.closest(UNPAINTED)) continue;
			// PAINTED text only, all the way down: an `<svg>`'s `textContent` includes its `<desc>`,
			// so without this a cue that is a substring of the description resolved to the svg.
			const hay = loose(paintedText(el)).replace(/ /g, '');
			if (!hay.includes(tight)) continue;
			if (hay.length < bestLen || (hay.length === bestLen && (best as Element | null)?.contains(el))) {
				best = el;
				bestLen = hay.length;
			}
		}
	}
	if (best) figureHit += 1;
	return best;
}

/** Chart text nothing paints: the inert detail payload, screen-reader-only text, descriptions. */
const UNPAINTED = 'template, [hidden], .chart-sr-only, [data-lattice-desc], title, desc';

/** An element's text, less every descendant `UNPAINTED` names. */
function paintedText(el: Element): string {
	let out = '';
	for (const node of el.childNodes) {
		if (node.nodeType === 3) out += node.nodeValue ?? '';
		else if (node.nodeType === 1 && !(node as Element).matches(UNPAINTED)) out += paintedText(node as Element);
	}
	return out;
}

/**
 * THE FIGURE TIER — a sentence about the WHOLE chart.
 *
 * A chart narrator speaks sentences that belong to no single mark: its frame ("Each bar's length
 * is its value, measured from zero."), an axis ("The horizontal axis, Effort, runs zero to ten."),
 * a computed summary ("Three of seven cleared the plan line."). None of them is on the slide as
 * text — they are the narrator explaining the picture — so no tier found them and the pointer
 * hid at exactly the moment the voice said "look at this chart". The chart itself is the honest
 * target, and it is the one element on the slide that every such sentence is about.
 *
 * LAST, so it cannot take a cue from any tier above. It is scoped to a slide that HAS a chart
 * body; on any other slide a cue nothing matched still hides, as before.
 */
export function findFigureTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const needle = loose(text);
	if (needle.length < 3 || !/[\p{L}\p{N}]/u.test(needle)) return null;
	// EXACTLY ONE chart in scope. This tier accepts any sentence, so it must not guess between
	// charts: a root holding several slides (the console path hands over a whole document) or a
	// slide with two charts has no single "the chart", and the cue hides as it did before.
	const bodies = root.querySelectorAll('.chart-body');
	if (bodies.length !== 1) return null;
	figureHit += 1;
	return bodies[0];
}

// ── THE PARAPHRASE TIER — an authored caption that SAYS the slide in other words ──────────────
//
// A `<!-- caption: -->` is written to be heard, and the slide is written to be read, so the two
// rarely share a sentence. "First, we announce to customers in November with twelve months'
// notice." narrates the list item "Announce — November, with twelve months' notice to every SMB
// account." No block CONTAINS the cue, so every tier above returned null and the pointer hid —
// on the Q3 board fixture, 26 of 63 cues, including every sentence of five whole slides
// (`followups.d/2363-p3-studio-component-gestures.md`).
//
// The cue and the item share the words that carry the meaning: announce, November, twelve,
// months, notice. So this tier scores each block by the CONTENT words it shares with the cue and
// names the best one. It runs after every exact tier, so it can only answer cues they dropped,
// and it refuses to guess in the three places a guess would point somewhere wrong:
//
//   - TOO LITTLE SHARED. At least two content words, at least a third of the cue's own. "We did
//     look hard at the fix." shares one word with "Why not fix it" and resolves to nothing.
//   - A TIE BETWEEN STRANGERS. Two unrelated blocks with the same best score is a coin toss, so
//     it hides. A tie between a block and one nested inside it names the inner one, the same
//     smallest-wins rule `findCueTargetIn` uses.
//   - MORE THAN ONE SLIDE IN SCOPE. The frame path can hand over a whole document. Content words
//     recur across a deck, so the tier narrows to the one slide that is showing, or gives up.

/** Words that carry no identity. English only; on another language the list is inert and the
 *  two-word and one-third floors do the work alone. */
const PARAPHRASE_STOP = new Set(
	('a an and are as at be but by did do does for from had has have he her his i if in into is it its '
		+ 'just me more most my no not of on or our so than that the their them then there these they '
		+ 'this those to too up us was we were what when where which who why will with would you your '
		+ 'one all any each every can could should here now very also about over out off only same '
		+ 'first second third fourth fifth next last get got take took make made put keep keeps say said '
		+ 'dollar dollars percent').split(' '),
);

/** Number words to digits, so "twelve months" and "12 months" share a word. Compound and large
 *  numbers are left alone: the tier needs agreement, not arithmetic. */
const NUMBER_WORDS: Record<string, string> = Object.fromEntries(
	('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen '
		+ 'sixteen seventeen eighteen nineteen twenty').split(' ').map((w, i) => [w, String(i)]),
);
for (const [w, n] of [['thirty', 30], ['forty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70], ['eighty', 80], ['ninety', 90]] as const) NUMBER_WORDS[w] = String(n);

/**
 * Fold a SPELLED amount into the key its digits make. An authored caption is written to be heard,
 * so it says "forty-eight point six million" where the slide says `$48.6M`, and "eight hundred
 * seventy" where it says `870`. `loose` reduces `$48.6M` to `486m` and `12,400` to `12400`, so a
 * spoken run is reduced the same way: "forty eight point six million" → `486m`, "twelve thousand
 * four hundred" → `12400`. Measured on a test deck: without this, a funnel narrated in words never
 * reached a single stage, and a KPI line lost its gesture to a plain one.
 */
function spelledAmounts(words: readonly string[]): string[] {
	const out: string[] = [];
	const num = (w: string | undefined) => (w !== undefined && w in NUMBER_WORDS ? Number(NUMBER_WORDS[w]) : Number.NaN);
	for (let i = 0; i < words.length; ) {
		if (Number.isNaN(num(words[i]))) {
			out.push(words[i]);
			i += 1;
			continue;
		}
		let total = 0;
		let cur = 0;
		let dec = '';
		let suffix = '';
		let j = i;
		let parts = 0;
		for (; j < words.length; j++) {
			const w = words[j];
			const n = num(w);
			if (dec === '' && !Number.isNaN(n)) cur += n;
			else if (dec !== '' && !Number.isNaN(n) && n < 10) dec += String(n);
			else if (w === 'point' && dec === '' && num(words[j + 1]) < 10) dec = '.';
			else if (w === 'hundred') cur *= 100;
			else if (w === 'thousand') {
				total += cur * 1000;
				cur = 0;
			} else if (w === 'million' || w === 'billion') {
				suffix = w[0];
				j += 1;
				parts += 1;
				break;
			} else break;
			parts += 1;
		}
		const value = total + cur;
		// A lone "one" is an article more often than an amount ("one segment needs a decision").
		if (parts === 1 && value === 1) out.push('one');
		else out.push(`${value}${dec.replace('.', '')}${suffix}`);
		i = j;
	}
	return out;
}

/** Suffixes stripped before the five-letter key, longest first, so "exiting" meets "exit" and
 *  "recommendation" meets "recommend". Crude on purpose: two spellings of one word only have to
 *  agree with each other, not with a dictionary. */
const SUFFIXES = ['ation', 'ing', 'ion', 'ed', 'es', 's', 'e'];

/**
 * The content words of a string, each reduced to a key two spellings of one word share: digits
 * for number words, a stripped suffix, then the first five letters, so "migration" and "migrate"
 * or "sellers" and "seller" agree. A token carrying a digit is kept whole and, from two
 * characters up, weighs double: "$2.1M" or "640" names one thing on a slide far more surely than
 * a common word does.
 */
function contentKeys(s: string): Map<string, number> {
	const keys = new Map<string, number>();
	const words = loose(s)
		.split(/[\s-]+/)
		.map((raw) => raw.replace(/^'+|'+$/g, '').replace(/'s$/, ''));
	for (const token of spelledAmounts(words)) {
		let w = token;
		if (!w || PARAPHRASE_STOP.has(w)) continue;
		w = NUMBER_WORDS[w] ?? w;
		if (/\p{N}/u.test(w)) {
			keys.set(w, w.length > 1 ? 2 : 1);
			continue;
		}
		if (w.length < 3) continue;
		for (const suf of SUFFIXES) {
			if (w.length - suf.length >= 3 && w.endsWith(suf) && !(suf === 's' && w.endsWith('ss'))) {
				w = w.slice(0, -suf.length);
				break;
			}
		}
		keys.set(w.length > 5 ? w.slice(0, 5) : w, 1);
	}
	return keys;
}

/** Shared weight a block needs: two words, or one number of two digits or more. */
const PARAPHRASE_MIN_SHARED = 2;

/** A picture a sentence can be about without naming a block: a chart, a diagram, an image. */
const FIGURE_SELECTOR = '.chart-body, .mermaid, pre.language-mermaid, figure, img:not(.deck-logo)';
const PARAPHRASE_MIN_COVERAGE = 1 / 3;

/** The one slide a paraphrase may match inside, or null when that is not knowable. */
function paraphraseScope(root: Document | Element): Element | null {
	if ((root as Element).tagName === 'SECTION') return root as Element;
	const secs = [...root.querySelectorAll('section')].filter((s) => !s.parentElement?.closest('section'));
	if (secs.length === 1) return secs[0];
	const view = (root as Document).defaultView ?? root.ownerDocument?.defaultView ?? null;
	if (!view) return null;
	const shown = secs.filter((s) => {
		const cs = view.getComputedStyle(s);
		return cs.display !== 'none' && cs.visibility !== 'hidden';
	});
	return shown.length === 1 ? shown[0] : null;
}

/** What a candidate says: a block's painted text, or a chart mark's declared name and value
 *  (a funnel band is a `<polygon>` with no text, and "We generated 12,400 qualified leads"
 *  names it through `data-label="Qualified leads" data-value="12,400"`). */
function candidateText(el: Element): string {
	if (el.matches(BLOCK_SELECTOR)) return el.textContent ?? '';
	return `${el.getAttribute('data-label') ?? ''} ${el.getAttribute('data-value') ?? ''}`;
}

/** Does the sentence corroborate a mark's declared value? True when it says no number at all. */
function valueSaid(cue: Map<string, number>, value: string): boolean {
	const said = [...cue.keys()].filter((k) => /\p{N}/u.test(k));
	if (!said.length) return true;
	return [...contentKeys(value).keys()].filter((k) => /\p{N}/u.test(k)).every((k) => cue.has(k));
}

function score(cue: Map<string, number>, text: string): number {
	const hay = contentKeys(text);
	let total = 0;
	for (const [k, w] of cue) if (hay.has(k)) total += w;
	return total;
}

export function findParaphraseTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	// ENGLISH ONLY. The stop list is English, so on another language every article and preposition
	// counts as a content word, and "Grazie per la vostra attenzione" matched a headline on "per".
	// A deck that declares another language keeps the exact tiers and hides where they miss.
	const lang = ((root as Document).documentElement ?? root.ownerDocument?.documentElement)?.getAttribute('lang') ?? '';
	if (lang && !/^en\b/i.test(lang)) return null;
	const cue = contentKeys(text);
	if (!cue.size) return null;
	const scope = paraphraseScope(root);
	if (!scope) return null;
	let cueWeight = 0;
	for (const w of cue.values()) cueWeight += w;
	const floor = Math.max(PARAPHRASE_MIN_SHARED, cueWeight * PARAPHRASE_MIN_COVERAGE);
	let best: Element | null = null;
	let bestScore = 0;
	let bestLen = Number.POSITIVE_INFINITY;
	let tied: Element | null = null;
	for (const el of scope.querySelectorAll(`${BLOCK_SELECTOR}, [data-label]`)) {
		// Only what is painted: a chart's accessible description (`[data-lattice-desc]`) restates
		// every mark in one paragraph, so it shares words with every cue and names none of them.
		if (el.closest(UNPAINTED)) continue;
		const said = candidateText(el);
		// A MARK THAT DECLARES A VALUE must be corroborated whenever the sentence says a number:
		// every number in its value has to be said. Otherwise "Northwind: nineteen percent" would
		// name the Northwind line stamped `31% to 24%` — the value check the mark tier exists for.
		if (!el.matches(BLOCK_SELECTOR) && el.hasAttribute('data-value') && !valueSaid(cue, el.getAttribute('data-value') ?? '')) continue;
		const s = score(cue, said);
		if (s < floor) continue;
		const len = norm(said).length;
		if (s > bestScore) {
			best = el;
			bestScore = s;
			bestLen = len;
			tied = null;
		} else if (s === bestScore && best) {
			// A nested block with the same score is the same answer, said more precisely.
			if (best.contains(el) && len <= bestLen) {
				best = el;
				bestLen = len;
			} else if (!el.contains(best)) tied = el;
		}
	}
	if (best && !(tied && !best.contains(tied) && !tied.contains(best))) {
		paraphraseHit += 1;
		return best;
	}
	if (tied) return null;
	// THE HEADLINE, on one shared word. A sentence that opens or frames a slide ("If the board
	// agrees to exit, this is the plan.") names no single block, but it is about the slide's
	// claim, and a presenter's hand goes to the headline. One word is enough ONLY here: the
	// headline is one element per slide, so there is nothing for a weak match to be confused with.
	//
	// NOT ON A SLIDE WITH A FIGURE. A chart narrator's frame sentence ("Each wedge is that item's
	// share of the whole.") shares a word with a headline like "Wedges read by value and texture."
	// and is still about the picture, which the figure tier below names. Measured on the corpus
	// sample: without this guard every such frame sentence moved from the chart to the headline.
	if (scope.querySelector(FIGURE_SELECTOR)) return null;
	const head = scope.querySelector('h1, h2');
	// One shared word, and a substantial one: its STEM must keep four letters. "region" stems to
	// "reg", so "Every region has a new lead." does not claim the headline "Revenue grew in every
	// region"; "exit" keeps all four, so "If the board agrees to exit" still finds "How the exit
	// would run." A bare number is never enough.
	const headKeys = head && !head.closest(UNPAINTED) ? contentKeys(head.textContent ?? '') : null;
	if (head && headKeys && [...cue.keys()].some((k) => headKeys.has(k) && k.length >= 4 && !/^\p{N}+$/u.test(k))) {
		paraphraseHit += 1;
		return head;
	}
	return null;
}

/**
 * Is this sentence an ASIDE — too short to be about anything a slide could show? ("Thank you.",
 * "No.", "We did look hard at the fix.") The hold keeps the hand resting through an aside; a
 * longer sentence that names nothing on the slide is commentary the slide does not carry, and the
 * hand must leave rather than claim the last thing it named is what is being said.
 */
export function isAside(text: string): boolean {
	return contentKeys(text).size <= ASIDE_MAX_WORDS;
}
const ASIDE_MAX_WORDS = 3;

/** Did the paraphrase tier answer the last cue? Same shape and reason as `figureHit`. */
export let paraphraseHit = 0;
export const resetParaphraseHit = (): number => {
	const n = paraphraseHit;
	paraphraseHit = 0;
	return n;
};

/**
 * Did one of the three CHART tiers (detail · chart text · figure) answer the last cue? Same
 * shape and same reason as `markHit`: the sweep must be able to tell them apart from the
 * piecewise row, and from each other would be a refinement it does not yet need.
 */
export let figureHit = 0;
export const resetFigureHit = (): number => {
	const n = figureHit;
	figureHit = 0;
	return n;
};

/** How much more text than the cue a spanning container may hold before it stops being "the
 *  thing being said" and becomes the group it belongs to. Set from the corpus sweep. */
const SPAN_SLACK = 3;

/** Elements the climb will never return, and never climb past: the slide and the document that
 *  holds it. Naming one of these is naming everything, which is naming nothing. */
const STOP_CLIMB = new Set(['SECTION', 'BODY', 'HTML', 'MAIN', 'ARTICLE']);

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
/** An AUTHORED `.lat-focus`. The Guide's own spark writes `.lat-spark`, never this class, so the
 *  element it is lighting never reads back as the deck's call-out (which would make it "notable"
 *  and exempt from the budget). */
function authoredFocusOf(el: Element): { self: boolean; inner: Element | null } {
	return { self: !!el.closest('.lat-focus'), inner: el.querySelector('.lat-focus') };
}

export function aimTarget(block: Element, text = ''): { el: Element; notable: boolean } {
	const focus = authoredFocusOf(block);
	if (focus.self) return { el: block, notable: true };
	const inner = focus.inner;
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
export type AnchorRole = 'phrase' | 'marker' | 'part' | 'header' | 'body';

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
 *
 * AN SVG MARK IS FILLED, NOT BACKGROUNDED. `fill` is the paint that makes a `<polygon>` or a
 * `<rect>` a solid region, and it is not `background-color` — so reading only the CSS box
 * properties reported "no boundary" for every filled chart mark, and `bracket` drew a second
 * outline around a solid colored cell. That is exactly the defect the redundant-boundary rule
 * exists to stop, arriving through the one element class that has no CSS background. Measured on
 * a real heatmap: 15 of 90 cells took a bracket, each around an already-filled rectangle.
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
	// `fill` only means a region on a shape — on an HTML element it is inherited and inert, so it
	// is asked of SVG geometry alone rather than of everything that happens to carry the property.
	if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') {
		const fill = cs.getPropertyValue('fill');
		if (fill && fill !== 'none' && !isTransparent(fill)) return true;
	}
	const shadow = cs.boxShadow;
	return !!shadow && shadow !== 'none' && !isTransparent(shadow);
}

/** `rgba(…, 0)` and anything that parses to alpha 0. Substring-safe: a shadow string carries its
 *  color inline, so this is asked of the whole declaration as well as of a bare color.
 *
 *  THREE SYNTAXES, because Chromium serializes different ones in different places and the wrong
 *  answer here is the expensive direction: an unparsed color reads as OPAQUE, which invents a
 *  boundary and silently retires `bracket` on whatever carries it. Legacy `rgba(r, g, b, a)`,
 *  modern slash `rgb(r g b / a)`, and `color(srgb r g b / a)` — for the last two the alpha is
 *  whatever follows the slash, for the first it is the fourth comma-separated number. */
function isTransparent(value: string): boolean {
	if (!value || value === 'transparent' || value === 'none') return true;
	// EVERY color in the declaration, not the first. A `box-shadow` is a LIST, and Lattice's finish
	// tokens compose one out of a transparent placeholder plus a real layer — so reading only the
	// first color reported a genuine drop shadow as no boundary at all, and `bracket` drew its
	// second outline around a card that already had one. Transparent means ALL of them are.
	const colors = value.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/g);
	if (!colors) return false;
	return colors.every((c) => {
		const inner = c.slice(c.indexOf('(') + 1, -1);
		const slash = inner.indexOf('/');
		if (slash >= 0) {
			const a = Number.parseFloat(inner.slice(slash + 1).trim());
			return Number.isFinite(a) && a <= 0.02;
		}
		const parts = inner.split(',').map((x) => Number.parseFloat(x.trim()));
		return parts.length >= 4 && Number.isFinite(parts[3]) && parts[3] <= 0.02;
	});
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
 *   INLINE LEFT — `list takeaway numbered`'s index on a lead-plus-gloss row, an absolutely-placed
 *   gutter number (the shape the retired `list-criteria` drew).
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
 * options, in `list-steps`) or left it as a bare text node (`cards-grid`'s
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

/**
 * The range of the token this element's own component says NAMES it, or null.
 *
 * `headerRange` above answers the same question by heuristic — "everything before the first
 * nested block" — and that heuristic has a blind spot with a name: a part built out of `<span>`s
 * has no nested block, so the cut never happens and the whole part becomes the handle. A card
 * gets a `bracket` drawn around a border it already had, which is the redundant-boundary defect
 * the handle model exists to stop.
 *
 * So a component may DECLARE the token instead (`handles` in its manifest). Between the marker
 * and the header deliberately: a `::marker` is a real glyph the element renders, while
 * "everything before the first nested block" is a guess — and a declaration beats a guess.
 */
function declaredHandle(el: Element): Range | null {
	for (const row of GUIDE_HANDLES) {
		if (!el.matches(row.part)) continue;
		const token = el.querySelector(row.names);
		// A declared token that renders empty is not a handle. Fall through rather than hand back a
		// zero-width range: the next rule down is the one that would have run anyway.
		if (!token || !(token.textContent ?? '').trim()) continue;
		const r = contentRange(token);
		if (r) return r;
	}
	return null;
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
	const part = declaredHandle(el);
	const partRects = rectsOf(part);
	if (part && partRects) return { role: 'part', box: hull(partRects), rects: partRects, range: part, markerOffset: null };
	const header = headerRange(el);
	const headRects = rectsOf(header);
	if (header && headRects) return { role: 'header', box: hull(headRects), rects: headRects, range: header, markerOffset: null };
	const range = sentence ?? own;
	const rects = sentence ? rectsOf(sentence) : ownRects;
	return { role: 'body', box: rects ? hull(rects) : elBox(el), rects, range, markerOffset: null };
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
	/** The slide's own width, for the "is this a wide thing or a compact one" thresholds. */
	slideW: number;
	/** What kind of thing the ink is on (`anchorFor`). The SEMANTIC half of the choice — a marker
	 *  is named the way a marker is named whatever its measurements say.
	 *
	 *  This REPLACED the old `rects` + `coverage` fields rather than joining them: both existed only
	 *  to answer "is this cue a phrase inside its block", which `anchorFor` now decides once, on its
	 *  way to choosing a handle. Leaving them on the type would be a surface that looks like an
	 *  input and is read by nothing. */
	role: AnchorRole;
	/** True when the thing being named already draws its own border / fill / shadow. */
	enclosed: boolean;
	/** True when the target carries NO text of its own — a chart mark, which is geometry rather
	 *  than words. Two of the five gestures are about words specifically (`underline` names their
	 *  extent, `wash` sweeps them), and neither has anything to measure here: a mark's range
	 *  produces no client rects, so both fall back to the element's BOUNDING BOX. On a funnel
	 *  trapezoid that is the wide end's width drawn under the narrow end — measured at 1107px of
	 *  ink under a 443px edge, overhanging the shape by 332px on each side. */
	textless: boolean;
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
	const { box, lines, slideW, role, enclosed, textless } = shape;
	if (role === 'phrase') return 'wash';
	if (role === 'marker') return Math.min(box.width, box.height) >= MARKER_RING * slideW ? 'circle' : 'tap';
	// A SHAPE IS NAMED BY ITS LOCATION, not by the extent of words it does not have. `underline`
	// and `wash` both lay ink along line rects; a chart mark has none, so both degrade to its
	// bounding box and draw ink the shape's own outline does not follow. `bracket` is barred
	// separately by the redundant-boundary rule, since a mark is filled. That leaves the two
	// gestures that name a point, which is what a presenter does with a band or a cell anyway.
	if (textless) return box.width <= RING_WIDTH * slideW ? 'circle' : 'tap';
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

/** The thinnest a mark is ever measured, in CSS px. See `elBox`. */
const MIN_MARK_THICKNESS = 4;

/**
 * An element's box, with a LINE given a thickness.
 *
 * `getBoundingClientRect()` measures SVG geometry without its stroke, so a horizontal `<line>` is
 * zero pixels tall and a vertical one zero wide. A dumbbell's bar is exactly that shape: the mark
 * tier found it — "Platform: Plan, forty-eight; Actual, fifty-five." led its label and
 * corroborated both ends — and then `guideCueIn`'s "does it have an area" guard threw it away,
 * so five of five dumbbell cues hid. The guard is right about a box with NO extent (a detached
 * or `display:none` node); it was wrong about one with extent in one direction only. So a box
 * that is long in one axis and flat in the other is widened, about its own center, to
 * `MIN_MARK_THICKNESS` — the stroke a viewer actually sees — and every other box is untouched.
 */
function elBox(el: Element): Box {
	const b = boxOf(el.getBoundingClientRect());
	if (b.width > 0 && b.height === 0) return { ...b, top: b.top - MIN_MARK_THICKNESS / 2, height: MIN_MARK_THICKNESS };
	if (b.height > 0 && b.width === 0) return { ...b, left: b.left - MIN_MARK_THICKNESS / 2, width: MIN_MARK_THICKNESS };
	return b;
}

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
	const t0 = elBox(el);
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
		slideW: frame.width || 1280,
		role: anchor.role,
		// Asked of the ELEMENT, not of the handle: it is the card that already has the border, and
		// it is the card a `bracket` would draw its second outline around.
		enclosed: hasOwnBoundary(el),
		// NO TEXT OF ITS OWN — asked of the element's CONTENT, not of its client rects.
		//
		// Rects were the first discriminator and they are wrong in a way worth recording: jsdom has
		// no layout, so every element reports none, and the rule fired on all of them in the unit
		// tier while firing correctly in a browser. A check that means two different things in the
		// two places it runs is not a check. Text content means the same thing in both.
		//
		// A marker is excluded because its own box IS its geometry; it was never measuring words.
		textless: anchor.role !== 'marker' && !(el.textContent ?? '').trim(),
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
		if (!(node.textContent ?? '').trim() || node.closest('.chart-sr-only')) continue;
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
		const r = elBox(el);
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

/**
 * WHICH element a cue would name, inside a document the POINTER SHARES — the Stage window.
 *
 * The frame pair above and this pair answer the same two questions; what differs is whether a
 * coordinate boundary sits between the slide and the cursor. Under the Stage/console split
 * (2026-08-24-stage-console-split.md) the Guide follows the deck to the audience's window, and
 * there the slide is the document rather than an iframe inside one — so Vetrina's stage root and
 * the elements it points at are laid out in ONE viewport and every rect is already in the space
 * the cursor moves in. No `frameGeom`, no `/ S`, nothing to map.
 */
/**
 * THE SHOWN SLIDE, not the document.
 *
 * The Stage is a FILMSTRIP: every section of the deck is in the DOM at once, and the
 * non-current ones are hidden with `visibility` (deliberately — `stage-window.js` needs
 * their `offsetTop` to survive). `visibility: hidden` keeps the boxes, so every block on
 * every other slide still measures non-zero and is still a candidate. Handing the whole
 * `Document` to the matcher therefore searched the ENTIRE DECK — measured at 49 blocks
 * across 7 sections where the console's framed path sees 4, because
 * `single-slide-render` narrows that one to a single section before the pointer ever
 * looks. Two consequences, both on the audience surface: a sentence that also appears on
 * another slide (a repeated heading, a running kicker) could resolve to a block nobody
 * can see, and the obstacle scan measured twelve times as many rects per spoken
 * sentence — on the thread this module's own cadence notes promise not to stall.
 */
function shownSection(doc: Document | null): Document | Element | null {
	if (!doc) return null;
	const secs = Array.from(doc.querySelectorAll('.lattice > section')) as HTMLElement[];
	return secs.find((sec) => sec.style.visibility !== 'hidden') ?? doc;
}

// ── THE SALIENCE PLAN — which moments on a slide earn a gesture ─────────────────────────────
//
// Guide used to gesture on every block change, so a dense slide got a move per paragraph whether
// or not the paragraph mattered. A presenter names two things on a board slide, not six. So the
// plan runs once per slide, before the first sentence: it resolves every cue to its target, ranks
// the distinct targets, and lets only the top `budget` of them gesture — each on the FIRST cue
// that names it. Every other cue holds the hand still (engineering/decisions/
// 2026-09-25-vetrina-delivery-presets.md §4, §6).
//
// A preset sets the budget; it never decides the ranking. What matters on a slide is a fact
// about the content, so every signal below reads the slide, and each is deterministic.

/** A measured amount: currency, a percentage, a magnitude or duration unit, a decimal,
 *  thousands, or three or more digits that are not a year. */
const FIGURE = /[$€£¥]\s?\d|\d\s?%|\d\s?(?:percent|pts?|million|billion|thousand|[kKmMbB]|bn|pp|x|mo|months?|weeks?|days?|years?|yrs?|hours?|hrs?)\b|\d[.,]\d(?!\S*\s+\p{Lu}\p{Ll})|\b(?!(?:19|20)\d\d\b)\d{3,}\b/u;

/** How much a target matters. Authored focus dominates everything else, so it is never cut. */
export function salience(el: Element): number {
	let score = 0;
	// AUTHORED. The deck said this with `_focus:`, which tags `.lat-focus` (decision 2026-08-05
	// §4.1 already treats it as the one meaning of "notable"). It is spent first and never cut.
	const focus = authoredFocusOf(el);
	if (focus.self || focus.inner) score += 100;
	// A CONTAINER OF MARKS is the chart's frame, not a datum. Its text holds every bar's value and
	// label, so scoring it like a block handed "Here is revenue by region." the EMEA bar's figure
	// and headline bonus, and under somber — where a whole chart cannot be marked — the bar the
	// slide is about was never marked at all.
	if (!el.matches('[data-mark], [data-series]') && el.querySelector('[data-mark], [data-series]')) return score;
	const said = el.matches('[data-label]') ? `${el.getAttribute('data-label') ?? ''} ${el.getAttribute('data-value') ?? ''}` : (el.textContent ?? '');
	// A FIGURE. What a board remembers is a measured number, so a claim that carries one ranks
	// high. An index is not a figure: "Section 01", "step 3", "1 December" and a bare year carry
	// digits and say nothing, and counting them spent the Q3 fixture's budget on every divider's
	// kicker. So only an amount counts.
	if (FIGURE.test(said)) score += 3;
	// A CHART MARK is a datum the narration is naming, not prose about it.
	if (el.matches('[data-mark], [data-series]')) score += 2;
	// EMPHASIS the author typed: **strong**, a <mark>.
	if (el.matches('strong, b, mark') || el.querySelector('strong, b, mark') || el.closest('strong, b')) score += 2;
	// THE EXTREME of its chart: the tallest bar or largest wedge outranks the smallest.
	score += chartExtreme(el);
	// NAMED BY THE HEADLINE. The headline is the slide's claim, so a mark or item it names ("EMEA
	// is where the quarter was won") is the moment the slide exists for. Measured in the built
	// Studio: without this, a somber bar chart marked LATAM, the smallest bar, spoken first.
	// It also outweighs being the chart's largest mark (+2): "Deals stall between the demo and the
	// proposal" is about those two stages, not about the widest one.
	if (namedByHeadline(el)) score += 3;
	// THE HEADLINE is the slide's claim, so it outranks plain prose but not a number.
	if (el.matches('h1, h2')) score += 1;
	return score;
}

/** Is this chart mark the largest or smallest value among the marks it sits with? */
/** A mark's declared value as a number: the FIRST amount, scaled by its magnitude, so "900K"
 *  ranks below "1.2M" and slope's "10 to 20" reads as 10 rather than 1020. */
function amountOf(raw: string | null): number {
	const m = /(-?\d[\d,]*(?:\.\d+)?)\s*([kmb]|bn)?/i.exec(raw ?? '');
	if (!m) return Number.NaN;
	const scale: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 };
	return parseFloat(m[1].replace(/,/g, '')) * (scale[(m[2] ?? '').toLowerCase()] ?? 1);
}

/** 2 for the chart's largest mark, 1 for its smallest, else 0. */
function chartExtreme(el: Element): number {
	const own = amountOf(el.getAttribute('data-value'));
	if (!Number.isFinite(own)) return 0;
	const chart = el.closest('.chart-body');
	if (!chart) return 0;
	const values = [...chart.querySelectorAll('[data-mark][data-value]:not(template)')]
		.map((m) => amountOf(m.getAttribute('data-value')))
		.filter(Number.isFinite);
	if (values.length < 3) return 0;
	return own === Math.max(...values) ? 2 : own === Math.min(...values) ? 1 : 0;
}

/** Does the slide's headline share a content word with this (non-headline) target? */
function namedByHeadline(el: Element): boolean {
	const head = el.closest('section')?.querySelector('h1, h2');
	if (!head || head === el || head.contains(el) || el.contains(head)) return false;
	const said = el.matches('[data-label]') ? (el.getAttribute('data-label') ?? '') : (el.textContent ?? '');
	const headKeys = contentKeys(head.textContent ?? '');
	return [...contentKeys(said).keys()].some((k) => headKeys.has(k) && !/\p{N}/u.test(k));
}

/** The authored focus unit `el` belongs to, as a key, or null: a series or mark index for chart
 *  marks (every twin shares it), the whole call-out for a block that merely CONTAINS focus, else
 *  the `.lat-focus` element itself. */
function authoredUnit(el: Element): string | Element | null {
	const focus = authoredFocusOf(el);
	const spec = `focus:${el.closest('section')?.getAttribute('data-focus') ?? ''}`;
	// A CONTAINER of the call-out — each row under `_focus: col 5` holds one focused cell, a chart
	// holds its focused series — is part of one moment with it. Without this every row's sentence,
	// and the chart's frame sentence beside the series, won an exempt gesture of its own.
	if (!focus.self) return focus.inner ? spec : null;
	// A chart mark or series is one moment however many elements carry it.
	if (el.closest('.lat-focus[data-series], .lat-focus[data-mark]')) return spec;
	return el.closest('.lat-focus');
}

export type SlidePlan = {
	/** Cue indices that gesture: the first cue naming each chosen target. */
	gesture: Set<number>;
	/** The cue index of the top-ranked chosen target, or -1 when nothing was chosen. */
	top: number;
	/** Cue indices that resolved to a target when the plan was made. */
	aimed: Set<number>;
};

/**
 * Plan one slide's gestures.
 *
 * `aim` resolves a cue's text to the element it would name (`guideAimFor` / `guideAimIn`, which
 * read no layout), so the plan costs text matching only. Ties go to the earlier target, so a
 * slide with nothing salient spends its budget in the order it is spoken — as far as `floor`
 * (the preset's minimum salience after the first gesture) lets it.
 */
export function planSlide(texts: readonly string[], aim: (text: string) => Element | null, budget: number, floor = 0): SlidePlan {
	// One entry per MOMENT. An authored focus unit is one moment however many elements carry it:
	// `_focus: series 3` tags every dot of the series, and a narration that reads the series point
	// by point would otherwise spend seven budget-exempt gestures on one call-out (measured on
	// examples/focus-chart-marks.md slide 7 before this).
	const first = new Map<Element | string, { el: Element; cue: number }>();
	const aimed = new Set<number>();
	texts.forEach((t, i) => {
		const el = t ? aim(t) : null;
		if (!el) return;
		aimed.add(i);
		const key = authoredUnit(el) ?? el;
		const had = first.get(key);
		// One moment, gestured on its MOST SPECIFIC cue: the focused series itself beats the chart
		// frame that holds it, even when the frame is spoken first.
		if (!had || (!authoredFocusOf(had.el).self && authoredFocusOf(el).self)) first.set(key, { el, cue: i });
	});
	const ranked = [...first.values()]
		.map(({ el, cue }) => ({ cue, score: salience(el) }))
		.sort((a, b) => b.score - a.score || a.cue - b.cue);
	// The top moment always gestures, so a slide of plain prose still gets one move; after it, a
	// moment has to clear the preset's floor, and authored focus clears everything.
	const chosen = ranked.filter((r, i) => r.score >= 100 || (i < budget && (i === 0 || r.score >= floor)));
	return { gesture: new Set(chosen.map((r) => r.cue)), top: chosen[0]?.cue ?? -1, aimed };
}

// ── THE SPARK — the gesture that changes the slide rather than drawing on it ────────────────
//
// Ink draws over the content; a spark changes the content itself. The named bullet, table row,
// cell or column, chart mark or line takes the `.lat-spark` class and changes COLOR in place —
// never weight, padding, border or scale, so no box moves in front of the audience — while its
// peers stay exactly as they were. Every look comes from `lib/base/base.focus.css` and every
// color from a token, so each theme's spark is automatic (HARD RULE #3). The section carries the
// preset (`data-spark`, `data-spark-pulse`, `--spark-fade`); no render path writes any of it, so
// a PDF, a PPTX and an export render exactly as before (the rules ship in the CSS bundle, inert).
//
// It uses its own class rather than `_focus`'s, so it never reads back as the deck's authored
// call-out (`authoredFocusOf`), and it can spark inside a slide the deck already focused: color
// on the named thing does not fight the author's spotlight. It always returns its own undo, which
// the caller runs on the next gesture, on a slide change and when Guide switches off: a spark left
// behind would be a lie about what is being said.

const SERIES_SHAPES = ['path', 'polygon', 'polyline', 'circle', 'line'];

/** What a spark lights for `el`, and the `_focus`-grammar axis that names it; null when nothing
 *  on the slide can take a spark (a figure, an image, a chart's hit area, a container of blocks),
 *  and the caller falls back to ink. */
export function sparkUnit(el: Element): { unit: Element[]; axis: string; context?: Element[] } | null {
	const section = el.closest('section');
	if (!section) return null;
	// One chart's marks, never another's: two charts on a slide both number their marks from 0.
	const chart = el.closest('.chart-body') ?? el.closest('figure.chart-frame') ?? el.closest('svg') ?? section;
	for (const attr of ['data-mark', 'data-series'] as const) {
		// A series is its SHAPES: radar's container `<div>` also writes `data-series`, as a count,
		// and slope's labels write a palette slot. `focus.js` draws the same line.
		const sel = attr === 'data-series' ? SERIES_SHAPES.map((t) => `${t}[data-series]`).join(', ') : '[data-mark]:not(template)';
		const v = el.closest(sel)?.getAttribute(attr);
		if (v == null) continue;
		// A POINT of a series — one dot, named by its own label and value — sparks itself, with its
		// line as quiet context. Widening it to the series lit the whole line on "Q1 2026, four point
		// one", which read as the same gesture again rather than the point being read.
		if (attr === 'data-series' && el.matches('circle[data-series][data-label]')) {
			const line = [...chart.querySelectorAll(`:is(path, polyline, line)[data-series="${v}"]`)].filter((m) => !m.closest('template') && !m.classList.contains('line-hit'));
			return { unit: [el], axis: 'point', context: line };
		}
		const unit = [...chart.querySelectorAll(sel)].filter((m) => m.getAttribute(attr) === v && !m.closest('template') && !m.closest(UNPAINTED) && !m.classList.contains('line-hit'));
		if (unit.length) return { unit, axis: attr === 'data-mark' ? 'mark' : 'series' };
	}
	// A TABLE names three things, by where the spoken words sit: a header cell names its column,
	// the row's first cell (its label) names the row, and any other body cell names itself. A
	// table with a spanned cell names only the cell: a child index is no longer a column there,
	// and escalating on it lit the wrong column.
	const cell = el.closest('td, th');
	const row = cell?.parentElement as HTMLTableRowElement | null | undefined;
	const table = cell?.closest('table') as HTMLTableElement | null | undefined;
	if (cell && row && table) {
		const rows = [...table.rows];
		if (rows.some((r) => [...r.cells].some((c) => c.colSpan > 1 || c.rowSpan > 1))) return { unit: [cell], axis: 'cell' };
		const index = [...row.children].indexOf(cell);
		if (cell.closest('thead')) return { unit: rows.map((r) => r.cells[index]).filter((c): c is HTMLTableCellElement => !!c), axis: 'col' };
		if (index === 0) return { unit: [...row.children], axis: 'row' };
		return { unit: [cell], axis: 'cell' };
	}
	// A BULLET is the item the words sit in: a nested bullet sparks itself, not its card.
	const li = el.closest('li');
	if (li && section.contains(li)) return { unit: [li], axis: 'item' };
	// Inside a chart, only a text label is a spark; a hit area or a frame is not.
	if (el.closest('svg')) return el.matches('text') ? { unit: [el], axis: 'block' } : null;
	// ANY OTHER TEXT BLOCK — a paragraph, a heading, a quote, a bold phrase — sparks itself, so a
	// slide of plain prose still has a moment. Never a container of blocks or of chart marks: the
	// whole slide turning accent is a flood, not a spark.
	if (el === section || el.matches('img, svg, figure, picture, video, canvas, table')) return null;
	if (el.querySelector('p, li, table, [data-mark], [data-series], h1, h2, h3, blockquote')) return null;
	return { unit: [el], axis: 'block' };
}

export type SparkLook = { tone?: 'accent' | 'muted'; pulse?: boolean; fade?: number };

/** Which spark set a document's wash last — the only one allowed to clear it. */
const washOwner = new WeakMap<Document, object>();

/** A fade-out's pending clear, per element, so a spark that returns before it ends keeps it. */
const pendingClear = new WeakMap<Element, number>();

/** An SVG area mark whose fill must stay: one with text laid over it (a heatmap value, a state
 *  node's name), or a translucent one (radar's area). Filling either with ink hid what it carries,
 *  so it takes an edge instead. A series polygon is an AREA by construction and often paints
 *  through a gradient, whose alpha no computed style reports, so it always takes the edge. */
function wantsEdge(m: Element, view: Window): boolean {
	if (!m.matches('rect, circle, ellipse, polygon, path')) return false;
	if (m.matches('polygon[data-series]')) return true;
	const cs = view.getComputedStyle(m);
	if (Number.parseFloat(cs.fillOpacity) < 1 || /\/\s*0?\.\d+\s*\)$|,\s*0?\.\d+\s*\)$/.test(cs.fill)) return true;
	const r = m.getBoundingClientRect();
	if (r.width < 1 || r.height < 1) return false;
	const scope = m.closest('.chart-body') ?? m.closest('svg')?.parentElement ?? m.closest('section');
	if (!scope) return false;
	for (const t of scope.querySelectorAll('text, tspan, span, p, div, li')) {
		if (t.closest(UNPAINTED)) continue;
		if (t.childElementCount || t === m || t.contains(m) || !(t.textContent ?? '').trim()) continue;
		const q = t.getBoundingClientRect();
		const cx = q.left + q.width / 2;
		const cy = q.top + q.height / 2;
		if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) return true;
	}
	return false;
}

/**
 * Spark the content `el` names, and return the undo — or null when nothing on the slide can take
 * a spark, so the caller can gesture another way. The undo swaps `.lat-spark` for
 * `.lat-spark-out`, which fades text back over the same `fade`, then removes it.
 */
export function sparkContent(el: Element, look: SparkLook = {}): (() => void) | null {
	const section = el.closest('section') as HTMLElement | null;
	const found = sparkUnit(el);
	if (!section || !found) return null;
	const { tone = 'accent', pulse = true, fade = 320 } = look;
	section.setAttribute('data-spark', tone);
	section.toggleAttribute('data-spark-pulse', pulse);
	section.style?.setProperty('--spark-fade', `${fade}ms`);
	const view = el.ownerDocument?.defaultView;
	const kept: HTMLElement[] = [];
	for (const e of found.unit) {
		if (view) view.clearTimeout(pendingClear.get(e));
		// A card whose nested list is not being said keeps that list in the ink it had — read
		// BEFORE the class lands, while the element still paints its own ink.
		if (view && e instanceof view.HTMLElement && e.matches('li') && e.querySelector('ul, ol')) {
			e.style.setProperty('--spark-keep', view.getComputedStyle(e).color);
			kept.push(e);
		}
		if (view && e.closest('svg') && wantsEdge(e, view)) e.classList.add('lat-spark-edge');
		e.classList.remove('lat-spark-out');
		e.classList.add('lat-spark');
	}
	// The wash as a highlight over each text element's own words (never a nested list's), so it
	// hugs the glyphs instead of filling the element's box. A table cell keeps its CSS wash.
	const washes = found.unit
		.filter((e) => !e.closest('svg') && !e.matches('td, th'))
		.map((e) => {
			const r = e.ownerDocument.createRange();
			r.selectNodeContents(e);
			const nested = e.querySelector(':scope > ul, :scope > ol');
			if (nested) r.setEndBefore(nested);
			return r;
		});
	const washToken = {};
	if (washes.length) {
		setWash(section.ownerDocument, washes);
		washOwner.set(section.ownerDocument, washToken);
	}
	const context = found.context ?? [];
	for (const e of context) {
		if (view) view.clearTimeout(pendingClear.get(e));
		e.classList.add('lat-spark-context');
	}
	let done = false;
	return () => {
		if (done) return;
		done = true;
		for (const e of context) e.classList.remove('lat-spark-context');
		for (const e of found.unit) {
			if (!e.classList.contains('lat-spark')) continue;
			e.classList.remove('lat-spark');
			e.classList.add('lat-spark-out');
		}
		const clear = () => {
			// Only the spark that set the wash may clear it: a later spark's wash is not ours to end.
			if (washes.length && washOwner.get(section.ownerDocument) === washToken) setWash(section.ownerDocument, null);
			for (const e of found.unit) {
				// A later spark on the same element took it back; its state is no longer ours to end.
				if (e.classList.contains('lat-spark')) continue;
				e.classList.remove('lat-spark-out', 'lat-spark-edge');
				if (kept.includes(e as HTMLElement)) (e as HTMLElement).style.removeProperty('--spark-keep');
			}
		};
		if (!view) return clear();
		const t = view.setTimeout(clear, fade + 40);
		for (const e of found.unit) pendingClear.set(e, t);
	};
}

// ── THE READ-ALONG — the word being spoken, inside the spark ────────────────────────────────
//
// The spark names the element; the read-along names the word. It runs on the caption's clock
// (the reader's active cue and word), so the slide, the caption and the voice agree. It is a CSS
// Highlight, never a DOM edit: DOMPurify'd slide markup stays untouched (HARD RULE #22), and a
// word split across inline markup still lights as one word.

/** A word as it can be found in slide text: lower-case, with its edge punctuation dropped. */
const bareWord = (w: string): string => w.toLowerCase().replace(/^[^\p{L}\p{N}$€£¥]+|[^\p{L}\p{N}%]+$/gu, '');

/**
 * The range of the `k`-th spoken word of a sentence inside `el`, or null when that word is not
 * in the element's own text (a paraphrased caption, a number spelled out loud).
 *
 * The words are found IN ORDER from the sentence's first word, so "the" in the fifth word does
 * not land on an earlier "the". A word the element lacks is skipped rather than ending the walk,
 * so one spelled-out figure does not blank the rest of the sentence.
 */
export function wordRangeIn(el: Element, words: readonly string[], k: number): Range | null {
	if (k < 0 || k >= words.length) return null;
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
	const nodes: { node: Text; start: number }[] = [];
	let text = '';
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (n.parentElement?.closest(UNPAINTED)) continue;
		nodes.push({ node: n as Text, start: text.length });
		text += (n as Text).data;
	}
	const hay = text.toLowerCase();
	// Anchor on the first word the element holds, so the walk starts where the sentence does.
	let at = 0;
	let hit: [number, number] | null = null;
	for (let i = 0; i <= k; i++) {
		const w = bareWord(words[i]);
		if (!w) continue;
		let j = hay.indexOf(w, at);
		while (j !== -1 && !(j === 0 || !/[\p{L}\p{N}]/u.test(hay[j - 1]))) j = hay.indexOf(w, j + 1);
		if (j === -1) continue;
		if (i === k) hit = [j, j + w.length];
		at = j + w.length;
	}
	if (!hit) return null;
	const locate = (off: number, end: boolean) => {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const { node, start } = nodes[i];
			if (off > start || (off === start && !end)) return { node, offset: Math.min(off - start, node.data.length) };
		}
		return nodes[0] ? { node: nodes[0].node, offset: 0 } : null;
	};
	const a = locate(hit[0], false);
	const b = locate(hit[1], true);
	if (!a || !b) return null;
	const range = doc.createRange();
	range.setStart(a.node, a.offset);
	range.setEnd(b.node, b.offset);
	return range;
}

type HighlightView = Window & { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...r: Range[]) => unknown };

/** Set or clear (null) a named CSS highlight in `doc`. A no-op where the browser has no CSS
 *  Custom Highlight API, which costs only the wash and the read-along, never the spark. */
function setHighlight(doc: Document | null | undefined, name: string, ranges: Range[] | null): void {
	const view = doc?.defaultView as HighlightView | null | undefined;
	const hl = view?.CSS?.highlights;
	if (!hl) return;
	if (!ranges?.length || !view?.Highlight) hl.delete(name);
	else hl.set(name, new view.Highlight(...ranges));
}

/** Light `range` as the word being said in `doc`, or clear it (null). */
export function setSaid(doc: Document | null | undefined, range: Range | null): void {
	setHighlight(doc, 'lat-said', range ? [range] : null);
}

/** The spark's wash behind the words of the sparked text, or clear it (null). */
function setWash(doc: Document | null | undefined, ranges: Range[] | null): void {
	setHighlight(doc, 'lat-spark-wash', ranges);
}

/**
 * Is the element the hand last named still on the slide being shown? `PresentOverlay`'s hold asks
 * this before it keeps the hand resting through a sentence that names nothing: after a slide
 * change the old target is detached (the frame re-rendered) or sits in a hidden `<section>` (the
 * Stage keeps every slide mounted), and a hand resting beside a slide that is gone must hide.
 */
export function guideStillShown(el: Element | null): boolean {
	if (!el?.isConnected) return false;
	const sec = el.closest('section') as HTMLElement | null;
	if (!sec) return true;
	const view = el.ownerDocument?.defaultView;
	if (!view) return sec.style.visibility !== 'hidden';
	const cs = view.getComputedStyle(sec);
	return cs.display !== 'none' && cs.visibility !== 'hidden';
}

export function guideAimIn(doc: Document | null, text: string): Element | null {
	const block = findCueTarget(shownSection(doc), text);
	return block ? aimTarget(block, text).el : null;
}

/**
 * The full decision with NO frame boundary to cross (see `guideAimIn`).
 *
 * Two consequences worth naming, because both are places the frame version has to work and this
 * one does not. The keep-out is the cursor's own 28px UNCONVERTED: `POINTER_BOX` is measured in
 * the space the stage draws in, and here that IS the space the slide is measured in — dividing by
 * a scale would be the #1403 error with its sign flipped. And the "frame" the placement solver
 * clamps against is the WINDOW: the Stage fit-scales one slide to fill the display, so its
 * viewport is the slide's own box plus the letterbox, which is exactly the region a cursor may
 * rest in.
 *
 * `#latt-film` carries the fit transform, so `getBoundingClientRect()` on anything inside it
 * already reports post-scale viewport pixels — which is why the live re-measure below can hand
 * its box straight back rather than mapping it.
 */
export function guideCueInDoc(doc: Document | null, text: string): GuideCue | null {
	const view = doc?.defaultView;
	if (!doc || !view) return null;
	const half = POINTER_BOX / 2;
	// TWO DIFFERENT BOXES, and conflating them re-tunes every gesture. The ROOT is the shown
	// section (see `shownSection`) — that is what may be searched and measured. The FRAME is
	// the fit box, which is what `chooseGesture` reads `slideW` from: its width fractions
	// (`TAP_WIDTH` 0.1, `RING_WIDTH` 0.42) are fractions OF THE SLIDE, and the Stage
	// letterboxes, so passing `innerWidth` over-reported the slide by 7.6% at rest and ~20%
	// with the caption band up — the same content classifying differently on the Stage than
	// on the console. `#latt-fit` is the slide's own painted box; the window is only the
	// clamp the cursor may come to rest inside.
	const fit = doc.getElementById('latt-fit');
	const box = fit ? fit.getBoundingClientRect() : null;
	const frame = box && box.width > 0 ? { left: box.left, top: box.top, width: box.width, height: box.height } : { left: 0, top: 0, width: view.innerWidth, height: view.innerHeight };
	const cue = guideCueIn(shownSection(doc) ?? doc, text, frame, half, half + 5);
	if (!cue) return null;

	const { el, inkRange, markerOffset, role } = cue;
	const alive = () => el.isConnected;
	// THE HANDLE, RE-MEASURED PER FRAME — the same three cases as the framed version: a phrase
	// keeps its block (the cursor must clear the words that follow), a marker rides its element's
	// box plus the offset the classifier solved once, and everything else is its ink's hull.
	const liveBox = (): Box | null => {
		const r = elBox(el);
		if (markerOffset) return { left: r.left + markerOffset.dx, top: r.top + markerOffset.dy, width: markerOffset.width, height: markerOffset.height };
		if (role === 'phrase') return { left: r.left, top: r.top, width: r.width, height: r.height };
		const live = rectsOf(inkRange);
		return live ? hull(live) : { left: r.left, top: r.top, width: r.width, height: r.height };
	};
	return {
		el,
		kind: cue.kind,
		strength: cue.strength,
		target: {
			getBoundingClientRect(): DOMRect {
				try {
					const b = alive() ? liveBox() : null;
					return b ? asRect(b) : GONE;
				} catch {
					return GONE;
				}
			},
			getClientRects(): DOMRect[] {
				try {
					if (!alive()) return [];
					const live = markerOffset ? [asRect(liveBox() as Box)] : rectsOf(inkRange);
					return live ?? [];
				} catch {
					return [];
				}
			},
		},
		// A 2x2 box around the point, so Vetrina's `aimAt` resolves to the point itself
		// (the same shape `innerPoint` builds on the framed path).
		rest: cue.rest ? { getBoundingClientRect: () => (alive() ? asRect({ left: (cue.rest as { x: number; y: number }).x - 1, top: (cue.rest as { x: number; y: number }).y - 1, width: 2, height: 2 }) : GONE) } : null,
	};
}
