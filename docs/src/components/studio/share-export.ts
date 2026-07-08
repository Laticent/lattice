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
import { getFrontMatter, mergeClassTokens, setFrontMatter } from './front-matter';

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

// ── Webpage (.html) — the self-contained player, assembled in the browser ────────
// The APP side of the download the original brief called for (P2 of
// engineering/decisions/2026-07-08-studio-html-player-export.md). It drives the
// SAME pure assembler the CLI `--player` uses (lib/export/player-core.mjs, bundled
// for the browser as player-core.generated.js), supplying browser capabilities in
// place of the Node ones — no engine byte lives twice (HARD RULE #1).

/** Escape text for an HTML text node / attribute value. */
function escHtml(s: string): string {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
	return escHtml(s).replace(/"/g, '&quot;');
}

/**
 * Assemble a self-contained document equivalent to the emulator's `cleanDocHtml`
 * (the `docHtml` input `assemblePlayer` expects): base64 fonts + the deck CSS +
 * per-slide sizing + a11y texture defs + the rendered `<section>` slides. This
 * mirrors the emulator's scaffold (lattice-emulator.js htmlDoc) so the shared
 * assembler sees the same shape from either host. Offline by construction — the
 * `#lattice-embedded-fonts` block is data-URI base64, not bundled URLs.
 */
function buildSelfContainedDoc(p: {
	lang: string;
	title: string;
	fontCss: string;
	css: string;
	w: number;
	h: number;
	a11yDefs: string;
	slides: string;
	katexLink: string;
}): string {
	return `<!DOCTYPE html>
<html lang="${escAttr(p.lang)}"><head><meta charset="utf-8">
<title>${escHtml(p.title)}</title>
<style id="lattice-embedded-fonts">${p.fontCss}</style>
${p.katexLink}
<style>
@page { size: ${p.w}px ${p.h}px; margin: 0; }
body { margin: 0; padding: 0; }
${p.css}
section[data-lattice-slide] { width: ${p.w}px !important; height: ${p.h}px !important; }
</style></head><body>
${p.a11yDefs}
${p.slides}
</body></html>`;
}

type NotesCore = {
	extractSlideNotes: (sections: string[]) => (string | null)[];
	extractSlideDescriptions: (sections: string[]) => (string | null)[];
	stripCommentNodes: (html: string) => string;
	noteBodiesFromHtml: (sectionHtml: string) => string[];
	stripNotesFromSource: (source: string, noteBodies: Set<string> | string[]) => string;
};

/**
 * Materialize speaker notes + accessible descriptions into the (already re-tagged)
 * sections, mirroring the CLI emulator (lattice-emulator.js): the engine emits notes
 * ONLY as raw HTML comments, so — like the emulator — lift them via the shared
 * `notesCore` and inject a `hidden` `aside.lattice-notes` (spoken by the presenter,
 * kept out of the a11y tree) plus an sr-only `p.lattice-description` referenced by
 * `aria-describedby`. Without this the Studio player would silently drop both (its
 * notes sheet would find no aside, and screen-reader slide descriptions would vanish
 * — a WCAG 1.1.1 regression vs. the CLI player). `sections` still carry their
 * comments; each is comment-stripped here before the inject.
 *
 * `stripNotes` mirrors the CLI `--strip-notes`: it BLANKS the speaker notes (no
 * `aside` is materialized, so the shared file carries no speaker text) while KEEPING
 * the accessible descriptions (they are the slide's text alternative, not private
 * speaker copy). The caller additionally scrubs the note text from the envelope
 * source — see `shareHtmlPlayer`.
 */
function materializeNotes(sections: string[], notesCore: NotesCore, stripNotes = false): string {
	const notes = stripNotes ? sections.map(() => null) : notesCore.extractSlideNotes(sections);
	const descriptions = notesCore.extractSlideDescriptions(sections);
	return sections
		.map((sec, i) => {
			const stripped = notesCore.stripCommentNodes(sec);
			const note = notes[i];
			const description = descriptions[i];
			if (!note && !description) return stripped;
			let inject = '';
			let sectionAttr = '';
			if (note) inject += `<aside class="lattice-notes" hidden data-slide="${i + 1}">${escHtml(note)}</aside>`;
			if (description) {
				const id = `lat-desc-${i + 1}`;
				inject += `<p class="lattice-description" id="${id}">${escHtml(description)}</p>`;
				sectionAttr = ` aria-describedby="${id}"`;
			}
			return stripped.replace(/^(\s*<section\b)([^>]*>)/i, `$1${sectionAttr}$2${inject}`);
		})
		.join('\n');
}

/** The injected capabilities `assemblePlayer` needs, backed by browser APIs. */
type PlayerCaps = {
	parseHtml: (html: string) => Document;
	sanitize: (html: string) => string;
	sha256: (s: string) => Promise<string>;
	inlineAssets: (html: string) => { html: string; count: number; missing: string[] };
	katexCss?: () => string | null;
};
type PlayerCore = {
	assemblePlayer: (
		data: {
			docHtml: string;
			source: string;
			title?: string;
			theme?: unknown;
			config?: unknown;
			notes?: boolean;
			now?: number;
			build?: string;
			playerVersion?: string;
		},
		caps: PlayerCaps,
	) => Promise<{ html: string; report: unknown }>;
};

/**
 * The browser `sha256` capability: UTF-8 bytes → SHA-256 → base64, matching the
 * Node adapter's `crypto.createHash('sha256').update(s,'utf8').digest('base64')`
 * exactly (the value goes into the CSP `script-src 'sha256-…'`, so the encoding
 * must be identical or the hashed player script is refused).
 */
async function sha256Base64(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	const bytes = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
	}
	return btoa(bin);
}

