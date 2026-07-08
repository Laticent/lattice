// Browser side of the self-contained player's CSS + font PRUNE (P2b) — the app-side
// twin of the CLI emulator's prunePlayerCssInPage (lattice-emulator.js). The assembled
// Studio player inlines the WHOLE visual contract (~1 MB lattice.css) + the whole type
// stack; a given deck uses a fraction. This mounts the assembled player in an OFFSCREEN
// same-origin iframe, matches every base selector against the real rendered DOM across
// all three views, and drops the rules/faces nothing paints — bringing the download
// down to the CLI's ~0.4 MB.
//
// It runs the SAME kernel as the CLI (lib/export/player-prune.js, bundled to
// player-prune.generated.js) and the SAME two safety guards, so a wrongly-dropped rule
// can't silently break the frozen file:
//   (1) AUTHORITATIVE matching — real-DOM `querySelector` across the union of all three
//       view-DOMs, not a token heuristic;
//   (2) a COMPUTED-STYLE GATE — full vs pruned CSS compared over GATE_PROPS for every
//       element (+ ::before/::after) in all three views; ANY diff rejects the CSS prune
//       and ships the full stylesheet. css-tree/parse trouble → full CSS, never a throw.
// The font prune is independent (it removes faces nothing references) and needs no gate.

// css-tree is heavy, so this whole module (and its bundle) loads on demand, only when
// the user actually exports a webpage — never on the initial Studio load.
import { collectBaseSelectors, GATE_PROPS, prunePlayerCss, prunePlayerFontFaces } from '@/playground/player-prune.generated.js';

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
};

/**
 * Prune the assembled player HTML against an offscreen render of itself. Returns the
 * pruned HTML (or the original, `applied:false`, when there's nothing to prune / the
 * gate fails / a dep is missing) — never throws on a frozen artifact.
 */
