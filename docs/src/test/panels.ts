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
