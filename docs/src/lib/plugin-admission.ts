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
// On the shipped default set `pluginAdmission` answers null, nothing is off, and this does nothing.

// The lint bundle's own copy, imported statically: authoring-core is already in the Studio's eager
// chunk (pane-pages.ts, architect.ts), so this adds no route bytes, and no reader of that copy can
// parse before it has been switched (checker: an adopt-on-load registry left the readers that load
// it before the editor's lint on the default grammar).
import { setBoundaryPluginsOff as setLintBoundaryPluginsOff } from '@/playground/authoring-core.generated.js';
import { setBoundaryPluginsOff } from '../../../lib/core/boundary-parser.mjs';
import { PLUGIN_NAMES } from '../../../lib/plugins/blocks.generated.mjs';

/** The plugins the playground bundle's host admission leaves off for this whole deck, sorted. */
export function deckPluginsOff(deck: string): string[] {
	const pg = typeof window !== 'undefined' ? window.LatticePlayground : undefined;
	const active = pg?.pluginAdmission?.(deck);
	return active ? PLUGIN_NAMES.filter((n) => !active.includes(n)).sort() : [];
}

/** The event `LatticePlayground.setPluginDefaults` fires: the answer can change with no edit. */
export const PLUGIN_DEFAULTS_EVENT = 'lattice:plugin-defaults';

// The `off` set both copies were last given, so a parse after an unchanged deck costs one admission
// and a string compare.
let applied = '';

/** Point both boundary-parser copies at this deck's admission. Call before a source-side read. */
export function followDeckAdmission(deck: string): void {
	const off = deckPluginsOff(deck);
	const key = off.join(',');
	if (key === applied) return;
	applied = key;
	setBoundaryPluginsOff(off);
	setLintBoundaryPluginsOff(off);
}