export async function prunePlayerInBrowser(playerHtml: string): Promise<PruneResult> {
	// Two targets: the inlined lattice.css (largest non-font <style>) for the selector
	// prune, and the base64 @font-face block (#lattice-embedded-fonts) for the font prune.
	const blocks = [...playerHtml.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)];
	let target: { full: string; css: string } | null = null;
	let fontBlock: { full: string; css: string } | null = null;
	for (const b of blocks) {
		if (/lattice-embedded-fonts/.test(b[1])) {
			fontBlock = { full: b[0], css: b[2] };
			continue;
		}
		if (!target || b[2].length > target.css.length) target = { full: b[0], css: b[2] };
	}
	const bases = target && target.css.length >= 50000 ? collectBaseSelectors(target.css) : [];
	if (!bases.length && !fontBlock) return { html: playerHtml, applied: false };

	// Mount the player in an offscreen, laid-out (not display:none, or fonts never load)
	// same-origin iframe. Real dimensions so present mode lays out; invisible + inert.
	const host = document.createElement('div');
	host.dataset.playerPrune = 'scratch';
	host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:720px;overflow:hidden;opacity:0;pointer-events:none;';
	const frame = document.createElement('iframe');
	frame.setAttribute('aria-hidden', 'true');
	frame.style.cssText = 'width:1280px;height:720px;border:0;';
	host.appendChild(frame);
	document.body.appendChild(host);

	try {
		// Wait for the offscreen render. On a pathological stall, FAIL SAFE (ship the full
		// player) rather than prune against an under-rendered frame — matching the CLI,
		// which aborts the prune on a load timeout. (srcdoc parses its DOM synchronously,
		// so this only guards a stuck subresource load, e.g. the base64 fonts.)
		const loaded = await new Promise<boolean>((res) => {
			const t = window.setTimeout(() => res(false), 15000);
			frame.addEventListener('load', () => { window.clearTimeout(t); res(true); }, { once: true });
			frame.srcdoc = playerHtml;
		});
		if (!loaded) return { html: playerHtml, applied: false };
		const win = frame.contentWindow as (Window & typeof globalThis) | null;
		const doc = frame.contentDocument;
		if (!win || !doc) return { html: playerHtml, applied: false };
		const app = doc.getElementById('lp-app');
		const views = ['present', 'read-slides', 'read-article'];

		// Cycle all three views and force layout so every face the deck needs actually
		// loads (fonts load lazily, only when an element needs them).
		for (const v of views) {
			app?.setAttribute('data-lp-view', v);
			for (const el of doc.querySelectorAll('#lp-app *')) (el as HTMLElement).getBoundingClientRect();
			try {
				await doc.fonts.ready;
			} catch {
				/* fonts best-effort — the loaded-status + computed-family nets below still run;
				   worst case fewer faces are marked used → MORE kept (never fewer) */
			}
		}

		// ── FONT prune: which embedded families does the deck actually use? ──────────
		// USED = a face the browser LOADED (lazy) OR a family named in any element's
		// resolved font-family (so a deck applying the sketch hand keeps Caveat + Shantell).
		let fontResult: { css: string; applied: boolean; total: number; kept: number } = { css: '', applied: false, total: 0, kept: 0 };
		if (fontBlock) {
			const strip = (s: string) => String(s).trim().replace(/^["']|["']$/g, '');
			const fams = new Set<string>();
			for (const f of doc.fonts as unknown as Iterable<FontFace>) if (f.status === 'loaded') fams.add(strip(f.family));
			for (const el of doc.querySelectorAll('*')) {
				for (const part of (win.getComputedStyle(el).fontFamily || '').split(',')) fams.add(strip(part));
			}
			app?.setAttribute('data-lp-view', 'present');
			fontResult = prunePlayerFontFaces(fontBlock.css, [...fams]) as typeof fontResult;
		}

		// ── CSS prune: authoritative match — keep a base on ANY querySelector error. ─
		let cssResult: { css: string; applied: boolean; totalRules: number; keptRules: number } = { css: '', applied: false, totalRules: 0, keptRules: 0 };
		if (bases.length && target) {
			const usedSet = new Set<string>();
			for (const s of bases) {
				try {
					if (doc.querySelector(s)) usedSet.add(s);
				} catch {
					usedSet.add(s); // an invalid selector for querySelector → keep (conservative)
				}
			}
			const pruned = prunePlayerCss(target.css, (b: string) => usedSet.has(b)) as typeof cssResult;
			cssResult = pruned.applied && pruned.css.length < target.css.length ? pruned : { css: '', applied: false, totalRules: 0, keptRules: 0 };
		}

		// ── computed-style GATE across all three views (+ pseudo-elements) — CSS only. ─
		let identical = true;
		if (cssResult.applied) {
			const styleEl = [...doc.querySelectorAll('style')]
				.filter((s) => s.id !== 'lattice-embedded-fonts')
				.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0))[0];
			const snap = () => {
				const rows: string[] = [];
				for (const el of doc.querySelectorAll('#lp-app *')) {
					for (const pseudo of [null, '::before', '::after']) {
						const cs = win.getComputedStyle(el, pseudo);
						rows.push(GATE_PROPS.map((p: string) => cs.getPropertyValue(p)).join('|'));
					}
				}
				return rows.join('\n');
			};
			const before: Record<string, string> = {};
			for (const v of views) {
				app?.setAttribute('data-lp-view', v);
				before[v] = snap();
			}
			const original = styleEl?.textContent ?? '';
			if (styleEl) styleEl.textContent = cssResult.css;
			for (const v of views) {
				app?.setAttribute('data-lp-view', v);
				if (snap() !== before[v]) {
					identical = false;
					break;
				}
			}
			if (styleEl) styleEl.textContent = original;
			app?.setAttribute('data-lp-view', 'present');
		}
		const cssOk = cssResult.applied && identical;

		if (!cssOk && !fontResult.applied) {
			return { html: playerHtml, applied: false, gateFailed: cssResult.applied && !identical };
		}

		// Apply whichever prunes survived. Replacer FUNCTIONS, not strings — else a
		// `$&`/`$1`/backtick in the CSS or a data-URI would be interpreted by replace().
		let html = playerHtml;
		if (cssOk && target) html = html.replace(target.full, () => `<style>${cssResult.css}</style>`);
		if (fontResult.applied && fontBlock) {
			html = html.replace(fontBlock.full, () => `<style id="lattice-embedded-fonts">${fontResult.css}</style>`);
		}
		return {
			html,
			applied: true,
			gateFailed: cssResult.applied && !identical,
			saved: cssOk && target ? target.css.length - cssResult.css.length : 0,
			keptRules: cssResult.keptRules,
			totalRules: cssResult.totalRules,
			fontApplied: fontResult.applied,
			fontSaved: fontResult.applied && fontBlock ? fontBlock.css.length - fontResult.css.length : 0,
			fontsKept: fontResult.kept,
			fontsTotal: fontResult.total,
		};
	} finally {
		host.remove();
	}
}
