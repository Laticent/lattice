import { GUIDE_HANDLES, GUIDE_SCENES, type GuideScene } from '@/components/studio/guide-handles.generated.js';
import { toSpokenText } from '@/lib/cadenza';
import { keyIndex, resolveUnit } from '@/lib/scene-resolve.js';
import { spokenValue } from '@/playground/read-along-core.generated.js';

// THE GUIDE KERNEL — which element a sentence names, which moments a slide spends its focus on,
// and the focus itself (#2371, #2393). DOM only: no frame geometry, no cursor, no ink, no React.
//
// TWO CALLERS, ONE SOURCE (HARD RULE #1). The Studio's Present (`present-guide.ts` adds the ink,
// the cursor and the frame bridge on top of this) and the exported HTML player
// (`lib/export/guide-player.generated.mjs`, bundled from `guide-player.ts` by
// `tools/build-guide-player.js`) both run this file, so a sent deck and the Studio cannot
// disagree about which row the narration names or how the rest recedes.
// engineering/decisions/2026-09-25-vetrina-delivery-presets.md §7.2.
//
// It is not the Vetrina `/deck` subpath §7.2 first proposed: the resolver reads Lattice's own
// component handles and value spellings, which a framework-free library must not know about.

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
export const loose = (s: string): string =>
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
		findTableRowTarget(frameDoc, text) ??
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
 * A TABLE ROW read as "<row> — <column>: <value>; <column>: <value>." — the shape table narration
 * speaks. No single block holds it, and the piecewise tier split it on its colons, so its one
 * searchable part was a column name and a table slide focused nothing at all (measured on the
 * Guide test deck, 2026-09-27). The row is the table row whose first cell IS the lead and that holds
 * at least one of the spoken values; its first cell is the answer, because a table's first cell
 * names its row (`focusUnit`).
 */
