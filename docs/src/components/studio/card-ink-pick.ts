import { buildDeckIndex } from '@/lib/deck-outline';
import { flatPart, partStart, partText } from '@/lib/fuoco/outline';
import { boundaryParser } from '../../../../lib/core/boundary-parser.mjs';
import { compositionOf, effectiveCard, inkOf, needsInk, pickCardInk, THIN_BACKING } from '../../../../lib/core/card-ink.mjs';
import { headingPartStarts, placedPictureInSlide } from '../../../../lib/core/placed-picture.mjs';
import { deckPlacingClasses } from '../../lib/deck-placing-classes';
import { type SlidePlacing, slidePlacingAt, slidePlacingOf } from '../../lib/slide-carried';
import { getClassTokens } from '../../lib/slide-directives';
import { type Rgb, sampleBehindCard } from './card-ink-sampler';
import { deckImageCardClasses, setImageCard } from './deck-axes';

// The Card backing slider's "pick an ink" step, in one module the Studio loads when an image slide
// opens: the kernel (lib/core/card-ink.mjs) and the photo sampler weigh about a kilobyte gzipped
// between them, and only an image slide's slider needs either, so none of it rides the shell.
//
// The photo is read AHEAD of the drag (`readBehindCard`), so each slider step can decide the ink
// synchronously and write it with the backing in ONE edit. That keeps one Undo step per drag
// step, and means an ink is only ever written for the opacity the card has at that step.

export type Ink = 'light' | 'dark';

// Which composition a class list names (null when none is): the kernel's, pinned to the engine's by a test.
export { compositionOf };

/** The destination right after an opening `](` at `from`, as written: `<a b.jpg>` with spaces, or a bare one with balanced
 *  parentheses (`img/(1).jpg`). Null when it cannot be read. */
function destinationAt(chunk: string, from: number): string | null {
	if (chunk.startsWith('<', from)) {
		const end = chunk.indexOf('>', from);
		return end > from ? chunk.slice(from + 1, end) : null;
	}
	// From one parenthesis or space to the next, not a character at a time: a phone photo's address is megabytes of base64
	// with none in it, and the per-character walk took about 0.35 s of a paste in Firefox (PR #3153, Gecko profile).
	const stop = /[()\s]/g;
	stop.lastIndex = from;
	let depth = 0;
	for (let m = stop.exec(chunk); m; m = stop.exec(chunk)) {
		if (m[0] === '(') depth++;
		else if (m[0] === ')') {
			if (depth === 0) return chunk.slice(from, m.index) || null;
			depth--;
		} else if (depth === 0) return chunk.slice(from, m.index) || null;
	}
	return null;
}

/** A record's address: its first value, quoted (`"a b.jpg"`, with `\"` and `\\` escapes) or bare (up to `,` or `}`). */
function recordAddress(body: string): string | null {
	const t = body.trimStart();
	if (t.startsWith('"')) {
		let out = '';
		for (let i = 1; i < t.length; i++) {
			if (t[i] === '\\' && i + 1 < t.length) out += t[++i];
			else if (t[i] === '"') return out || null;
			else out += t[i];
		}
		return null;
	}
	const end = t.search(/[,}]/);
	return (end < 0 ? t : t.slice(0, end)).trim() || null;
}

/**
 * The slide's photo, as written, and where its line starts: a lone `@image{dest, …}` record, or, on a slide that places a
 * picture (`image`, `bleed`), a lone `![title](dest)`, the record's shortcut since 2026-11-10. The engine draws both as the
 * slide's photo panel; a Marp `![bg …](dest)` is an ordinary picture to it since the engine break (2026-11-13), so it is no
 * photo here either. Null when the slide has none, or its address cannot be read (the caller then
 * skips the photo check rather than guess). `placing`: what the slide inherits from the whole deck (lib/slide-carried.ts
 * `slidePlacingAt` / `slidePlacingOf`): the classes the engine resolves for it (its own or the carried `class:`, plus the
 * deck's), and whether a carried background is already its photo. A bare class list is the classes the slide receives
 * besides the `_class` in `chunk` (the deck's `class:` tokens), for a caller with no deck in hand.
 *
 * A unit the engine draws as several slides (`split: headings`, `placing.parts`) is read part by part, each with its own
 * placing, and this is the first part's photo that has one; `photosAt` gives every part's.
 */
