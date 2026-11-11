// THE DECK'S `class:` AS A SLIDE RECEIVES IT, for the readers that ask whether a picture is a slide's placed photo
// (lib/core/placed-picture.mjs): Compose's Placement control and badge, and the Studio's photo finder.
//
// The engine appends a deck's top-level `class:` to every slide's own classes after dropping any component name from it
// (lib/core/deck-class-register.js), so a deck-wide `bleed` places every slide's picture and a deck-wide `image` or `collage`
// changes nothing. Quotes go, as the engine strips them; brackets and commas stay, as it keeps them (`class: [bleed]` places
// nothing there, so nothing here: inversion F6 on #3126). The component names are the stage catalog's keys, as
// image-objects.ts `canPlaceOn` reads them, a generated table with no imports of its own.

import STAGE_CATALOG from '../../../lib/forms/cell/masthead/stage-catalog.generated.js';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** The front matter's top-level `class:` tokens as written, or []. Takes a front-matter block or a whole deck. */
export function deckClassWords(frontMatterOrSource: string): string[] {
	const text = String(frontMatterOrSource || '');
	const fm = FRONT_MATTER.exec(text)?.[1] ?? text;
	const line = /^class[ \t]*:(.*)$/m.exec(fm);
	return line ? line[1].replace(/["']/g, ' ').trim().split(/\s+/).filter(Boolean) : [];
}

/** The deck's `class:` tokens a slide receives: every word but a component name. */
export function deckPlacingClasses(frontMatterOrSource: string): string[] {
	return deckClassWords(frontMatterOrSource).filter((t) => !Object.hasOwn(STAGE_CATALOG as Record<string, string>, t));
}
