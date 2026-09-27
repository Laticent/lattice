import type { Page } from '@playwright/test';

/**
 * The preview frames serving the surface at `scope` — wherever they live.
 *
 * A pooled grid either keeps its frames in its own layer (inside the surface) or borrows them
 * from the Studio's frame dock (`#lattice-frame-dock`, at the end of `<body>`, placed over each
 * tile by CSS anchor positioning — docs/src/components/studio/frame-dock.tsx). A descendant
 * selector finds only the first kind, which is how every pool oracle here went blind when the
 * dock landed. This returns ONE selector that matches both: the surface's own frames, and the
 * dock frames currently SHOWN for a pool inside it.
 *
 * Resolved at call time, because pool ids are assigned at mount.
 */
export async function poolFrameSelector(page: Page, scope: string): Promise<string> {
	const ids = await page.evaluate((scope) => {
		const root = document.querySelector(scope);
		return root ? [...root.querySelectorAll('[data-preview-pool]')].map((e) => e.getAttribute('data-preview-pool')) : [];
	}, scope);
	const docked = ids.map((id) => `#lattice-frame-dock [data-dock-owner="${id}"][data-dock-shown] iframe.live`);
	return [`${scope} iframe.live`, ...docked].join(', ');
}
