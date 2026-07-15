import type { LensDef, WorkspaceLensConfig } from '@/lib/lente';
import { ARCHETYPES, STARTER_ARCHETYPE_IDS } from './lens-archetypes';
import type { StudioSettings } from './studio-store';

// The workspace-level default reader views. When the "Default reader views" setting is ON, every deck
// INHERITS these — they appear in the Lenses panel as unapproved starters, but the deck's SOURCE stays
// clean (no `lenses:` block) until the author approves, edits, drops, or adds one (the delta model:
// `parseLensRegistry(fm, ws)` merges them at read; `upsertLensRegistry(fm, reg, ws)` writes only the
// deck's DELTA — see lente/registry.ts). Turning the setting OFF drops them from any deck that never
// materialized one; a deck the author DID act on keeps its materialized/dropped views verbatim.
//
// Derived from the SHARED archetypes (lens-archetypes.ts) so an inherited view and a hand-added one of
// the same id are the SAME view — no divergent duplicate, no label drift. TWO, deliberately (the
// "curated two"): the bottom-line reader and the proof-first reader. The workspace supplies only the
// SHAPE (id/label/base) — never membership or approval, which stay per-deck + human-gated.
export const DEFAULT_WORKSPACE_LENSES: WorkspaceLensConfig = {
	default: 'full',
	lenses: STARTER_ARCHETYPE_IDS.map((id): LensDef => {
		const a = ARCHETYPES.find((x) => x.id === id);
		if (!a) throw new Error(`workspace-lenses: no archetype '${id}'`); // a STARTER id must name a real archetype
		return { id: a.id, label: a.label, base: a.base, ...(a.single ? { single: true } : {}) };
	}),
};

/** The workspace lens config in force — the curated defaults when the "Default reader views" setting is
 *  ON, else `undefined` (no inheritance: decks show only the views their own source declares). Threaded
 *  into every `parseLensRegistry` / `upsertLensRegistry` call so read + write agree on what's inherited. */
export function workspaceLensConfig(settings: Pick<StudioSettings, 'lensDefaults'>): WorkspaceLensConfig | undefined {
	return settings.lensDefaults ? DEFAULT_WORKSPACE_LENSES : undefined;
}
