// The route glob that matches the engine a page loads. Built from the SAME constant every page names
// the engine with (src/lib/engine-file.mjs), so renaming the engine moves these holds with it.
// A hard-coded file name went stale once already: when the docs site moved from the single-file
// `lattice-playground.js` to the ESM engine, fourteen `page.route` holds would have matched nothing and
// stayed green while holding nothing back (engineering/decisions/2026-10-14-engine-spine.md).
import { ENGINE_FILE } from '../src/lib/engine-file.mjs';

export const ENGINE_GLOB = `**/${ENGINE_FILE}`;

/** The Studio newcomer bake's files, beside the runtime (`…/v/<hash>/studio-newcomer/<mode>.json`). */
export const NEWCOMER_BAKE_GLOB = '**/studio-newcomer/**';

/**
 * Hold every engine request this page makes until the test releases it: a signal, not a duration.
 *
 * The specs that measure the instant shell used to hold the engine for a fixed 2.5 s and measure inside that window.
 * On a loaded runner the measurement could land after the window closed, against a shell already dismissed (F2 in
 * engineering/decisions/2026-11-06-flaky-tests.md); on a fast one the hold was 2.5 s of nothing. Now the shell stays
 * up for exactly as long as the test needs it: `release()` lets the held requests, and every later one, through;
 * `hold()` parks the next ones again (a spec that must let a first load through and hold the reload). A spec that
 * needs the engine never to arrive simply never releases it.
 */
export async function holdEngine(page: import('@playwright/test').Page) {
	// Keep the Studio NEWCOMER BAKE out too (scripts/bake-studio-newcomer.mjs). A first visit fetches it from the head, and
	// the preview paints it WITHOUT the engine, which reveals the slide and takes the instant shell down: the window these
	// specs hold the engine to study would close about a second in (studio-instant-shell.spec.ts "stage 1" failed 9 of 12).
	// The window WITH the bake is pinned in studio-newcomer-bake.spec.ts.
	await page.route(NEWCOMER_BAKE_GLOB, (route) => route.abort());
	let open = false;
	let release: () => void = () => {};
	let gate = new Promise<void>((r) => {
		release = r;
	});
	await page.route(ENGINE_GLOB, async (route) => {
		if (!open) await gate;
		await route.continue();
	});
	return {
		release() {
			open = true;
			release();
		},
		hold() {
			open = false;
			gate = new Promise<void>((r) => {
				release = r;
			});
		},
	};
}
