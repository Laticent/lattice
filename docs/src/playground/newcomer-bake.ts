// The app half of the NEWCOMER BAKE. scripts/bake-newcomer-frame.mjs writes the document the
// Playground's first render would write for a first-time visitor, with the render state
// `renderDeck` keeps after writing it embedded as `#pg-bake`; playground.astro loads it into the
// preview frame during parse. The app's first render calls this: when the frame holds that
// document for exactly the deck about to render, it takes the embedded state over and renders
// as an ordinary patch against it — nothing changes when the bake is current, and a stale one
// is patched or restyled in place. Anything else answers `null` and the app writes its own.

import { fingerprint } from '@/lib/playground-controller';
import type { PreviewState } from '@/lib/playground-engine';

type Seed = { v?: number; srcHash?: string; state?: PreviewState & { writeId?: number } };

/**
 * The baked render state, when `frame` holds the baked document for the deck `src`. `null` for
 * another deck, a document still loading (its seed sits at the end of the body), a document the
 * app has already replaced, or a seed of a shape this build does not know.
 */
export function adoptBake(frame: HTMLIFrameElement, src: string): PreviewState | null {
	try {
		const doc = frame.contentDocument;
		const text = doc?.getElementById('pg-bake')?.textContent;
		if (!doc || !text || !doc.documentElement.hasAttribute('data-pg-bake')) return null;
		const seed = JSON.parse(text) as Seed;
		const st = seed.state;
		if (seed.v !== 1 || seed.srcHash !== fingerprint(src) || !st?.writeId || !Array.isArray(st.lastSections)) return null;
		// The document is the one the seed describes, not one written over it since.
		if (doc.documentElement.getAttribute('data-lattice-write') !== String(st.writeId)) return null;
		return st;
	} catch {
		return null;
	}
}
