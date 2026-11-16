// WHAT A SLIDE INHERITS, for the Studio's text readers that ask whether a picture is the slide's placed photo: the photo
// finder (components/studio/card-ink-pick.ts `photoAt`) and through it the photo checks, the ink fix and the slide context.
// Each of them holds one slide's text, so a running `<!-- class: image -->` or a `backgroundImage` set on an earlier slide or
// in the front matter was out of their sight, and the Studio placed a picture the engine did not, or missed one it did.
// This reads the WHOLE deck: the Studio's own slide units (deck-lint.ts `slideRanges`, the separators the engine splits on)
// handed in order to the carry walk Export-to-Marp asks too (lib/core/slide-carried.mjs). Under `split: headings` (the
// default) one unit can be several engine slides: the walk reads each heading part as the slide it is, so a `_class` in the
// first part stays there and a running `class:` carries into the next (lib/core/placed-picture.mjs `headingPartStarts`).
// Compose reads the same carries from its document (lib/compose/image-objects.ts), and the shared table holds all of them
// to the engine (test/fixtures/placed-picture-cases.json).

import { boundaryParser } from '../../../lib/core/boundary-parser.mjs';
import { headingPartStarts } from '../../../lib/core/placed-picture.mjs';
import { resolveSplitMode } from '../../../lib/core/resolve-split.mjs';
import { slidesCarried } from '../../../lib/core/slide-carried.mjs';
import { slideRanges } from './deck-lint';
import { deckPlacingClasses } from './deck-placing-classes';
import { stripFrontMatter } from './front-matter';
import { getClassTokens } from './slide-directives';

/** The classes the engine resolves for a slide, and whether a carried background is already its photo. `parts`: when the unit
 *  is several engine slides (`split: headings`), each part's own placing in order; the top-level fields are the part asked. */
export type SlidePlacing = { classes: string[]; backgroundImage: boolean; parts?: SlidePlacing[] };

/** Where each heading part of one unit starts, in the unit's text: `[0]` when the deck splits on `---` alone. */
export function unitPartStarts(source: string, unit: string): number[] {
	return resolveSplitMode(String(source ?? '')) === 'headings' ? headingPartStarts(unit, boundaryParser) : [0];
}

/**
 * Each part's placing for one unit: `before` holds the earlier slides' texts (only their comments are read), `parts` this
 * unit's heading parts. Compose asks this too, from its document (lib/compose/image-objects.ts).
 */
export function partPlacings(frontMatter: string, before: readonly string[], parts: readonly string[], deckClasses: readonly string[]): SlidePlacing[] {
	const own = parts.map((p) => (p.includes('<!--') ? p : ''));
	const carried = slidesCarried(frontMatter, [...before, ...own], boundaryParser).slice(before.length);
	return parts.map((_p, k) => {
		const mine = getClassTokens(own[k]);
		return { classes: [...(mine.length ? mine : (carried[k].carriedClass ?? [])), ...deckClasses], backgroundImage: carried[k].backgroundImage };
	});
}

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
	const before = ranges.slice(0, i).map((r) => {
		const c = body.indexOf('<!--', r.from);
		return c >= 0 && c < r.to ? body.slice(r.from, r.to) : '';
	});
	const unit = body.slice(ranges[i].from, ranges[i].to);
	const starts = unitPartStarts(text, unit);
	const parts = starts.map((s, k) => unit.slice(s, starts[k + 1] ?? unit.length));
	const placings = partPlacings(text.slice(0, head), before, parts, deckPlacingClasses(text));
	// The part holding the offset (an offset before the unit's first character is its first part).
	let k = 0;
	while (k + 1 < starts.length && starts[k + 1] <= at - ranges[i].from) k++;
	return placings.length > 1 ? { ...placings[k], parts: placings } : placings[0];
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
