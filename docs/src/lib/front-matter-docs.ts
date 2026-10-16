// What the front-matter REFERENCE page says about each key: which Settings section the key
// lives in, its default, the per-slide form, and where it takes effect.
//
// A VIEW of the engine's table (lib/core/deck-settings.js) since 2026-10-16: the columns below
// are fields of each row there, so the reference page, the editor's key list and the linter
// read one table. GROUPS stays here: it is how this page lays the table out.
import { OFFERED_SETTINGS } from '../components/studio/front-matter-keys';

export type FrontMatterGroup = 'general' | 'look' | 'chrome' | 'accent' | 'motion' | 'speech' | 'export' | 'raw' | 'developer';

export type FrontMatterDoc = {
	group: FrontMatterGroup;
	/** The value in force when the key is absent. */
	default: string;
	/** Settings → Deck → <section> → <label>, when the Studio has a control. */
	studio?: string;
	/** The per-slide spelling, when one exists. */
	slide?: string;
	/** Where the key takes effect, when it is narrower than "every render". */
	scope?: string;
	/** Free-form accepted values, for keys with no fixed vocabulary. */
	values?: string;
};

// Ordered as the Studio's Settings → Deck panel orders them (deckSections in StudioShell.tsx).
export const GROUPS: { id: FrontMatterGroup; title: string; blurb: string }[] = [
	{ id: 'look', title: 'Look', blurb: 'Theme, canvas, size and the overall hand of the deck.' },
	{ id: 'chrome', title: 'Chrome', blurb: 'The furniture on every slide: running header and footer, page numbers, logo.' },
	{ id: 'general', title: 'General', blurb: 'What the deck is called, what language it is in, and how its source is read.' },
	{ id: 'accent', title: 'Accent', blurb: 'The small decorations: brand bar, heading rule, kicker mark, stamps.' },
	{ id: 'motion', title: 'Motion', blurb: 'How charts move on live surfaces. A PDF is always still.' },
	{ id: 'speech', title: 'Speech', blurb: 'How the deck is read aloud.' },
	{ id: 'export', title: 'Export targets', blurb: 'What the command-line render produces. The Studio decides these in Share instead.' },
	{ id: 'raw', title: 'Raw styling', blurb: 'Marp-compatible CSS escape hatches. They bypass the theme, so reach for them last.' },
	{ id: 'developer', title: 'Developer', blurb: 'Tools for building and checking a deck. None of them changes an export.' },
];

export const FRONT_MATTER_DOCS: Record<string, FrontMatterDoc> = Object.fromEntries(
	OFFERED_SETTINGS.map((r) => [
		r.key,
		{
			group: r.group as FrontMatterGroup,
			default: r.default,
			...(r.studio ? { studio: r.studio } : {}),
			...(r.slide ? { slide: r.slide } : {}),
			...(r.scope ? { scope: r.scope } : {}),
			...(r.valuesText ? { values: r.valuesText } : {}),
		},
	]),
);
