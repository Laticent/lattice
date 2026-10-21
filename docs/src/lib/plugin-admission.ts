// THE DECK'S PLUGIN ADMISSION, for the Studio's own readers (spec/LPM.md §3.2.1).
//
// The engine admits plugins per deck and marks what it left off, so every frame that shows its
// render follows a host that narrowed its default set (`LatticePlayground.setPluginDefaults`). Two
// kinds of reader in the Studio do NOT run the engine and so had no door to that answer:
//
//   - the Export-to-Marp bundle, which Marp renders: it carries the plugins left off in its
//     settings block (`pluginsOff`) and the bundled runtime marks them before it draws;
//   - the source-side readers — the slide mapping (lib/core/slide-boundaries.mjs) and the lint
//     (lib/authoring/lint-core.js, through the authoring-core bundle) — which parse with the
//     boundary parser. The main bundle and the lint bundle (authoring-core) each hold their OWN
//     copy of that parser, so both copies are pointed at the deck's `off` set: with math off, a `---` inside `$$` splits a slide here exactly where
//     the engine splits it.
//
// A THIRD copy is NOT switched: the read-along core (the narrators) inlines the parser since the chart row record's
// place moved onto one token tracker, and nothing here reaches it, because importing that core would put it on the
// Studio's startup path. Under a host that narrows plugins, the narrators parse on the default grammar. It matters
// only for chart rows written inside a `$$` or code-record block, and is tracked in
// followups.d/2690-p1-chart-model-phase-2-reader.md (round 16).
//
// On the shipped default set `pluginAdmission` answers null, nothing is off, and this does nothing.

import { deckPluginsOffFor } from '@/playground/editor-diagnostics.js';
// The lint bundle's copy is switched through lint-boundary-state.js, never by importing the lint core:
// the lint core loads after first paint, and importing it here would put it back on the Studio's
// startup path. The state module holds the `off` set until the lint core loads, and
// authoring-door.js's loadAuthoring() applies it before it hands the lint core to any reader.
import { setLintBoundaryOff as setLintBoundaryPluginsOff } from '@/playground/lint-boundary-state.js';
import { setBoundaryPluginsOff } from '../../../lib/core/boundary-parser.mjs';
import { PLUGIN_NAMES } from '../../../lib/plugins/blocks.generated.mjs';

/** The plugins the playground bundle's host admission leaves off for this whole deck, sorted. */
export function deckPluginsOff(deck: string): string[] {
	const pg = typeof window !== 'undefined' ? window.LatticePlayground : undefined;
	return deckPluginsOffFor(deck, pg?.pluginAdmission, PLUGIN_NAMES);
}

/** The event `LatticePlayground.setPluginDefaults` fires: the answer can change with no edit. */
export const PLUGIN_DEFAULTS_EVENT = 'lattice:plugin-defaults';

// The `off` set both copies were last given, so a parse after an unchanged deck costs one admission
// and a string compare.
let applied = '';

/** Point the main and lint boundary-parser copies at this deck's admission (the narrators' copy is not reachable from here). Call before a source-side read. */
export function followDeckAdmission(deck: string): void {
	const off = deckPluginsOff(deck);
	const key = off.join(',');
	if (key === applied) return;
	applied = key;
	setBoundaryPluginsOff(off);
	setLintBoundaryPluginsOff(off);
}
