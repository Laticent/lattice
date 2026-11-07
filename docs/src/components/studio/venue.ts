import { getFrontMatterName, writeFrontMatterLine } from '../../lib/front-matter';

// WHERE A DECK IS SEEN — the `venue:` front-matter register, as the Studio offers it.
//
// A venue is an intentional setting, like desktop zoom: every slide renders at its size, and
// nothing shrinks a slide or the deck to fit (owner ruling 2026-09-27; engineering/typography.md
// §7). So the Studio lets the author PICK it (deck settings → Look → Venue), lets a presenter
// change it for one showing (the Present stage's venue switch), and, when a slide is too full for
// it, offers a smaller venue as one of two one-click fixes. It never picks one by itself: a
// browser sees the screen, not the room.
//
// THE SHAPE DECIDES THE STEP (owner ruling 2026-11-05; fit-everywhere-model.md §18). The four
// rooms are measured for a 16:9 deck on a projected screen; a square post or a story is read in a
// hand, so `phone` and `tablet` name that, and `phone` is the DEFAULT on a square, tall or strip
// deck. One table, mirrored from the engine (lib/core/resolve-venue.js VENUE_SCALE_BY_FAMILY) and
// pinned to it by venue.test.ts, so the menu cannot offer a step the engine does not render.

export type VenueName = 'laptop' | 'huddle' | 'conference' | 'hall' | 'phone' | 'tablet';
export type Family = 'wide' | 'square' | 'tall' | 'strip';

export type VenueOption = { value: VenueName; label: string; scale: number; who: string };

const WHO: Record<VenueName, { label: string; who: string }> = {
	phone: { label: 'Phone', who: 'Read in a hand: a feed, a story' },
	tablet: { label: 'Tablet', who: 'A tablet held upright' },
	laptop: { label: 'Laptop', who: 'Your own screen' },
	huddle: { label: 'Huddle', who: '4–6 people around a TV' },
	conference: { label: 'Conference', who: '10–30 people' },
	hall: { label: 'Hall', who: '50–2,000 people' },
};

/** The type step each venue renders at, by the deck's shape family — the engine's table. */
export const VENUE_SCALE_BY_FAMILY: Record<Family, Record<VenueName, number>> = {
	wide: { laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5, phone: 1, tablet: 1 },
	square: { laptop: 1, huddle: 1.15, conference: 1.3, hall: 1.5, phone: 1.5, tablet: 0.75 },
	tall: { laptop: 1, huddle: 1.1, conference: 1.17, hall: 1.22, phone: 1, tablet: 0.6 },
	strip: { laptop: 1, huddle: 1.1, conference: 1.17, hall: 1.22, phone: 1, tablet: 0.72 },
};

/** The shape family a slide of this aspect (width / height) is — lib/adaptive/families.js BOUNDARIES. */
export function familyForAspect(aspect: number): Family {
	if (aspect > 1.05) return 'wide';
	if (aspect > 0.9) return 'square';
	if (aspect > 0.5) return 'tall';
	return 'strip';
}

/** The venue a deck of this family renders at when it names none. */
export function defaultVenue(family: Family): VenueName {
	return family === 'wide' ? 'laptop' : 'phone';
}

/** The venues the menus offer for this shape, smallest step first. A 16:9 deck is not read in a
 *  hand, so it is offered the rooms only; a social shape is offered all six. */
export function venueOptionsFor(family: Family = 'wide'): VenueOption[] {
	const names: VenueName[] = family === 'wide' ? ['laptop', 'huddle', 'conference', 'hall'] : ['tablet', 'phone', 'laptop', 'huddle', 'conference', 'hall'];
	return names
		.map((value) => ({ value, ...WHO[value], scale: VENUE_SCALE_BY_FAMILY[family][value] }))
		.sort((a, b) => a.scale - b.scale);
}

/** The 16:9 menu, smallest room first (kept for callers that know the deck is wide). */
export const VENUES: readonly VenueOption[] = venueOptionsFor('wide');

const NAMES = new Set<string>(Object.keys(WHO));

/** The deck's venue as written, or null when `venue:` is absent or not one the engine knows
 *  (an unknown value renders at the shape's default, like no venue at all). */
export function deckVenue(source: string): VenueName | null {
	// `getFrontMatterName` strips a trailing `# comment`, as the engine's reader does
	// (lib/core/front-matter-key.js), so `venue: hall  # big room` reads as hall here too.
	const raw = (getFrontMatterName(source, 'venue') || '').trim().toLowerCase();
	return NAMES.has(raw) ? (raw as VenueName) : null;
}

export function venueOption(name: VenueName | null, family: Family = 'wide'): VenueOption | null {
	return name ? { value: name, ...WHO[name], scale: VENUE_SCALE_BY_FAMILY[family][name] } : null;
}

/** The next smaller step down from this venue (or the shape's default when none is named), or null
 *  when nothing smaller is on offer. Venues at the same step are skipped: a square deck's phone and
 *  hall are both x1.5, so the step down from either is conference. */
export function smallerVenue(name: VenueName | null, family: Family = 'wide'): VenueOption | null {
	const at = VENUE_SCALE_BY_FAMILY[family][name ?? defaultVenue(family)];
	const below = venueOptionsFor(family).filter((v) => v.scale < at);
	// The largest step under it; among equal steps, the room (a named audience) over a handheld one.
	return below.length ? below.reduce((best, v) => (v.scale > best.scale || (v.scale === best.scale && v.value !== 'tablet') ? v : best)) : null;
}

/** Write `venue:` into a source (or a front-matter block); null removes it — the "Default". */
export function withVenue(source: string, name: VenueName | null): string {
	return writeFrontMatterLine(source, 'venue', name);
}
