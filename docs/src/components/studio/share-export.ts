// Studio Share — the REAL export pipeline, wired to the engine exporters.
//
// WRAP, DON'T REINVENT (HARD RULE #15). Every format below is produced by the
// SAME code the Drawing Board ships (drawing-board-export.js) — Markdown (source
// + embedded theme/components), the Marp ZIP bundle, the one-click image PDF /
// PPTX, and the browser's vector Print. This module only assembles the inputs
// those functions need (an engine render of the FULL deck) from the Studio's
// renderer options + current palette, so Share hands off real artifacts rather
// than a toast.

import { ensureEngine } from '@/lib/load-engine';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { createThemeFetcher } from '@/lib/theme-fetch';
import { mergeClassTokens, setFrontMatter } from './front-matter';

type EngineRender = { html: string; css: string; width?: number; height?: number };
type PG = {
	render: (source: string, theme: string, opts?: { baseUrl?: string }) => EngineRender;
	hasTheme: (name: string) => boolean;
	marp?: unknown;
};

/** The `render` object the image exporters (exportPdf/exportPptx) consume. */
export type DeckRender = {
	html: string;
	css: string;
	mode: 'light' | 'dark';
	geom: { w: number; h: number };
	runtimeUrl: string;
	fontCss: string;
	/** Local Mermaid URL (studio), so an exported deck's diagrams render from our
	 *  own origin instead of the jsdelivr CDN. Absent → the exporter's CDN default. */
	mermaidUrl?: string;
};

function pg(): PG | undefined {
	return typeof window !== 'undefined' ? (window as unknown as { LatticePlayground?: PG }).LatticePlayground : undefined;
}

/** Ensure the engine bundle is loaded (no-op once present). */
async function ensureReady(options: SingleSlideOptions): Promise<PG> {
	if (!pg() && options.engineUrl) await ensureEngine(options.engineUrl);
	const PG = pg();
	if (!PG) throw new Error('engine not ready — try again in a moment');
	return PG;
}

/** An in-memory theme (a saved Fabricate library theme) — registered, not fetched. */
export type ExtraTheme = { name: string; css: string };

/**
 * Register the theme to render with and return its name. A saved library theme
 * (`extra`) has no on-disk CSS, so we register the raw CSS into the engine; a
 * built-in palette is fetched (+ its dark companion) by name as before.
 */
async function ensureTheme(options: SingleSlideOptions, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme): Promise<string> {
	const PG = pg();
	if (extra) {
		// ALWAYS (re-)register so an edited theme re-saved under the same name
		// exports with the current CSS (addThemes overwrites by name); a hasTheme
		// guard would silently export the stale theme.
		if (PG) (PG as unknown as { addThemes: (c: string[]) => void }).addThemes([extra.css]);
		return extra.name;
	}
	const themes = createThemeFetcher(options.themeBase);
	await themes.ensure(palette, mode);
	return mode === 'dark' && PG?.hasTheme(`${palette}-dark`) ? `${palette}-dark` : palette;
}

/**
 * Render the FULL deck through the engine and assemble the `render` object the
 * image exporters need. This is the single piece of glue Share adds on top of
 * the shared exporters.
 */
export async function buildDeckRender(options: SingleSlideOptions, source: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, extraCss?: string): Promise<DeckRender> {
	const PG = await ensureReady(options);
	const theme = await ensureTheme(options, palette, mode, extra);
	const out = PG.render(source, theme);
	const { previewFontFaceCss } = await import('@/playground/font-embed.js');
	return {
		html: out.html,
		// Saved local-component CSS (extraCss) rides last so the deck's `.<name>`
		// slides export with their styles — same composition as the live preview.
		css: out.css + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : ''),
		mode,
		geom: { w: out.width || 1280, h: out.height || 720 },
		runtimeUrl: options.runtimeUrl,
		fontCss: previewFontFaceCss(),
		mermaidUrl: options.mermaidUrl,
	};
}

