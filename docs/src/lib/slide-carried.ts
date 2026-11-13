// WHAT A SLIDE INHERITS, for the Studio's text readers that ask whether a picture is the slide's placed photo: the photo
// finder (components/studio/card-ink-pick.ts `photoAt`) and through it the photo checks, the ink fix and the slide context.
// Each of them holds one slide's text, so a running `<!-- class: image -->` or a `backgroundImage` set on an earlier slide or
// in the front matter was out of their sight, and the Studio placed a picture the engine did not, or missed one it did.
// This reads the WHOLE deck: the Studio's own slide units (deck-lint.ts `slideRanges`, the separators the engine splits on)
// handed in order to the carry walk Export-to-Marp asks too (lib/core/slide-carried.mjs). A `split: headings` part is not a
// unit of its own yet (followups.d/3126-p3-studio-heading-split-photo.md).
// Compose reads the same carries from its document (lib/compose/image-objects.ts), and the shared table holds all of them
// to the engine (test/fixtures/placed-picture-cases.json).

import { boundaryParser } from '../../../lib/core/boundary-parser.mjs';
import { slidesCarried } from '../../../lib/core/slide-carried.mjs';
import { slideRanges } from './deck-lint';
import { deckPlacingClasses } from './deck-placing-classes';
import { stripFrontMatter } from './front-matter';
import { getClassTokens } from './slide-directives';

/** The classes the engine resolves for a slide, and whether a carried background is already its photo. */
export type SlidePlacing = { classes: string[]; backgroundImage: boolean };

/**
 * What the slide whose text starts at `offset` in `source` inherits, as the engine resolves it: its own `_class` (else the
 * carried `class:`) plus the deck's `class:` without its component names, and the carried background. Null when `offset`
 * is in no slide (the front matter).
 */
export function slidePlacingAt(source: string, offset: number): SlidePlacing | null {
	const text = String(source ?? '');
	const body = stripFrontMatter(text);
	const head = text.length - body.length;
	const ranges = slideRanges(body);
	const at = offset - head;
	if (at < 0) return null;
	// The last slide that starts at or before the offset (an offset on a separator belongs to the slide before it).
	let i = -1;
	for (let k = 0; k < ranges.length && ranges[k].from <= at; k++) i = k;
	if (i < 0) return null;
	// Only a slide holding a comment can carry anything, so only those are copied out: a deck of pasted phone photos is many
	// megabytes, and this runs on the Studio's main thread on every slide change.
	const slides = ranges.slice(0, i + 1).map((r) => {
		const c = body.indexOf('<!--', r.from);
		return c >= 0 && c < r.to ? body.slice(r.from, r.to) : '';
	});
	const carried = slidesCarried(text.slice(0, head), slides, boundaryParser)[i];
	const own = getClassTokens(slides[i]);
	return { classes: [...(own.length ? own : (carried.carriedClass ?? [])), ...deckPlacingClasses(text)], backgroundImage: carried.backgroundImage };
}

/** The same, for a slide given by its text: its first occurrence in `source` (two identical slides inherit alike unless a
 *  carried directive sits between them, where this reads the first). Null when the text is not in the deck. */
export function slidePlacingOf(source: string, chunk: string): SlidePlacing | null {
	const text = String(source ?? '');
	const body = stripFrontMatter(text);
	const want = String(chunk ?? '').trim();
	if (!want) return null;
	const at = body.indexOf(want);
	return at < 0 ? null : slidePlacingAt(text, text.length - body.length + at);
}
