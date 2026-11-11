import { compositionOf, effectiveCard, inkOf, needsInk, pickCardInk, THIN_BACKING } from '../../../../lib/core/card-ink.mjs';
import { getClassTokens } from '../../lib/slide-directives';
import { type Rgb, sampleBehindCard } from './card-ink-sampler';
import { deckImageCardClasses, setImageCard } from './slide-provenance';

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
	const rest = chunk.slice(from);
	if (rest.startsWith('<')) {
		const end = rest.indexOf('>');
		return end > 0 ? rest.slice(1, end) : null;
	}
	let depth = 0;
	for (let i = 0; i < rest.length; i++) {
		const ch = rest[i];
		if (ch === '(') depth++;
		else if (ch === ')') {
			if (depth === 0) return rest.slice(0, i) || null;
			depth--;
		} else if (/\s/.test(ch) && depth === 0) return rest.slice(0, i) || null;
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
 * The slide's photo, as written, and where its line starts: an old `![bg …](dest)`, a lone `@image{dest, …}` record, or, on a
 * slide that places a picture (`image`, `bleed`), a lone `![title](dest)`, the record's shortcut since 2026-11-10. The engine
 * draws all three as the slide's photo panel. Null when the slide has none, or its address cannot be read (the caller then
 * skips the photo check rather than guess).
 */
export function photoAt(chunk: string): { ref: string; index: number } | null {
	const bg = /!\[bg[^\]]*\]\(/.exec(chunk);
	if (bg) {
		const ref = destinationAt(chunk, bg.index + bg[0].length);
		return ref ? { ref, index: bg.index } : null;
	}
	const rec = /^[ \t]*`@image\{([^`\n]*)\}`[ \t]*$/m.exec(chunk);
	if (rec) {
		const ref = recordAddress(rec[1]);
		return ref ? { ref, index: rec.index } : null;
	}
	const tokens = getClassTokens(chunk);
	if ((!tokens.includes('image') && !tokens.includes('bleed')) || tokens.includes('collage')) return null;
	// The whole line is the picture, as the engine places it (a picture with words after it stays in the text), and only the
	// slide's ONE such picture: with two, the engine places neither, and a collage packs them as tiles (inversion, F10).
	const pics = [...chunk.matchAll(/^[ \t]{0,3}!\[[^\]\n]*\]\((?=[^\n]*\)[ \t]*$)/gm)];
	if (pics.length !== 1) return null;
	const pic = pics[0];
	const ref = destinationAt(chunk, pic.index + pic[0].length);
	return ref ? { ref, index: pic.index } : null;
}

/** The slide's photo address as written (see `photoAt`), or null. */
export function photoRefOf(chunk: string): string | null {
	return photoAt(chunk)?.ref ?? null;
}

/** The slide's own first heading as written in the source (`## A photo.`), for the preview identity check. */
export function headingOf(chunk: string): string | null {
	return /^#{1,6}[ \t]+(.+)$/m.exec(chunk)?.[1]?.trim() ?? null;
}

/** The colour behind this slide's card, or null when the preview cannot say. */
export function readBehindCard(chunk: string, slideNumber: number): Promise<Rgb | null> {
	return sampleBehindCard(slideNumber, headingOf(chunk), photoRefOf(chunk), getClassTokens(chunk));
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