type ExportMod = typeof import('@/playground/drawing-board-export.js');
function exporters(): Promise<ExportMod> {
	return import('@/playground/drawing-board-export.js');
}

/**
 * Render the theme's showcase deck → PDF bytes (a Blob), for the Library's
 * theme-share zip. Reuses the same render + PDF path as Share→PDF, so the zip
 * SHOWS the theme on a representative deck rather than just shipping tokens.
 */
export async function renderThemeShowcase(options: SingleSlideOptions, theme: { name: string; label?: string; css: string }): Promise<Blob> {
	const { showcaseDeck } = await import('./asset-bundle');
	const render = await buildDeckRender(options, showcaseDeck(theme.label || theme.name), theme.name, 'light', { name: theme.name, css: theme.css });
	const ex = await exporters();
	return ex.renderPdfBlob(render, `${theme.name}-showcase`, undefined, { deck: `${theme.name} showcase`, engine: 'lattice' });
}

/**
 * Embed the deck's saved finishes into a SOURCE handoff. A saved finish renders via
 * its `finish-<slug>` class + generated CSS; on another machine the CSS doesn't
 * resolve (the bare `finish:` register knows only built-ins). So — mirroring
 * `embedThemeInMarkdown` — we inline the generated finish CSS as a Marp global
 * `<style>` right after the front matter, so the recipient renders the custom
 * finish from the markup itself.
 *
 * `finishCss` is the COMBINED CSS of every saved finish the deck references (deck-wide
 * `finish:` AND any per-slide `_class: … finish-<slug>`), so a per-slide-only finish
 * is embedded too — not just a deck-wide one. `finishClass` (the deck-wide
 * `finish finish-<slug>`) is additionally MERGED into `class:` when present, because a
 * bare deck-wide `finish: finish-<slug>` value doesn't resolve to a class off-Studio;
 * per-slide finishes already carry their class in the source, so they need only the CSS.
 * No-op when the deck references no saved finish. Pure string surgery — the user's
 * editable source stays untouched (this is applied only to the exported copy).
 */
export function embedFinishInMarkdown(source: string, finishClass?: string, finishCss?: string): string {
	if (!finishCss) return source;
	// Deck-wide saved finish: merge its `finish finish-<slug>` class into `class:` AND
	// drop the now-redundant `finish: finish-<slug>` front-matter value. The bare value
	// names a finish the recipient's register doesn't know — it renders nothing on its
	// own (the merged class + embedded CSS do the work) and would otherwise trip an
	// `unknown-finish` lint warning in the shared artifact. Per-slide finishes carry
	// their class in the source already, so they need neither the merge nor the strip.
	const classed = finishClass ? setFrontMatter(mergeClassTokens(source, finishClass), 'finish', null) : source;
	const block = `<style>\n/* Lattice Studio — embedded finish (self-contained: this deck keeps its surface\n   finish even where the saved finish is not installed). Generated on export. */\n${finishCss.trim()}\n</style>\n`;
	const fm = /^(---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$))/.exec(classed);
	if (fm) return classed.slice(0, fm[0].length) + '\n' + block + '\n' + classed.slice(fm[0].length);
	return block + '\n' + classed;
}

/** Markdown source with the current theme + referenced components + (when active) the saved finish embedded. */
export async function shareMarkdown(options: SingleSlideOptions, source: string, name: string, palette: string, extra?: ExtraTheme, finishClass?: string, finishCss?: string): Promise<void> {
	const ex = await exporters();
	// Embed the live theme CSS so the .md keeps its look even where the theme
	// isn't installed. A saved library theme carries its own CSS; otherwise fetch
	// the palette. Best-effort: a failed fetch still exports the bare source.
	let theme: { name: string; css: string } | undefined = extra;
	if (!theme) {
		try {
			const css = await createThemeFetcher(options.themeBase).fetch(palette);
			theme = { name: palette, css };
		} catch {
			theme = undefined;
		}
	}
	// Bake the active saved finish into the exported copy (class + <style>), so the
	// custom finish renders on another machine. The user's source stays clean.
	ex.exportMarkdown(embedFinishInMarkdown(source, finishClass, finishCss), name, theme, []);
}