/**
 * Download the current deck as a self-contained `.html` player — the app-side
 * equivalent of the CLI `--player` export. Renders the full deck in-browser,
 * assembles a self-contained document (base64 fonts, full deck CSS), and runs the
 * shared `assemblePlayer` with browser capabilities. Full CSS + full fonts for now
 * (the used-selector / used-family prune is a follow-up, P2b — it needs an
 * offscreen full-deck frame + the css-tree kernel extracted to the browser).
 */
export async function shareHtmlPlayer(
	options: SingleSlideOptions,
	source: string,
	name: string,
	palette: string,
	mode: 'light' | 'dark',
	extra?: ExtraTheme,
	onStatus?: (m: string) => void,
	extraCss?: string,
	deckTitle?: string,
	stripNotes = false,
): Promise<void> {
	onStatus?.('Rendering the deck…');
	const PG = await ensureReady(options);
	const theme = await ensureTheme(options, palette, mode, extra);
	const out = PG.render(source, theme);

	onStatus?.('Embedding fonts…');
	const [fontMod, deckMod, coreMod, sanitizeMod, authoringMod] = await Promise.all([
		import('@/playground/font-embed.js'),
		import('@/playground/deck-preview.js'),
		import('@/playground/player-core.generated.js') as Promise<PlayerCore>,
		import('@/lib/sanitize-slide-html.js'),
		import('@/playground/authoring-core.generated.js'),
	]);
	const fontCss = await fontMod.buildFontEmbedCss();
	const deck = deckMod as unknown as { A11Y_DEFS: string; splitSections: (html: string) => string[]; KATEX_URL: string };
	const notesCore = (authoringMod as unknown as { notesCore: NotesCore }).notesCore;
	const a11yDefs = deck.A11Y_DEFS;
	// The engine omits `data-lattice-slide`; the CLI's emulator re-tags each section
	// with it (lattice-emulator.js), and the player CSS + transport key off it. Split
	// the render into per-slide sections and re-tag them the same way, so the assembled
	// player finds its slides. (The emulator's extra image fixups are preview-parity
	// concerns handled the same way the Studio preview does — i.e. not here.) Then
	// materialize speaker notes + a11y descriptions the same way the emulator does, so
	// the Studio player carries them exactly like the CLI player (notes: true is honest).
	const tagged = deck.splitSections(out.html).map((sec, i) => sec.replace(/^<section\b/i, `<section data-lattice-slide="${i + 1}"`));
	const slides = materializeNotes(tagged, notesCore, stripNotes);
	// --strip-notes privacy export: the note text must appear NOWHERE in the shipped
	// file — not the DOM (blanked above) AND not the verbatim envelope source. Scrub
	// the source with the INDIVIDUAL note bodies lifted from the render (directive-safe:
	// only exact note bodies are removed, never a `_class`/pragma comment), exactly as
	// the CLI emulator does. The note/non-note boundary stays the shared notesCore.
	const envelopeSource = stripNotes
		? notesCore.stripNotesFromSource(source, new Set(tagged.flatMap((s) => notesCore.noteBodiesFromHtml(s))))
		: source;

	// KaTeX is styled by a stylesheet the offline file must carry inline. The core's
	// `katexCss` cap is SYNCHRONOUS, so pre-fetch the vendored sheet here (only when
	// the deck actually renders math) and hand the core a sync accessor.
	const needsKatex = out.html.indexOf('class="katex') !== -1;
	let katexText: string | null = null;
	if (needsKatex) {
		// Fall back to the bundled KATEX_URL when the caller didn't pass one (mirrors
		// studio-presenter) — else a math deck would ship with KaTeX unstyled.
		const katexUrl = options.katexUrl || deck.KATEX_URL;
		try {
			katexText = await (await fetch(katexUrl)).text();
		} catch {
			katexText = null; // core drops the link + reports it; math ships unstyled
		}
	}

	onStatus?.('Assembling the player…');
	const w = out.width || 1280;
	const h = out.height || 720;
	const lang = getFrontMatter(source, 'lang') || 'en';
	const title = deckTitle || getFrontMatter(source, 'title') || 'Lattice deck';
	const css = out.css + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : '');
	const docHtml = buildSelfContainedDoc({
		lang,
		title,
		fontCss,
		css,
		w,
		h,
		a11yDefs,
		slides,
		katexLink: needsKatex ? '<link rel="stylesheet" href="katex.min.css">' : '',
	});

	const caps: PlayerCaps = {
		parseHtml: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
		sanitize: sanitizeMod.sanitizeSlideHtml,
		sha256: sha256Base64,
		// The browser render carries no `file://` refs (a CLI-only concern) — assets are
		// already data-URIs or same-origin URLs, so there is nothing to inline here.
		inlineAssets: (html: string) => ({ html, count: 0, missing: [] }),
		katexCss: () => katexText,
	};

	const { html } = await coreMod.assemblePlayer(
		{
			docHtml,
			source: envelopeSource,
			title,
			theme: { name: palette },
			config: undefined,
			notes: !stripNotes,
			now: Date.now(),
			build: 'studio',
			playerVersion: 'studio',
		},
		caps,
	);

	onStatus?.('Downloading…');
	const { downloadText } = await import('./download');
	downloadText(`${name}.html`, html, 'text/html');
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

