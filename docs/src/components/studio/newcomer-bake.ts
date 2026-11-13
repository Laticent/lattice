// The app half of the STUDIO NEWCOMER BAKE. studio.astro's head seed fetches the build-time first
// write (scripts/bake-studio-newcomer.mjs) for a first-time visitor and leaves the pending fetch on
// `window.__studioBake`. StudioShell takes it ONCE, at mount, and hands it to the editing preview,
// whose renderer writes it before the engine has loaded (single-slide-render.ts `adoptBake`).
// Decision: engineering/decisions/2026-11-08-studio-newcomer-bake.md.

import type { NewcomerBake } from '@/playground/single-slide-render';

declare global {
	interface Window {
		__studioBake?: Promise<NewcomerBake | null>;
	}
}

let taken: Promise<NewcomerBake | null> | null | undefined;

/**
 * The head's pending bake fetch, or `null` when this visit fetched none. Read from the global once
 * per page and remembered, so React calling a state initializer twice (StrictMode) hands both calls
 * the same promise. A later mount that gets it again is harmless: `adoptBake` writes only into a host
 * with no frame yet, and only when the bake still matches the render about to happen.
 */
export function takeNewcomerBake(): Promise<NewcomerBake | null> | null {
	if (taken !== undefined) return taken;
	if (typeof window === 'undefined') return null;
	taken = window.__studioBake ?? null;
	window.__studioBake = undefined;
	return taken;
}
