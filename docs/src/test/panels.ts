import { waitFor } from '@testing-library/react';

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