const ROW_LEAD = /^(.+?)\s+[—–]\s+(.+)$/;
export function findTableRowTarget(root: Document | Element | null, text: string): Element | null {
	if (!root) return null;
	const m = norm(text).match(ROW_LEAD);
	if (!m) return null;
	const label = loose(m[1]);
	if (!label) return null;
	const values = m[2]
		.split(/;\s+/)
		.map((pair) => loose(pair.split(/:\s+/).pop() ?? ''))
		.filter(Boolean);
	if (!values.length) return null;
	for (const table of root.querySelectorAll('table')) {
		// A chart's hidden screen-reader table repeats the chart's data and paints nothing: a row found
		// there would focus nothing on screen (checker, 2026-09-27; `findCueTargetIn` skips it too).
		if (table.closest('.chart-sr-only')) continue;
		for (const row of (table as HTMLTableElement).rows) {
			const first = row.cells[0];
			if (!first || loose(first.textContent ?? '') !== label) continue;
			// Value against CELL, not against the row's joined text: cells need not be spaced apart.
			const cells = [...row.cells].slice(1).map((c) => loose(c.textContent ?? ''));
			if (values.some((v) => cells.includes(v))) return first;
		}
	}
	return null;
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
export const UNPAINTED = 'template, [hidden], .chart-sr-only, [data-lattice-desc], title, desc';

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
/** An AUTHORED `.lat-focus`. The Guide's own focus writes `.lat-guide-*`, never this class, so the
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

/** The spoken text of a cue, in the form the DOM would show it (display, not spoken — the
 *  spoken form has acronyms expanded and say-as applied, which the slide does not contain). */
export function cueDisplayText(cue: { words?: { display?: string }[] } | null | undefined): string {
	if (!cue?.words?.length) return '';
	return norm(cue.words.map((w) => w.display ?? '').join(' '));
}

export type Box = { left: number; top: number; width: number; height: number };

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
export function shownSection(doc: Document | null): Document | Element | null {
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

// ── THE FOCUS — one lever: the named thing stays, the rest recedes ─────────────────────────
//
// When the narration names a bullet, a table row, cell or column, a chart mark, a line or one of
// its points, everything ELSE in that group recedes and the named thing keeps its own colors. It
// is the chart hover's emphasis (`chart-interact.js`: every other mark to 0.45, 200 ms), spoken
// in the same language on every element — focus + context, the one attribute the research on
// emphasis asks for (Few; Knaflic; Card, Mackinlay & Shneiderman). It replaces the recolor
// "spark" (owner, 2026-09-26: "spark should be one lever"; "spark is not on brand").
//
// Opacity is the whole lever. It animates on the compositor (smooth at 60 fps), changes no box
// (nothing moves), and — unlike a color — interpolates as a number, so the Chromium defect that
// painted a text spark `oklab(1 200 229)` cannot reach it.
//
// THE HANDOFF IS A STRICT SWAP. The caller runs the previous focus's undo and the next focus in
// one task, so both land in the same frame: a peer of both stays dimmed, the old focus fades down
// as the new one fades up, and there are never two foci. (The recolor's linger put two lit
// elements on screen for 2.0 s a minute — measured, and the owner saw it as jank.)
//
// Classes, never the deck's `_focus` ones (`.lat-focus` / `.lat-recede`), so the Guide's state
// never reads back as authored focus (`authoredFocusOf`). Every value is a preset token on the
// section; no render path writes any of it, so a PDF, a PPTX and an export render exactly as
// before (the rules ship in the CSS bundle and match nothing there). It always returns its own
// undo, which the caller runs on the next gesture, on a slide change and when Guide switches off.

const SERIES_SHAPES = ['path', 'polygon', 'polyline', 'circle', 'line'];
const TEXT_BLOCK = 'p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, td, th';

/** What the narration names for `el` (`unit`, left alone), what recedes around it (`peers` — EMPTY
 *  when nothing stands beside it, or when the deck's own `_focus` already spotlights the group, and
 *  then the moment changes nothing on screen: the narration and the caption carry it), what
 *  recedes further inside it (`inner` — a walked line's other points; the stroke keeps the shape), and the `_focus`-grammar
 *  axis. Null when nothing on the slide has a group to focus in (a figure, an image, a chart's
 *  frame), and the caller falls back to ink. */
export function focusUnit(el: Element): { unit: Element[]; peers: Element[]; inner: Element[]; axis: string } | null {
	const section = el.closest('section');
	if (!section) return null;
	const found = focusUnitIn(section, el);
	// THE DECK'S OWN SPOTLIGHT WINS. A group the author already focused (`_focus:`, which tags
	// `.lat-focus` / `.lat-recede`) keeps the author's depths: the Guide's 0.45 over `_focus`'s 0.24
	// BRIGHTENED the receded items the moment the call-out was spoken, and naming a receded item
	// dimmed the call-out itself (checker, measured in Chromium). The author's focus IS the focus.
	if (found && [...found.unit, ...found.peers, ...found.inner].some((e) => e.matches('.lat-focus, .lat-recede') || !!e.closest('.lat-focus, .lat-recede'))) {
		return { ...found, peers: [], inner: [] };
	}
	return found;
}

/** The labels linked to series `v` (`own`) or to every other series (`!own`) in `chart`. */
function seriesLabels(chart: Element, v: string | null, own: boolean): Element[] {
	return [...chart.querySelectorAll('[data-series-for]')].filter((t) => (t.getAttribute('data-series-for') === v) === own && !t.closest('template'));
}

function focusUnitIn(section: Element, el: Element): { unit: Element[]; peers: Element[]; inner: Element[]; axis: string } | null {
	const painted = (m: Element) => !m.closest('template') && !m.closest(UNPAINTED) && !m.classList.contains('line-hit');
	// One chart's marks, never another's: two charts on a slide both number their marks from 0.
	const chart = el.closest('.chart-body') ?? el.closest('figure.chart-frame') ?? el.closest('svg') ?? section;
	const seriesSel = SERIES_SHAPES.map((t) => `${t}[data-series]`).join(', ');
	// A POINT of a series — one dot named by its own label and value. The other series recede, and
	// inside the focused line its other points recede too; the line's stroke itself stays whole.
	if (el.matches('circle[data-series][data-label]') && chart.querySelector('path.line-path[data-series]')) {
		const v = el.getAttribute('data-series');
		const shapes = [...chart.querySelectorAll(seriesSel)].filter(painted);
		// THE POINT'S CATEGORY ON THE AXIS holds and the other categories recede. A point is a dot a
		// few pixels wide, and at a phone's scale the focus on it read as nothing at all (owner,
		// 2026-09-27); the axis label is text the size of the slide's other labels.
		const cat = el.getAttribute('data-label');
		const cats = [...chart.querySelectorAll('text.cart-cat[data-label]')].filter(painted);
		return {
			unit: [el, ...cats.filter((t) => t.getAttribute('data-label') === cat)],
			peers: [...shapes.filter((m) => m.getAttribute('data-series') !== v), ...seriesLabels(chart, v, false), ...cats.filter((t) => t.getAttribute('data-label') !== cat)],
			inner: shapes.filter((m) => m !== el && m.getAttribute('data-series') === v && m.matches('circle')),
			axis: 'point',
		};
	}
	for (const attr of ['data-mark', 'data-series'] as const) {
		// A series is its SHAPES: radar's container `<div>` also writes `data-series`, as a count,
		// and slope's labels write a palette slot. `focus.js` draws the same line.
		const sel = attr === 'data-series' ? seriesSel : '[data-mark]:not(template)';
		// A label LINKED to a mark (`data-mark-for`: a bar's category name, a group's total) names
		// that mark — the sentence about "FY23" is about FY23's bars, not about the word.
		const v = el.closest(sel)?.getAttribute(attr) ?? (attr === 'data-mark' ? el.closest('[data-mark-for]')?.getAttribute('data-mark-for') : null);
		if (v == null) continue;
		const all = [...chart.querySelectorAll(sel)].filter(painted);
		const unit = all.filter((m) => m.getAttribute(attr) === v);
		if (!unit.length) continue;
		const peers = all.filter((m) => !unit.includes(m));
		// The mark's own labels are part of it: they come up with it if a moment ago they were a peer's.
		// A series' own name and end value (`data-series-for`, line) come and go with it.
		if (attr === 'data-series') {
			unit.push(...seriesLabels(chart, v, true));
			peers.push(...seriesLabels(chart, v, false));
		}
		if (attr === 'data-mark') unit.push(...[...chart.querySelectorAll('[data-mark-for]')].filter((t) => t.getAttribute('data-mark-for') === v && painted(t)));
		// A peer's OWN labels recede with it where the chart links them (`data-mark-for`: a pie's
		// key, a funnel's stage name and value, slope and quadrant labels). A receded wedge beside a
		// full-strength "Maintenance 22%" still read as half-named.
		if (attr === 'data-mark') peers.push(...[...chart.querySelectorAll('[data-mark-for]')].filter((t) => t.getAttribute('data-mark-for') !== v && painted(t)));
		return { unit, peers, inner: [], axis: attr === 'data-mark' ? 'mark' : 'series' };
	}
	// A TABLE names three things, by where the spoken words sit: a header cell names its column,
	// the row's first cell (its label) names the row, and any other body cell names itself. A
	// table with a spanned cell names only the cell: a child index is no longer a column there.
	const cell = el.closest('td, th');
	const row = cell?.parentElement as HTMLTableRowElement | null | undefined;
	const table = cell?.closest('table') as HTMLTableElement | null | undefined;
	if (cell && row && table) {
		const rows = [...table.rows];
		const bodyCells = rows.filter((r) => !r.closest('thead')).flatMap((r) => [...r.cells]);
		const spanned = rows.some((r) => [...r.cells].some((c) => c.colSpan > 1 || c.rowSpan > 1));
		const index = [...row.children].indexOf(cell);
		if (!spanned && cell.closest('thead')) {
			const unit = rows.map((r) => r.cells[index]).filter((c): c is HTMLTableCellElement => !!c);
			// The row labels stay legible: a column is read against them (the `_focus: col` rule).
			return { unit, peers: bodyCells.filter((c) => !unit.includes(c) && c.cellIndex !== 0), inner: [], axis: 'col' };
		}
		if (!spanned && index === 0) {
			const unit = [...row.children];
			return { unit, peers: bodyCells.filter((c) => !unit.includes(c)), inner: [], axis: 'row' };
		}
		return { unit: [cell], peers: bodyCells.filter((c) => c !== cell), inner: [], axis: 'cell' };
	}
	// A BULLET: its siblings recede, and a nested bullet's card's siblings recede with them.
	const li = el.closest('li');
	if (li && section.contains(li)) {
		const peers: Element[] = [];
		for (let at: Element | null = li; at && section.contains(at); at = at.parentElement?.closest('li') ?? null) {
			for (const sib of at.parentElement?.children ?? []) if (sib !== at && sib.tagName === 'LI') peers.push(sib);
		}
		return { unit: [li], peers, inner: [], axis: 'item' };
	}
	// Inside a chart, only a text label names something; a hit area or a frame does not.
	if (el.closest('svg')) return el.matches('text') ? { unit: [el], peers: [], inner: [], axis: 'block' } : null;
	// ANY OTHER TEXT: the block the words sit in, and the text blocks beside it recede. A slide of
	// one paragraph has nothing beside it, and shows nothing — the narration is enough.
	if (el === section || el.matches('img, svg, figure, picture, video, canvas, table')) return null;
	const block = el.matches(TEXT_BLOCK) ? el : (el.closest(TEXT_BLOCK) ?? el);
	if (block.querySelector('p, li, table, [data-mark], [data-series], h1, h2, h3, blockquote')) return null;
	// The slide's headline and eyebrow never recede: they frame the slide, they are not its peers.
	const peers = [...(block.parentElement?.children ?? [])].filter((c) => c !== block && c.matches(TEXT_BLOCK) && !c.matches('h1, h2, h3, h4') && !!(c.textContent ?? '').trim());
	return { unit: [block], peers, inner: [], axis: 'block' };
}

/** Which focus started an element's current fade-up — the only one allowed to end it. */
const fadeOwner = new WeakMap<Element, object>();

/** How deep the rest recedes, how gently a walked line's other points recede, and how long the
 *  crossfade runs — the preset's whole look (`lib/core/resolve-delivery.mjs`). */
export type FocusLook = { dim?: number; dimInner?: number; fade?: number };

/**
 * Focus the content `el` names, and return the undo — or null when nothing on the slide can be
 * focused, so the caller can gesture another way. The undo lifts every peer back (a crossfade
 * over the same `fade`); run the next focus in the same task and the two land as one swap.
 */
export function focusContent(el: Element, look: FocusLook = {}): (() => void) | null {
	const section = el.closest('section') as HTMLElement | null;
	const found = focusUnit(el);
	if (!section || !found) return null;
	return focusParts(section, found, look);
}

/** The parts a focus names and recedes: the ones a bound sentence resolved (`resolveUnit`), or the
 *  ones `focusUnit` reads off an element. */
export type FocusParts = { unit: readonly Element[]; peers: readonly Element[]; inner: readonly Element[] };

/**
 * Focus the given parts on `section` and return the undo. `focusContent` for parts that are
 * already known: a bound sentence's unit comes from its component's scene, not from a guess at
 * the element's axis. The look, the classes and the crossfade are the same ones.
 */
export function focusParts(section: HTMLElement, found: FocusParts, look: FocusLook = {}): () => void {
	const { dim = 0.45, dimInner = 0.3, fade = 200 } = look;
	section.setAttribute('data-guide', '');
	section.style?.setProperty('--guide-dim', String(dim));
	section.style?.setProperty('--guide-dim-inner', String(dimInner));
	section.style?.setProperty('--guide-fade', `${fade}ms`);
	// The named thing comes up if it was down (a peer a moment ago), never down.
	for (const e of found.unit) {
		e.classList.remove('lat-guide-dim', 'lat-guide-dim-inner');
		e.classList.add('lat-guide-undim');
	}
	for (const e of found.peers) {
		e.classList.remove('lat-guide-undim', 'lat-guide-dim-inner');
		e.classList.add('lat-guide-dim');
	}
	for (const e of found.inner) {
		e.classList.remove('lat-guide-undim', 'lat-guide-dim');
		e.classList.add('lat-guide-dim-inner');
	}
	const touched = [...found.unit, ...found.peers, ...found.inner];
	const view = section.ownerDocument?.defaultView;
	// Each fade-up belongs to the focus that started it: a clear left over from an OLDER focus must
	// not strip a newer one's `-undim` mid-crossfade, which snapped the element to full (checker).
	const token = {};
	for (const e of found.unit) fadeOwner.set(e, token);
	let done = false;
	return () => {
		if (done) return;
		done = true;
		for (const e of [...found.peers, ...found.inner]) {
			if (!e.classList.contains('lat-guide-dim') && !e.classList.contains('lat-guide-dim-inner')) continue;
			e.classList.remove('lat-guide-dim', 'lat-guide-dim-inner');
			e.classList.add('lat-guide-undim');
			fadeOwner.set(e, token);
		}
		// The fade-up class leaves once the crossfade is over — except on an element a later focus
		// dimmed again. No timer is ever cancelled; each clear skips what is no longer its own.
		const clear = () => {
			for (const e of touched) {
				if (fadeOwner.get(e) !== token || e.classList.contains('lat-guide-dim') || e.classList.contains('lat-guide-dim-inner')) continue;
				e.classList.remove('lat-guide-undim');
			}
		};
		if (!view) return clear();
		view.setTimeout(clear, fade + 40);
	};
}

// ── THE READ-ALONG — the word being spoken, inside the focus ────────────────────────────────
//
// The focus names the element; the read-along names the word. It runs on the caption's clock
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
		// Only the text the focus names: never an unpainted payload, never a card's nested list
		// (the wash ends before it, so the read-along must too).
		const parent = n.parentElement;
		if (parent?.closest(UNPAINTED)) continue;
		if (parent && parent !== el && parent.closest('ul, ol') && el.contains(parent.closest('ul, ol'))) continue;
		nodes.push({ node: n as Text, start: text.length });
		text += (n as Text).data;
	}
	const hay = text.toLowerCase();
	const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
	// A whole-word hit: nothing word-like on EITHER side, so "North" never lands inside "Northeast".
	const find = (w: string, from: number): number => {
		for (let j = hay.indexOf(w, from); j !== -1; j = hay.indexOf(w, j + 1)) {
			if (!isWordChar(hay[j - 1]) && !isWordChar(hay[j + w.length])) return j;
		}
		return -1;
	};
	const bare = words.map(bareWord);
	// ANCHOR on where this sentence starts: the first position whose next spoken words follow it
	// in order. A paragraph's second sentence otherwise found its first word in the first sentence.
	let from = 0;
	const lead = bare.findIndex(Boolean);
	if (lead !== -1) {
		for (let j = find(bare[lead], 0); j !== -1; j = find(bare[lead], j + 1)) {
			let at = j + bare[lead].length;
			let ok = true;
			for (const w of bare.slice(lead + 1, lead + 3)) {
				if (!w) continue;
				const q = find(w, at);
				// The very next word: only spaces or punctuation between, never another word.
				if (q === -1 || /[\p{L}\p{N}]/u.test(hay.slice(at, q))) {
					ok = false;
					break;
				}
				at = q + w.length;
			}
			if (ok) {
				from = j;
				break;
			}
		}
	}
	let at = from;
	let hit: [number, number] | null = null;
	for (let i = 0; i <= k; i++) {
		const w = bare[i];
		if (!w) continue;
		const j = find(w, at);
		// A word the element lacks is skipped rather than ending the walk.
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
 *  Custom Highlight API, which costs only the read-along, never the focus. */
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


// ── THE DIRECTOR — one focus policy for every surface that plays a deck ─────────────────────
//
// WHICH sentence moves the focus, and when a focus stays, is policy the owner tuned over three
// rounds (§6.1 of the delivery-presets decision): the rest, the resume after a pause, the plan's
// budget, the chart walk, the unplanned sentence and the aside hold. The Studio's Present and the
// exported player both need all of it, so it lives here once. The director owns the FOCUS state
// only (what is named, its undo, the walk, the plan). A caller that also draws ink and a cursor —
// the Studio — keeps that state itself and tells the director what the hand is doing through the
// two callbacks below; the exported player draws no hand and passes nothing.

/** The fields of a delivery preset the focus reads (`lib/core/resolve-delivery.mjs`). */
export type GuideLook = { name: string; budget: number; floor: number; dim: number; dimInner: number; fade: number; hold: string };

/** One sentence of a playing slide, as the director sees it. */
export type GuideBeatInput = {
	/** Which slide is on screen. A resume or a walk never crosses slides. */
	slide: number;
	/** The identity of the slide's cue list; a new one re-plans. */
	track: unknown;
	/** Every cue's display text on the slide (`cueDisplayText`), in order. */
	texts: readonly string[];
	/** The sentence being read, or -1. */
	cue: number;
	/** Its display text ('' when none). */
	text: string;
	/** What the sentence names (`guideAimIn`), or null. */
	aim: Element | null;
	/** The same resolver, for planning the slide's other sentences. */
	aimOf: (text: string) => Element | null;
};

/**
 * What a beat decided.
 *  · `rest`   — the sentence names what is already named: nothing changes.
 *  · `resume` — playing again after a pause: the held focus came back.
 *  · `walk`   — a later sentence inside the chart a planned moment named: it took the focus.
 *  · `idle`   — an unplanned sentence while the caller's hand is still busy: the focus lifted, the
 *               hand keeps what it is doing.
 *  · `clear`  — nothing is named any more: the focus lifted.
 *  · `moment` — a planned moment, or a sentence that names nothing: call `land` next. `top` is
 *               whether it is the slide's top-ranked moment.
 */
export type GuideBeat = { kind: 'rest' | 'resume' | 'walk' | 'idle' | 'clear' } | { kind: 'moment'; top: boolean };

const chartOf = (el: Element | null): Element | null => el?.closest('.chart-body, figure.chart-frame') ?? null;

/** Is `point` (a line dot) inside `band` (that category's `.line-hit` rect)? Read off the SVG's own
 *  attributes, so it needs no layout: the dot's center lies within the band's x-range. */
function inBand(point: Element | null, band: Element): boolean {
	if (!point || !band.matches('rect.line-hit') || point.tagName.toLowerCase() !== 'circle') return false;
	const cx = Number(point.getAttribute('cx'));
	const x = Number(band.getAttribute('x'));
	const w = Number(band.getAttribute('width'));
	return Number.isFinite(cx) && Number.isFinite(x) && Number.isFinite(w) && cx >= x && cx <= x + w;
}

// ── THE SCENE — a bound sentence, expressed in the delivery's own style ─────────────────────
//
// A chart's narrator binds every sentence to an ACT and the UNIT it names (`narrateChartScript`);
// the component's manifest `scene` says how the unit is found; the delivery's style file says what
// the act does (`lib/core/delivery-styles/<name>.mjs`). Nothing here guesses from the words.
// engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md.

/** One bound span of a slide's narration: `[start, end)` over the narration text. */
export type SceneRef = { start: number; end: number; act?: string; unit?: string; id?: Record<string, unknown>; value?: number; label?: string };

/** What a delivery's style asks one act to do (`express(act, ctx)`). */
export type SceneExpression = {
	focus: 'unit' | 'group' | 'reset' | 'hold' | 'none';
	ink: null | { kind: string; on: 'unit' | 'labels' | 'figure' | 'heading'; strength: 'quiet' | 'notable' };
	cursor: 'point' | 'rest' | 'keep' | 'hide';
};

/** The context a style reads: does the sentence name a unit, is it the key beat, is there a label. */
export type SceneContext = { named: boolean; key: boolean; afterKey: boolean; labelled: boolean };

export type SceneStyle = (act: string, ctx: SceneContext) => SceneExpression;

/** The scene a slide's section plays: the first of its classes that names a component with one. */
export function sceneOf(section: Element | null): GuideScene | null {
	if (!section) return null;
	for (const c of section.classList) if (Object.hasOwn(GUIDE_SCENES, c)) return GUIDE_SCENES[c] ?? null;
	return null;
}

/** The ref a cue starting at `at` falls in (the caption track's `charOffset`), or -1. */
export function refAt(refs: readonly SceneRef[], at: number): number {
	return refs.findIndex((r) => at >= r.start && at < r.end);
}

/** One step the scene took: the act, what the style asked, and the parts it resolved to. */
export type SceneStep = {
	act: string;
	expr: SceneExpression;
	/** The resolved parts, null when the sentence names nothing on the slide. */
	hit: { unit: Element[]; labels: Element[]; peers: Element[]; peerLabels: Element[]; fallback: boolean; mark: Element[] } | null;
};

export function createGuideDirector() {
	let aim: Element | null = null;
	let undo: (() => void) | null = null;
	let shown = false;
	let walk: { slide: number; chart: Element } | null = null;
	let resume: { slide: number; aim: Element } | null = null;
	let planned: { slide: number; track: unknown; name: string; plan: SlidePlan; charts: Set<Element> } | null = null;
	let saidDoc: Document | null = null;
	// THE SCENE'S STATE, per slide: the group an `enter` opened (a line's own dots stay near while
	// its other points recede deeper), the key beat's index, and the last parts focused, so a pause
	// on a held sentence comes back to them.
	let scene: { slide: number; refs: readonly SceneRef[]; key: number; group: Element[] | null; parts: FocusParts | null } | null = null;

	const unmark = (): void => {
		undo?.();
		undo = null;
		setSaid(saidDoc, null);
		saidDoc = null;
	};
	const focus = (el: Element, look: GuideLook): void => {
		// The old focus's undo runs in the same task as the new focus, so the two land as one swap.
		unmark();
		undo = focusContent(el, { dim: look.dim, dimInner: look.dimInner, fade: look.fade });
		aim = el;
	};

	return {
		/** What the focus last named, or null. */
		get aim(): Element | null {
			return aim;
		},
		/** Is a focus in force? */
		get marked(): boolean {
			return !!undo;
		},
		/** Is a named thing live on the slide? A caller whose ink lands later sets it then. */
		get shown(): boolean {
			return shown;
		},
		markShown(): void {
			shown = true;
		},
		/** Light the spoken word inside the focus (read-along), or clear it with a null range. */
		say(doc: Document | null, range: Range | null): void {
			if (saidDoc && saidDoc !== doc) setSaid(saidDoc, null);
			saidDoc = doc;
			setSaid(doc, range);
		},
		/**
		 * The deck paused: the slide belongs to the pointer, so the focus lifts. What was focused is
		 * remembered: a block's later sentences keep a focus only by resting on it, so without this
		 * a pause on the second sentence would come back bare.
		 */
		pause(slide: number): void {
			if (aim && undo) resume = { slide, aim };
			aim = null;
			shown = false;
			unmark();
		},
		/** The Guide stopped: forget what was named and the walk (a walk belongs to the run that
		 *  planned it). The plan cache and a pending resume stay. */
		lift(): void {
			aim = null;
			shown = false;
			walk = null;
			scene = null;
			unmark();
		},
		/**
		 * Decide what one sentence does. `handBusy` answers, AFTER the focus has lifted for an
		 * unplanned sentence, whether the caller's hand should keep what it is doing (a stroke still
		 * drawing, a hand resting on a target still on screen); the player passes nothing.
		 */
		beat(b: GuideBeatInput, look: GuideLook, handBusy?: () => boolean): GuideBeat {
			if (b.aim && b.aim === aim && (shown || undo)) return { kind: 'rest' };
			// RESUMING: the sentence still names what was focused at the pause (or is an aside the
			// preset holds through), so that focus comes straight back — focus only, no stroke replayed.
			const back = resume;
			resume = null;
			if (back && back.slide === b.slide && back.aim.isConnected && (b.aim === back.aim || (!b.aim && b.text && isAside(b.text) && look.hold === 'aside'))) {
				focus(back.aim, look);
				shown = true;
				return { kind: 'resume' };
			}
			if (!b.aim) return { kind: 'moment', top: false };
			// THE PLAN: the preset's budget goes to the slide's top-ranked moments, each on the first
			// sentence that names it. Re-planned when this cue resolves now but did not when the plan
			// was made (a chart the runtime drew late).
			if (!planned || planned.slide !== b.slide || planned.track !== b.track || planned.name !== look.name || !planned.plan.aimed.has(b.cue)) {
				const plan = planSlide(b.texts, b.aimOf, look.budget, look.floor);
				// THE CHARTS THIS SLIDE SPENDS A MOMENT ON. A chart that earns a planned moment is walked
				// as ONE moment from its first named mark, not from the planned one: starting at the plan
				// left every earlier sentence about the chart dark (a line's series summary and first
				// point, a dumbbell's first row), which on a phone read as the chart doing nothing (owner,
				// 2026-09-27).
				const charts = new Set<Element>();
				for (const k of plan.gesture) {
					const a = b.aimOf(b.texts[k] ?? '');
					const c = chartOf(a);
					if (c && a?.closest('[data-mark], [data-series]')) charts.add(c);
				}
				planned = { slide: b.slide, track: b.track, name: look.name, plan, charts };
			}
			const plan = planned.plan;
			if (plan.gesture.has(b.cue)) return { kind: 'moment', top: plan.top === b.cue };
			// THE WALK: once a planned moment was a chart mark, every later sentence inside the same
			// chart focuses in turn, as that one moment.
			const inChart = chartOf(b.aim);
			if (inChart && ((walk && walk.slide === b.slide && inChart === walk.chart) || planned.charts.has(inChart))) {
				if (focusUnit(b.aim)) {
					focus(b.aim, look);
					shown = true;
					return { kind: 'walk' };
				}
				// A line category's detail note names that category's hit band, which the focus cannot
				// isolate. When the point up is IN that category, the note is about it, so the focus
				// stays (it used to lift mid-walk). Only then: every other unfocusable aim inside a chart
				// — the chart body a sentence about the whole chart falls back to, a quadrant tint, a
				// radar sector — still lifts the focus (checker: a broader rule held stale foci there).
				if (undo && inBand(aim, b.aim)) return { kind: 'rest' };
			}
			// An unplanned sentence: a focus must not stay on the last block, which nobody is saying.
			unmark();
			if (handBusy?.()) return { kind: 'idle' };
			aim = null;
			shown = false;
			return { kind: 'clear' };
		},
		/**
		 * PLAY ONE BOUND SENTENCE. `refs` is the slide's binding (`narrateChartScript`) and `at` the
		 * cue's `charOffset` into the same text. The delivery's `style` decides what the act does;
		 * the component's scene (`sceneOf`) finds the unit. Returns null when the slide has no
		 * scene or no binding, and the caller reads the words instead (`beat`).
		 */
		scene(b: { slide: number; section: Element | null; refs: readonly SceneRef[] | null | undefined; at: number }, look: GuideLook, style: SceneStyle): SceneStep | null {
			const spec = sceneOf(b.section);
			if (!spec || !b.refs?.length || !b.section) return null;
			const section = b.section as HTMLElement;
			if (!scene || scene.slide !== b.slide || scene.refs !== b.refs) {
				// A new slide starts bare: nothing carries across a slide change.
				if (scene && scene.slide !== b.slide) unmark();
				scene = { slide: b.slide, refs: b.refs, key: keyIndex(b.refs, spec.key), group: null, parts: null };
			}
			resume = null;
			const i = refAt(b.refs, b.at);
			const ref = i >= 0 ? b.refs[i] : null;
			const act = ref?.act ?? 'aside';
			const hit = ref?.unit ? resolveUnit(section, spec.units, ref) : null;
			// A binding that names a unit this render does not draw (a variant the scene does not
			// cover yet) is not the scene's to play: the caller reads the words, as before binding,
			// rather than leave the slide dark (checker, 2026-09-27).
			if (ref?.unit && !hit) return null;
			const labelled = !!(ref?.unit && spec.units[ref.unit]?.labels);
			// An unbound sentence (an aside, leftover prose) sits AFTER the last ref that starts before
			// it, so a pause and resume there still knows the key beat has passed.
			let at = i;
			if (at < 0) for (let j = 0; j < b.refs.length; j++) if ((b.refs[j]?.start ?? Infinity) <= b.at) at = j;
			const expr = style(act, { named: !!hit, key: i >= 0 && i === scene.key, afterKey: scene.key >= 0 && at >= scene.key && i !== scene.key, labelled });
			const apply = (parts: FocusParts): void => {
				unmark();
				undo = focusParts(section, parts, look);
				aim = parts.unit[0] ?? null;
				shown = true;
				if (scene) scene.parts = parts;
			};
			if (expr.focus === 'reset') {
				unmark();
				aim = null;
				shown = false;
				scene.group = null;
				scene.parts = null;
			} else if ((expr.focus === 'unit' || expr.focus === 'group') && hit) {
				const unit = [...hit.unit, ...hit.labels];
				const others = [...hit.peers, ...hit.peerLabels];
				// Inside an opened group, the group's other units recede deeper than the rest: the line
				// being walked keeps its shape, and the point being read stands out on it.
				const group = expr.focus === 'unit' && scene.group ? new Set(scene.group) : null;
				apply({ unit, peers: group ? others.filter((e) => !group.has(e)) : others, inner: group ? others.filter((e) => group.has(e)) : [] });
				if (expr.focus === 'group') scene.group = hit.unit;
			} else if (expr.focus === 'hold' && !undo && scene.parts) {
				// A pause lifted the focus on a sentence that holds: bring back what it held.
				apply(scene.parts);
			}
			return { act, expr, hit };
		},
		/**
		 * Land a `moment` on `el` — the element the caller confirmed it can show (the player passes
		 * the aim itself) — or on nothing. THE HOLD: an aside that names nothing ("Thank you.") keeps
		 * the focus that is up, when the hand is resting or the preset holds through asides (somber's
		 * tempo); a longer sentence that names nothing is commentary, and the focus leaves.
		 */
		land(el: Element | null, text: string, slide: number, look: GuideLook, handUp = false): 'hold' | 'clear' | 'focused' {
			if (!el && text && isAside(text) && shown && guideStillShown(aim) && (handUp || look.hold === 'aside')) return 'hold';
			if (!el) {
				aim = null;
				shown = false;
				unmark();
				return 'clear';
			}
			focus(el, look);
			const chart = chartOf(el);
			walk = chart && el.closest('[data-mark], [data-series]') ? { slide, chart } : null;
			return 'focused';
		},
	};
}

export type GuideDirector = ReturnType<typeof createGuideDirector>;
