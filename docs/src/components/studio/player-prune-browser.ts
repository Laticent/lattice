// The Studio's PAGE for the self-contained player's CSS + font prune, and its glyph subsetter.
//
// The prune orchestration (which probes run, the computed-style gate, the identical-file font
// merge, the guarded re-wrap) is ONE kernel shared with the CLI: `prunePlayerHtml` in
// lib/export/player-prune.js, bundled to player-prune.generated.js (HARD RULE #1). Until
// 2026-10-16 this file carried a hand-written twin of it; now it supplies only what a browser
// host must: an offscreen, laid-out, same-origin iframe holding the assembled player, where the
// kernel's probes run in-process against the frame's document
// (engineering/decisions/2026-10-16-player-as-library-audit.md §11).
//
// It also hands `assemblePlayer` the same `subsetEmbeddedFonts` the CLI uses, so a Studio export
// glyph-subsets its fonts like a CLI export does (before, every kept face shipped whole).
//
// The bundle (css-tree, `subset-font`, the woff2 codec) is heavy, so this module loads on
// demand, only when the author exports a webpage, never on the initial Studio load.
import { prunePlayerHtml, setColorWasm, setSubsetWasm, subsetEmbeddedFonts } from '@/playground/player-prune.generated.js';

export type PruneResult = {
	html: string;
	applied: boolean;
	gateFailed?: boolean;
	saved?: number;
	keptRules?: number;
	totalRules?: number;
	fontApplied?: boolean;
	fontSaved?: number;
	fontsKept?: number;
	fontsTotal?: number;
	fontsMerged?: number;
};

type Probe = (arg: unknown, doc?: Document) => unknown;

/**
 * Prune the assembled player HTML against an offscreen render of itself. Returns the pruned
 * HTML (or the original, `applied:false`, when there is nothing to prune, the gate fails or a
 * dependency is missing). Never throws on a frozen artifact.
 */
export async function prunePlayerInBrowser(playerHtml: string): Promise<PruneResult> {
	return prunePlayerHtml(playerHtml, async (html: string) => {
		// Laid out (not display:none, or fonts never load), at real dimensions so Present lays
		// out, invisible and inert.
		const host = document.createElement('div');
		host.dataset.playerPrune = 'scratch';
		host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;';
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText = 'width:1280px;height:720px;border:0;';
		host.appendChild(frame);
		document.body.appendChild(host);
		// On a pathological stall, FAIL SAFE (ship the full player) rather than prune against an
		// under-rendered frame, as the CLI aborts on a load timeout. srcdoc parses its DOM
		// synchronously, so this only guards a stuck subresource load, e.g. the base64 fonts.
		const loaded = await new Promise<boolean>((res) => {
			const t = window.setTimeout(() => res(false), 15000);
			frame.addEventListener('load', () => { window.clearTimeout(t); res(true); }, { once: true });
			frame.srcdoc = html;
		});
		const doc = frame.contentDocument;
		if (!loaded || !doc) {
			host.remove();
			return null;
		}
		return {
			run: async (probe: Probe, arg: unknown) => probe(arg, doc),
			close: () => host.remove(),
		};
	}) as Promise<PruneResult>;
}

let wasmReady: Promise<void> | null = null;

/**
 * The `subsetFonts` capability for `assemblePlayer`: the CLI's own subsetter, fed HarfBuzz's
 * wasm from the site's bundle. Any trouble loading it ships the fonts whole, as the CLI does
 * when `subset-font` is not installed.
 */
export async function subsetFontsInBrowser(html: string, fonts?: { text: string; emoji: string }): Promise<{ html: string; applied: boolean; saved: number }> {
	try {
		wasmReady ||= (async () => {
			const { default: url } = await import('harfbuzzjs/hb-subset.wasm?url');
			const res = await fetch(url);
			if (!res.ok) throw new Error(`hb-subset.wasm: HTTP ${res.status}`);
			setSubsetWasm(new Uint8Array(await res.arrayBuffer()));
			// The color build, for the emoji font only (lib/fonts/hb/README.md); the browser caches the one fetch.
			const { default: colorUrl } = await import('../../../../lib/fonts/hb/hb-subset-color.wasm?url');
			const colorRes = await fetch(colorUrl);
			if (colorRes.ok) setColorWasm(new Uint8Array(await colorRes.arrayBuffer()));
		})();
		await wasmReady;
	} catch {
		wasmReady = null;
		return { html, applied: false, saved: 0 };
	}
	return subsetEmbeddedFonts(html, fonts);
}