export function photoAt(chunk: string, placing: SlidePlacing | readonly string[] = []): { ref: string; index: number } | null {
	for (const found of photosAt(chunk, placing)) if (found) return found;
	return null;
}

/** Each engine slide's photo in this unit, in order (one entry when the unit is one slide). `index` is in `chunk`. */
export function photosAt(chunk: string, placing: SlidePlacing | readonly string[] = []): Array<{ ref: string; index: number } | null> {
	const parts = isPlacing(placing) ? placing.parts : undefined;
	if (parts && parts.length > 1) {
		const starts = headingPartStarts(chunk, boundaryParser);
		// The parts are cut by the same call as the placings; a chunk that cuts otherwise (an edit in flight) is read whole.
		if (starts.length === parts.length) {
			return starts.map((from, k) => {
				const found = photoInSlide(chunk.slice(from, starts[k + 1] ?? chunk.length), parts[k]);
				return found ? { ref: found.ref, index: found.index + from } : null;
			});
		}
	}
	return [photoInSlide(chunk, placing)];
}

function photoInSlide(chunk: string, placing: SlidePlacing | readonly string[]): { ref: string; index: number } | null {
	const rec = /^[ \t]*`@image\{([^`\n]*)\}`[ \t]*$/m.exec(chunk);
	if (rec) {
		const ref = recordAddress(rec[1]);
		return ref ? { ref, index: rec.index } : null;
	}
	// The shortcut: whether a lone picture is the slide's photo is the engine's rule, asked of the one kernel every reader asks
	// (lib/core/placed-picture.mjs). It names the picture's line, and the address is read there as written.
	const classes = isPlacing(placing) ? placing.classes : [...getClassTokens(chunk), ...placing];
	const backgroundImage = isPlacing(placing) && placing.backgroundImage;
	const placed = placedPictureInSlide(chunk, classes, { md: boundaryParser, backgroundImage });
	if (!placed) return null;
	const lineStart = placed.line <= 0 ? 0 : chunk.split('\n').slice(0, placed.line).join('\n').length + 1;
	const open = chunk.indexOf('![', lineStart);
	if (open < 0) return null;
	const close = /^!\[[^\]\n]*\]\(/.exec(chunk.slice(open));
	const ref = close ? destinationAt(chunk, open + close[0].length) : null;
	return ref ? { ref, index: open } : null;
}

const isPlacing = (p: SlidePlacing | readonly string[]): p is SlidePlacing => !Array.isArray(p);

/** The slide's photo address as written (see `photoAt`), or null. `source`: the whole deck, so the slide's inherited class
 *  and background are read as the engine reads them. */
export function photoRefOf(chunk: string, source = '', at?: number): string | null {
	// `at`: where the slide starts in `source`, when the caller knows it. Without it the slide is found by its text, which an
	// identical earlier slide answers for, with what THAT slide inherits (the checker on #3239).
	const placing = source ? (at === undefined ? slidePlacingOf(source, chunk) : slidePlacingAt(source, at)) : null;
	return photoAt(chunk, placing ?? (source ? deckPlacingClasses(source) : []))?.ref ?? null;
}

/** The slide's own first heading as written in the source (`## A photo.`), for the preview identity check. */
export function headingOf(chunk: string): string | null {
	return /^#{1,6}[ \t]+(.+)$/m.exec(chunk)?.[1]?.trim() ?? null;
}

/**
 * The colour behind this slide's card, or null when the preview cannot say. `slideNumber` is the `---` slide's (1-based). A
 * slide split on its headings is several engine slides: the card read is the part the Slide panel's class edits land in (the
 * first with a `_class` of its own, else the first). The preview frame holds the slide on screen; the heading and the photo
 * address say whether it is this part, and the read is null when it is not.
 */
