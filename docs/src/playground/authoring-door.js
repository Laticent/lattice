// THE ONE WAY INTO THE LINT CORE. Import this, never the lint core's module itself:
// `docs/src/playground/authoring-door.test.ts` fails on any other importer.
//
// The lint core loads after first paint (engineering/decisions/2026-10-14-engine-spine.md §5), from
// `esm/lint.js` beside the engine (§10; lint-core-source.js says where). It holds its own boundary
// parser, and that parser must follow the deck's plugin admission before anyone parses with it, so
// `loadAuthoring` switches it before it hands the lint core to anyone.
//
// NOT a top-level await. A module that awaits at the top makes Rolldown split the Studio's startup
// code into 57 more chunks (110 to 167, +12KB gz across the same 493 modules; measured 2026-10-15),
// even when nothing on the startup path imports it. So the door is a function, and a module that
// needs the lint core synchronously (pane-pages.ts, slide-notes.ts, PrintOptionsPanel.tsx) reads it
// with `authoring()`, after its own loader awaited `loadAuthoring()`.

import { adoptLintBoundarySetter } from './lint-boundary-state.js';
import { loadLintCore } from './lint-core-source.js';

/** @typedef {typeof import('./authoring-core.generated.js')} Authoring */

/** @type {Authoring | null} */
let core = null;
/** @type {Promise<Authoring> | null} */
let loading = null;

/**
 * The lint core, loaded once and switched to the deck's plugin admission before it is returned.
 * A failed load is not cached, so a later call can retry.
 * @returns {Promise<Authoring>}
 */
export function loadAuthoring() {
	if (!loading) {
		loading = loadLintCore().then((mod) => {
			adoptLintBoundarySetter(mod.setBoundaryPluginsOff);
			core = mod;
			return mod;
		});
		loading.catch(() => {
			loading = null;
		});
	}
	return loading;
}

/**
 * The lint core, for a caller that cannot await. Its module's loader must have awaited
 * `loadAuthoring()` first; reading it earlier throws rather than guessing.
 * @returns {Authoring}
 */
export function authoring() {
	if (!core) throw new Error('authoring-door: the lint core has not loaded. Await loadAuthoring() in the loader of the module that reads it.');
	return core;
}
