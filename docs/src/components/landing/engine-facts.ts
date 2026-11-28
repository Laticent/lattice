// Facts the home page prints about the engine, DERIVED from the engine at build time so
// the page cannot drift from what ships (copy doc §7.3, counts policy: exact where
// generated). index.astro calls these in its frontmatter; engine-facts.test.ts pins them.
//
//   venueFindings()   — the venue demo's lint verdicts: the real `lint:deck` findings for
//                       the one-slide deck and the two-slide fix, at each of the four rooms.
//   scorecardHalves() — the Studio's Deck read categories, grouped into its two halves, and
//                       the deck profiles the Style half is judged against.
//   typeSizeCount()   — how many font-size steps the engine sets type in.
//
// Node-only (it reads lib/ through CommonJS), so it never reaches a client bundle: the
// islands receive the plain results as props.
import { createRequire } from 'node:module';
import { VENUE_ONE, VENUE_SPLIT, VENUE_SPLIT_SLIDES, VENUES, venueDeck } from './room-decks';

const require = createRequire(import.meta.url);
const { lintText } = require('../../../../lib/authoring/lint.js');
const { scoreDeck } = require('../../../../lib/authoring/scorecard.js');
const { PROFILES } = require('../../../../lib/authoring/deck-profiles.js');
const { TYPE_TOKENS } = require('../../../../lib/core/type-tokens.js');

export type VenueFinding = { rule: string; message: string; fix: string };
export type VenueVerdict = {
	venue: string;
	label: string;
	who: string;
	/** The whole one-slide deck at this venue, and its warnings (empty = clean). */
	oneDeck: string;
	one: VenueFinding[];
	/** The author's fix: the same content as two slides, and its warnings. */
	splitDeck: string;
	/** Each slide of the fix alone, with the same front matter (DeckPreview's fallback). */
	splitSlides: string[];
	split: VenueFinding[];
};

const warnings = (src: string): VenueFinding[] =>
	(lintText(src) as { rule: string; severity: string; message: string; fix?: string }[])
		.filter((f) => f.severity === 'warning' || f.severity === 'error')
		.map((f) => ({ rule: f.rule, message: f.message, fix: f.fix ?? '' }));

export function venueFindings(): VenueVerdict[] {
	return VENUES.map((v) => {
		const oneDeck = venueDeck(v.venue, VENUE_ONE);
		const splitDeck = venueDeck(v.venue, VENUE_SPLIT);
		return {
			...v,
			oneDeck,
			one: warnings(oneDeck),
			splitDeck,
			splitSlides: VENUE_SPLIT_SLIDES.map((s) => venueDeck(v.venue, s)),
			split: warnings(splitDeck),
		};
	});
}

export type ScorecardHalves = { craft: string[]; style: string[]; profiles: string[]; contractLabel: string };

export function scorecardHalves(): ScorecardHalves {
	// Any deck gives the category list; the scores themselves are not printed.
	const card = scoreDeck({ source: VENUE_SPLIT, lintFindings: [], reviewFindings: [] }) as {
		categories: { key: string; half: 'craft' | 'style'; label: string }[];
	};
	const of = (half: 'craft' | 'style') => card.categories.filter((c) => c.half === half).map((c) => c.label);
	const contract = card.categories.find((c) => c.key === 'contract');
	return {
		craft: of('craft'),
		style: of('style'),
		profiles: Object.values(PROFILES as Record<string, { label: string }>).map((p) => p.label),
		contractLabel: contract?.label ?? 'Contract',
	};
}

/** The 12-step type scale: every `--fs-*` size token except the `--fs-scale` multiplier. */
export function typeSizeCount(): number {
	return (TYPE_TOKENS as { name: string }[]).filter((t) => t.name !== '--fs-scale').length;
}