export function readBehindCard(chunk: string, slideNumber: number, source = ''): Promise<Rgb | null> {
	let part = chunk;
	let section = slideNumber;
	let at: number | undefined;
	if (source) {
		const ix = buildDeckIndex(source);
		const u = slideNumber - 1;
		const unit = ix.units[u];
		if (unit) {
			// The part the panel's class edit lands in: a whole-slide class edit changes the FIRST `_class` comment, which is a later
			// part's when the first has none (the checker on #3239). So the card read is that part's photo.
			let k = 0;
			if (unit.parts.length > 1) {
				const owner = unit.parts.findIndex((_, i) => getClassTokens(partText(ix, u, i)).length > 0);
				k = owner < 0 ? 0 : owner;
				part = partText(ix, u, k);
			}
			section = flatPart(ix, u, k) + 1;
			at = partStart(ix, u, k);
		}
	}
	return sampleBehindCard(section, headingOf(part), photoRefOf(part, source, at), getClassTokens(part));
}

/**
 * Whether this slide has a thin spotlight card with no ink on the slide or the deck line. A
 * composition the slide NAMES decides (a statement's ink is fixed, so it never needs one); an
 * unnamed one is resolved from the photo, so it is assumed here and the sampler, which reads the
 * composition the preview used, has the last word.
 */
export function slideNeedsInk(chunk: string, source: string): boolean {
	const tokens = getClassTokens(chunk);
	return needsInk(tokens, deckImageCardClasses(source), compositionOf(tokens) ?? 'spotlight');
}

/** Whether the slide itself names an ink. */
export function slideHasInk(chunk: string): boolean {
	return inkOf(getClassTokens(chunk)) !== null;
}

export type BackingEdit = { chunk: string; picked: Ink | null; removed: boolean };

/**
 * The slide with its backing set to `word` (null returns it to Auto), and the ink that goes with it.
 * `behind` is the photo's colour behind the card, when it has been read; `autoInk` is the ink this
 * Studio session wrote for the slide itself, if any.
 *   - thin, no ink anywhere, photo known: write the ink that reads better on it, and keep re-picking it
 *     as the card thins further, for as long as the ink on the slide is the one we wrote;
 *   - no longer thin, and the slide's ink is the one we wrote: take it back out, because an ink
 *     class also swaps the card's FILL, and a card that is not thin never needed it.
 * An ink the author set is never touched: it is not `autoInk`, or `slideNeedsInk` is false.
 */
export function applyBacking(chunk: string, source: string, word: string | null, behind: Rgb | null, autoInk: Ink | null): BackingEdit {
	let next = setImageCard(chunk, 'backing', word);
	const { backing } = effectiveCard(getClassTokens(next), deckImageCardClasses(source));
	const ownInk = autoInk && inkOf(getClassTokens(next)) === autoInk;
	// Thin with no ink, or thin with the ink THIS session picked: (re)pick for the opacity the card has
	// now, because the better ink can change as the card thins and the photo shows through more.
	if (behind && (slideNeedsInk(next, source) || (ownInk && backing < THIN_BACKING))) {
		const picked = pickCardInk(behind, backing).ink as Ink;
		return { chunk: setImageCard(next, 'ink', picked), picked, removed: false };
	}
	if (ownInk && backing >= THIN_BACKING) {
		next = setImageCard(next, 'ink', null);
		return { chunk: next, picked: null, removed: true };
	}
	return { chunk: next, picked: null, removed: false };
}

/**
 * A read that landed after the backing was written (the photo was not read ahead): the slide as it
 * is NOW. The ink is written only if the card is thin and still names no ink at this moment.
 */
export function applyLateRead(chunk: string, source: string, behind: Rgb): { chunk: string; picked: Ink | null } {
	if (!slideNeedsInk(chunk, source)) return { chunk, picked: null };
	const { backing } = effectiveCard(getClassTokens(chunk), deckImageCardClasses(source));
	const picked = pickCardInk(behind, backing).ink as Ink;
	return { chunk: setImageCard(chunk, 'ink', picked), picked };
}
