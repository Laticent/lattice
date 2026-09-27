import { getFrontMatterName, writeFrontMatterLine } from './front-matter';

// THE ROOM A DECK IS SHOWN IN — the `venue:` front-matter register, as the Studio offers it.
//
// A venue is an intentional setting, like desktop zoom: every slide renders at its size, and
// nothing shrinks a slide or the deck to fit (owner ruling 2026-09-27; engineering/typography.md
// §7). So the Studio lets the author PICK it (deck settings → Look → Venue), lets a presenter
// change it for one showing (the Present stage's venue switch), and, when a slide is too full for
// it, offers the next venue down as one of two one-click fixes. It never picks one by itself: a
// browser sees the screen, not the room.
//
// ONE TABLE for all three, pinned to the engine's resolver (lib/core/resolve-venue.js
// VENUE_SCALE) by venue.test.ts, so the menu cannot offer a venue the engine does not know.

export type VenueName = 'laptop' | 'huddle' | 'conference' | 'hall';

export type VenueOption = { value: VenueName; label: string; scale: number; who: string };

/** Smallest room first — the order the menus list them in and `smallerVenue` walks. */
export const VENUES: readonly VenueOption[] = [
	{ value: 'laptop', label: 'Laptop', scale: 1, who: 'Your own screen' },
	{ value: 'huddle', label: 'Huddle', scale: 1.15, who: '4–6 people around a TV' },
	{ value: 'conference', label: 'Conference', scale: 1.3, who: '10–30 people' },
	{ value: 'hall', label: 'Hall', scale: 1.5, who: '50–2,000 people' },
];

const byName = new Map(VENUES.map((v) => [v.value, v]));

/** The deck's venue as written, or null when `venue:` is absent or not one the engine knows
 *  (an unknown value renders at the designed size, like no venue at all). */
export function deckVenue(source: string): VenueName | null {
	// `getFrontMatterName` strips a trailing `# comment`, as the engine's reader does
	// (lib/core/front-matter-key.js), so `venue: hall  # big room` reads as hall here too.
	const raw = (getFrontMatterName(source, 'venue') || '').trim().toLowerCase();
	return byName.has(raw as VenueName) ? (raw as VenueName) : null;
}

export function venueOption(name: VenueName | null): VenueOption | null {
	return name ? (byName.get(name) ?? null) : null;
}

/** The next room down, or null at laptop / no venue — nothing smaller to offer. */
export function smallerVenue(name: VenueName | null): VenueOption | null {
	const i = name ? VENUES.findIndex((v) => v.value === name) : -1;
	return i > 0 ? VENUES[i - 1] : null;
}

/** Write `venue:` into a source (or a front-matter block); null removes it — the "Default". */
export function withVenue(source: string, name: VenueName | null): string {
	return writeFrontMatterLine(source, 'venue', name);
}
