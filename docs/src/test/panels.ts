import { waitFor } from '@testing-library/react';
import { STUDIO_PANELS } from '@/components/studio/studio-panels';

// The Studio's panels load on first open and show a look-alike shell until they arrive
// (`components/studio/lazy-panel.tsx`). A sheet's shell is a separate dialog element from the
// loaded sheet, so a test must wait for the shell to go before it queries the panel — a handle
// taken on the shell goes stale when the real sheet replaces it.

/** Resolve once no panel shell is on screen. A sheet holds its shell for its 500 ms slide-in. */
export async function waitForPanels(): Promise<void> {
	await waitFor(() => {
		if (document.querySelector('[data-panel-shell]')) throw new Error('a panel is still loading');
	}, { timeout: 5000 });
}

/**
 * Load the six panels before the Studio renders, as a warmed Studio would have. A jsdom test that
 * opens a panel then sees the panel on its first frame, never the shell, so it cannot race the
 * load. Use it (`beforeAll(loadStudioPanels)`) in every file that renders the Studio; the shells
 * have their own tests (`lazy-panel.test.tsx`, `docs/e2e/panel-shells.spec.ts`).
 */
export async function loadStudioPanels(): Promise<void> {
	await Promise.all(STUDIO_PANELS.map((panel) => panel.load()));
}

/**
 * Load Fabricate before the Studio renders, for a file that opens it. Fabricate is its own
 * `React.lazy` split (StudioShell.tsx), not one of the six panels, so `loadStudioPanels` leaves
 * it cold, and the first open in a file then transforms and loads the whole module inside the
 * test's `waitFor` for the Theme specimen. Under 4-way CPU contention that took longer than the
 * 3 s `asyncUtilTimeout` (`studio.theme-depth.test.tsx`, run 1 of the named loop, 2026-11-15).
 * Measured under 4 CPU burners, that file alone, 10 runs each: the first open waited 1485-1945 ms
 * cold and 3-564 ms warmed. Warmed, React.lazy finds the module in the cache and the wait times
 * only the render. A
 * returning user's Studio is warmed the same way (`studio-warm.ts`).
 */
export async function loadFabricate(): Promise<void> {
	await import('@/components/studio/Fabricate');
}
