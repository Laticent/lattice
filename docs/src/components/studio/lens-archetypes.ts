import type { LensBase } from '@/lib/lente';

// The reader-view ARCHETYPES — the single source of truth for the built-in reader types, shared by the
// Lenses panel (the "Add a reader view" menu) AND the workspace default reader views (workspace-lenses).
// Each is grounded in a reader TYPE, not a layout: the bottom-line reader, the narrative reader, the
// proof-first reader, the decision-maker. `@slidewright/lente`'s deterministic suggester (suggest.ts)
// keys on these ids, so an id here must match a SUGGESTERS entry there. The blurb is the author-facing
// "who is this for," in plain words. One definition so the panel and the workspace defaults can't drift.
export type Archetype = { id: string; label: string; base: LensBase; single?: boolean; blurb: string };

export const ARCHETYPES: Archetype[] = [
	{ id: 'brief', label: 'Bottom line', base: 'none', blurb: 'Headline metrics + the frame — for a reader who wants the answer, not the tour.' },
	{ id: 'story', label: 'The story', base: 'none', blurb: 'The throughline: setup → journey → payoff, in plain language.' },
	{ id: 'evidence', label: 'The evidence', base: 'all', blurb: 'Everything substantive; drops decoration and dividers — for the reader who wants proof.' },
	{ id: 'ask', label: 'The ask', base: 'none', single: true, blurb: 'Exactly one slide: the decision you need.' },
];

// The archetypes a workspace INHERITS by default when "Default reader views" is on (workspace-lenses.ts):
// the answer + the proof, the two most universal reader types. A curated subset — the author adds the
// rest (The story / The ask) per deck from the Lenses panel.
export const STARTER_ARCHETYPE_IDS = ['brief', 'evidence'] as const;