/** The `.lattice` project file — the deck source + its review comments in one zip,
 *  so comments travel with the deck (re-import restores both). `now` is stamped by
 *  the caller (app code) into the manifest; the download name gets a `.lattice` ext. */
export async function shareLattice(source: string, name: string, deckTitle: string, deckId: string | undefined, now: number): Promise<void> {
	const [{ exportLatticeBlob }, { listComments }] = await Promise.all([import('./lattice-file'), import('./slide-comments')]);
	const comments = deckId ? listComments(deckId) : [];
	const blob = await exportLatticeBlob(source, deckTitle, comments, now);
	const { downloadBlob } = await import('./download');
	downloadBlob(`${name}.lattice`, blob);
}

/** The self-contained Marp ZIP bundle (renders anywhere). */
export async function shareMarp(options: SingleSlideOptions, source: string, name: string, palette: string, finishClass?: string, finishCss?: string): Promise<void> {
	await ensureReady(options); // PG.marp must be present
	const ex = await exporters();
	// Same finish-embed as the Markdown handoff so the ZIP renders the custom finish.
	await ex.exportMarp(embedFinishInMarkdown(source, finishClass, finishCss), name, palette, options.themeBase, { includeAgent: true });
}

/** One-click image PDF (2× raster, one slide per page). The page-image format
 *  (PNG lossless / JPEG fast) is the Workspace › General preference. `annotations`
 *  (opt-in via the export panel) is the per-page comment sticky-note payload —
 *  index-aligned to the deck's slides; absent → a clean, comment-free PDF. */
export async function sharePdf(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string, annotations?: { title: string; contents: string }[][]): Promise<void> {
	const render = await buildDeckRender(options, source, palette, mode, extra, extraCss);
	const ex = await exporters();
	const { loadSettings } = await import('./studio-store');
	await ex.exportPdf(render, name, onStatus, { deck: name, engine: 'lattice' }, { pageFormat: loadSettings().pdfPages, annotations });
}

/** PowerPoint (image-slides, full-bleed). Each image's alt text is the slide's
 *  accessibility description (WCAG SC 1.1.1) — image-per-slide PPTX otherwise gives
 *  a screen reader nothing. `exportPptx` reads the description from the SAME rendered
 *  section it rasterizes, so the alt stays index-locked to its slide even on
 *  front-matter or auto-split (`split: headings`) decks — no source re-split here. */
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
		frame.srcdoc = buildSrcdoc({ html: render.html, css: render.css, mode: render.mode, geom: render.geom, runtimeUrl: render.runtimeUrl, fontCss: render.fontCss, contentVisibility: false, cursor: false, sync: false, printRules: true, lang: getFrontMatter(source, 'lang') || 'en' });
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