/** The self-contained Marp ZIP bundle (renders anywhere). */
export async function shareMarp(options: SingleSlideOptions, source: string, name: string, palette: string, finishClass?: string, finishCss?: string): Promise<void> {
	await ensureReady(options); // PG.marp must be present
	const ex = await exporters();
	// Same finish-embed as the Markdown handoff so the ZIP renders the custom finish.
	await ex.exportMarp(embedFinishInMarkdown(source, finishClass, finishCss), name, palette, options.themeBase, { includeAgent: true });
}

/** One-click image PDF (2× raster, one slide per page). The page-image format
 *  (PNG lossless / JPEG fast) is the Workspace › General preference. */
export async function sharePdf(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string): Promise<void> {
	const render = await buildDeckRender(options, source, palette, mode, extra, extraCss);
	const ex = await exporters();
	const { loadSettings } = await import('./studio-store');
	await ex.exportPdf(render, name, onStatus, { deck: name, engine: 'lattice' }, { pageFormat: loadSettings().pdfPages });
}

/** PowerPoint (image-slides, full-bleed). */
export async function sharePptx(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string): Promise<void> {
	const render = await buildDeckRender(options, source, palette, mode, extra, extraCss);
	const ex = await exporters();
	await ex.exportPptx(render, name, onStatus, { deck: name, engine: 'lattice' });
}

/**
 * Vector, selectable Print — the browser's own PDF engine. Builds a printable
 * full-deck frame from the render (print rules ON, visible to the print box) and
 * invokes print; the frame is removed once the dialog closes.
 */
export async function sharePrintDeck(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, extraCss?: string): Promise<void> {
	const render = await buildDeckRender(options, source, palette, mode, extra, extraCss);
	const { buildSrcdoc } = await import('@/playground/deck-preview.js');
	const ex = await exporters();
	const host = document.createElement('div');
	host.dataset.studioPrint = 'deck';
	host.style.cssText = 'position:fixed;inset:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
	const frame = document.createElement('iframe');
	frame.title = 'Print render';
	frame.style.cssText = `width:${render.geom.w}px;height:${render.geom.h}px;border:0;`;
	host.appendChild(frame);
	document.body.appendChild(host);
	// Bound the load wait — a srcdoc whose `load` never fires must not hang the
	// export forever (mirrors createCaptureFrame's withTimeout in the export core).
	await new Promise<void>((res) => {
		const done = () => res();
		const t = window.setTimeout(done, 10000);
		frame.addEventListener('load', () => { window.clearTimeout(t); done(); }, { once: true });
		frame.srcdoc = buildSrcdoc({ html: render.html, css: render.css, mode: render.mode, geom: render.geom, runtimeUrl: render.runtimeUrl, fontCss: render.fontCss, contentVisibility: false, cursor: false, sync: false, printRules: true });
	});
	try {
		if (frame.contentWindow && (frame.contentWindow as Window & { __latticeFit?: () => void }).__latticeFit) (frame.contentWindow as Window & { __latticeFit?: () => void }).__latticeFit?.();
		await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
		ex.exportPrint(frame, { deck: name, engine: 'lattice' });
	} finally {
		// Remove after the print dialog settles (give the browser a beat).
		window.setTimeout(() => host.remove(), 1000);
	}
}

/** Print the Markdown source itself — monospace, for markup review. */
export function sharePrintSource(source: string, name: string): void {
	const win = window.open('', '_blank');
	if (!win) throw new Error('Popup blocked — allow popups to print the source.');
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	win.document.write(
		`<!doctype html><title>${esc(name)}</title><style>body{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;padding:32px;color:#111}</style><pre>${esc(source)}</pre>`,
	);
	win.document.close();
	win.focus();
	win.print();
}
