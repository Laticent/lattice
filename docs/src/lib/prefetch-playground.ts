// The home page's warm-up for a FIRST PLAYGROUND VISIT — kept apart from prefetch-engine.ts so
// the pages that only warm the engine (the Studio among them) do not carry it.

import { decide, onAppLinkIntent, readSignals } from './prefetch-engine';

/**
 * WARM THE PLAYGROUND'S FIRST VISIT from a page that leads to it (the home page). Same policy
 * as the engine warm (prefetch-engine.ts `decide`): nothing under Save-Data or on 2G, on intent over 3G or an
 * unknown narrow link, at once on a fast one. What it fetches is what a first-time visitor's
 * Playground asks for before its first slide shows: the newcomer bake for this reader's mode
 * (engineering/decisions/2026-09-28-playground-virtual-filmstrip.md §2) and the theme sheets
 * the app registers. `rel=prefetch` puts them in the HTTP cache at the lowest priority, where
 * the Playground's frame and fetches find them.
 *
 * The bake is only the NEWCOMER'S document, so it is fetched only in the palette it was baked in.
 */
export function warmPlayground(urls: { bake: string; themes: string[] }, opts: { allowEager?: boolean; palette?: string; bakePalette?: string } = {}): void {
	if (typeof window === 'undefined') return;
	const list = [...urls.themes];
	if (urls.bake && (!opts.bakePalette || opts.palette === opts.bakePalette)) list.unshift(urls.bake);
	const mode = decide(readSignals(), Boolean(opts.allowEager));
	if (mode === 'off' || !list.length) return;
	const inject = () => {
		for (const href of list) {
			if (document.querySelector(`link[rel="prefetch"][href="${href.replace(/["\\]/g, '\\$&')}"]`)) continue;
			const link = document.createElement('link');
			link.rel = 'prefetch';
			link.href = href;
			document.head.appendChild(link);
		}
	};
	if (mode === 'eager') inject();
	else onAppLinkIntent(inject);
}
