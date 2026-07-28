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
import type { LatticePlaygroundEngine } from '@/lib/playground-global';
import { renderMarkdown } from '@/lib/render-engine';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { createThemeFetcher } from '@/lib/theme-fetch';
import { glossaryEntries, resolveGlossaryMode } from '../../../../lib/core/glossary-auto.mjs';
import { getFrontMatter, mergeClassTokens, setFrontMatter } from './front-matter';

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.
type PG = LatticePlaygroundEngine;

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
	return typeof window !== 'undefined' ? window.LatticePlayground : undefined;
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
		if (PG) PG.addThemes([extra.css]);
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
	const out = await renderMarkdown(PG, source, theme);
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
	extractSlideCaptions: (sections: string[]) => (string | null)[];
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
			glossary?: { term: string; definition: string }[];
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
	// The color mode the EXPORTED player defaults to — the author's document-fidelity
	// choice, baked onto <html> so the shared file opens the way the sender made it:
	//   · 'light' / 'dark'      → PINNED: always that mode, never re-themed by the receiver.
	//   · 'system' / 'inherited' → DEFER: follow the receiver's OS (a standalone player has no
	//     host to inherit from, so player-core bakes 'inherited' as 'system' — identical here).
	// Independent of `mode` (which selects the render theme); the in-player toggle still
	// overrides per viewer. Defaults to the current preview mode so the export is WYSIWYG.
	scheme: 'light' | 'dark' | 'system' | 'inherited' = mode,
): Promise<void> {
	onStatus?.('Rendering the deck…');
	const PG = await ensureReady(options);
	const theme = await ensureTheme(options, palette, mode, extra);
	const out = await renderMarkdown(PG, source, theme);

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
	// The browser engine scopes every deck rule to the live-preview wrapper
	// (`article.lattice > section …`), but the exported player lays its `<section>`s out
	// FLAT under `#lp-stage` — no `.lattice` ancestor — exactly like the CLI's
	// `cleanDocHtml`. So un-scope the deck CSS to the CLI's shape: strip the
	// `article.lattice > ` prefix so `section.title{…}`, tokens, and every component rule
	// actually match the exported slides. Without this the file ships the full CSS but
	// NONE of it applies — slides render as raw unstyled Markdown, and the used-selector
	// prune then (correctly) drops every never-matching rule. `@container lattice` and
	// `container-name:lattice` use the container NAME, not `.lattice`, so they're
	// untouched. (extraCss is author `section.<name>` CSS, already unscoped.)
	const deckCss = out.css.replace(/article\.lattice\s*>\s*/g, '');
	const css = deckCss + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : '');
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
			theme: { name: palette, mode: scheme },
			config: undefined,
			notes: !stripNotes,
			// The auto-glossary term→definition projection, gated on the `glossary: auto` opt-in —
			// parity with the CLI export's manifest field (#920); omitted otherwise.
			glossary: resolveGlossaryMode(source) === 'auto' ? glossaryEntries(source) : [],
			now: Date.now(),
			build: 'studio',
			playerVersion: 'studio',
		},
		caps,
	);

	// Prune the inlined CSS + fonts down to what the deck actually uses (P2b) — the
	// same kernel + computed-style gate the CLI runs, against an offscreen render of the
	// assembled player. A size lever, never the deliverable: any trouble ships the full
	// (correct) player. Takes the ~1.6 MB full-contract file toward the CLI's ~0.4 MB.
	onStatus?.('Optimizing…');
	let finalHtml = html;
	try {
		const { prunePlayerInBrowser } = await import('./player-prune-browser');
		const pr = await prunePlayerInBrowser(html);
		if (pr.applied) finalHtml = pr.html;
	} catch {
		/* prune skipped — ship the full player */
	}

	onStatus?.('Downloading…');
	const { downloadText } = await import('./download');
	downloadText(`${name}.html`, finalHtml, 'text/html');
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

/** Tuning for the image-set (.zip) export — mirrors lib/export/image-set.js's config
 *  vocabulary. All fields optional; the kernel fills perfect-fidelity defaults. */
export type ImageSetOptions = {
	format?: 'png' | 'jpeg' | 'webp';
	size?: 'max' | '2x' | '1x' | 'half';
	quality?: number;
	thumbnails?: boolean;
	thumbWidth?: number;
	extractSvg?: boolean;
	mode?: 'inherit' | 'light' | 'dark' | 'print';
	svgBackground?: 'inherit' | 'light' | 'dark' | 'print';
};

/** Image set (.zip): one raster per slide (PNG/JPEG/WebP) + opt-in thumbnails + the
 *  deck's chart/diagram SVGs as standalone files + a manifest. The zip layout, naming,
 *  size presets, and manifest are single-sourced with the CLI `.zip` output via the
 *  shared kernel (HARD RULE #1), so both surfaces emit the same set.
 *
 *  `previewMode` is the current light/dark preview; `imageOpts.mode` overrides it:
 *  light/dark render the matching palette variant, print stamps the B&W `class: print`
 *  canvas (rendered light), and inherit keeps the preview mode — mirroring the CLI's
 *  `--image-mode`. The chosen mode also rides in `imageOpts` so the manifest records it. */
export async function shareImageSet(options: SingleSlideOptions, source: string, name: string, palette: string, previewMode: 'light' | 'dark', imageOpts: ImageSetOptions, extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string): Promise<void> {
	const chosen = imageOpts.mode ?? 'inherit';
	let renderMode: 'light' | 'dark' = previewMode;
	let src = source;
	if (chosen === 'light') renderMode = 'light';
	else if (chosen === 'dark') renderMode = 'dark';
	else if (chosen === 'print') { renderMode = 'light'; src = mergeClassTokens(source, 'print'); }
	// Honor `dark` only when a `-dark` companion is actually reachable: ensureTheme() silently falls
	// back to the base (light) palette otherwise — many palettes (a11y-*) ship no dark — while leaving
	// the requested mode 'dark'. Coerce here so BOTH the render AND the recorded slideScheme match the
	// pixels, not the request (the CLI does the same via its resolved paletteName). A saved library
	// theme (`extra`) is single-scheme, so there's no companion to check.
	if (renderMode === 'dark' && !extra) {
		const base = palette.replace(/-dark$/, '');
		const darkExists = await createThemeFetcher(options.themeBase).fetch(`${base}-dark`).then(() => true).catch(() => false);
		if (!darkExists) renderMode = 'light';
	}
	const render = await buildDeckRender(options, src, palette, renderMode, extra, extraCss);

	// The chart/diagram SVG "look" (transparent/light/dark/print) renders the extracted vectors
	// independent of the slides. When it differs from the slides' own scheme, do a SECOND full
	// engine render in that look — so the print texture defs, dark palette, and Mermaid re-bake
	// are all correct (an in-page toggle can't reliably do that). The exporter extracts the SVGs
	// from this render instead of the slide render. print → the B&W `class: print`; light/dark →
	// the matching palette (skipped for a saved library theme, which has no companion scheme).
	// The scheme the slides are ACTUALLY in — recorded in the manifest so it self-describes
	// (not the raw `inherit`). For `inherit` that's the preview mode; the two surfaces can pick
	// different schemes for `inherit`, which is exactly why the manifest must record the resolved one.
	const slideScheme = chosen === 'print' ? 'print' : renderMode;
	const svgLook = imageOpts.svgBackground && imageOpts.svgBackground !== 'inherit' ? imageOpts.svgBackground : null;
	let svgRender: DeckRender | undefined;
	let effectiveSvgBackground = imageOpts.svgBackground;
	// Only re-render for the look when SVGs are actually extracted (else the second render is wasted).
	if (svgLook && svgLook !== slideScheme && imageOpts.extractSvg !== false) {
		if (svgLook === 'print') {
			svgRender = await buildDeckRender(options, mergeClassTokens(source, 'print'), palette, 'light', extra, extraCss);
		} else if (svgLook === 'light' && !extra) {
			svgRender = await buildDeckRender(options, source, palette, 'light', extra, extraCss);
		} else if (svgLook === 'dark' && !extra) {
			// `dark` needs a `-dark` companion; many palettes (a11y-*) ship none. Confirm it exists
			// before rendering — else the render silently falls back to light, so coerce the look to
			// `inherit` so the baked canvas + manifest match what actually renders, not a lie.
			const base = palette.replace(/-dark$/, '');
			const darkExists = await createThemeFetcher(options.themeBase).fetch(`${base}-dark`).then(() => true).catch(() => false);
			if (darkExists) svgRender = await buildDeckRender(options, source, palette, 'dark', extra, extraCss);
			else effectiveSvgBackground = 'inherit';
		} else {
			// A saved library theme has no light/dark companion — the look can't be honored, so
			// coerce back to `inherit` rather than baking a canvas + manifest that claim a look the
			// SVGs don't actually have.
			effectiveSvgBackground = 'inherit';
		}
	}

	const effectiveOpts = { ...imageOpts, mode: slideScheme, svgBackground: effectiveSvgBackground };
	// Manifest provenance. Title from the deck's front-matter (else the filename); palette as
	// rendered. The browser has no package version handy (unlike the CLI), so engineVersion is
	// left null — the `generator: 'studio'` field already marks the source.
	const meta = { title: getFrontMatter(source, 'title') || undefined, palette, engineVersion: null };
	const ex = await exporters();
	await ex.exportImageSet(render, name, effectiveOpts, onStatus, svgRender, meta);
}

type ReadAlongCore = {
	buildReadAlong: (
		texts: readonly string[],
		opts: {
			voice: { model: string; voice: string; speed: number };
			pace?: string;
			acronyms?: ReadonlyMap<string, string>;
			lexicon?: ReadonlyMap<string, string>;
			lang?: string;
		},
	) => { slides: { index: number }[] };
	// The SAME merge the CLI export uses (HARD RULE #1): caption → front-matter caption →
	// note → projection, with the alignment guard that drops the projection wholesale on a
	// section/slide count mismatch. Re-exported from the read-along-core bundle.
	mergeNarration: (
		notes: readonly (string | null | undefined)[],
		projected: readonly string[],
		opts?: { captions?: readonly (string | null | undefined)[]; fmCaptions?: ReadonlyMap<number, string> | null },
	) => string[];
	readAlongToVtt: (ra: unknown) => string;
	readAlongToVttParts: (ra: unknown) => { index: number; vtt: string }[];
};

/**
 * Read-along WebVTT captions — the SAME producer the CLI `--captions` flag uses
 * (lib/core/read-along-build.js + read-along-vtt.js), bundled for the browser
 * (tools/build-read-along-core.js → read-along-core.generated.js — same packaging
 * idiom as the Webpage player's player-core.generated.js). Resolves each slide's
 * narration through the SAME chain the CLI uses (caption → front-matter caption →
 * note → component-aware DOM projection), builds a Cadenza ESTIMATE track per
 * narrated slide, and downloads a zip: one deck-level `<name>.vtt` (continuous,
 * deck-absolute timeline) plus per-slide `<name>.NN.vtt` — identical in shape to
 * the CLI's sidecars (one source of truth, HARD RULE #1). No audio, no TTS key —
 * captions only (the "regenerate" mode default,
 * 2026-07-08-read-along-export-manifest.md).
 */
export async function shareCaptions(
	options: SingleSlideOptions,
	source: string,
	name: string,
	palette: string,
	mode: 'light' | 'dark',
	extra?: ExtraTheme,
	onStatus?: (m: string) => void,
): Promise<void> {
	onStatus?.('Rendering the deck…');
	const PG = await ensureReady(options);
	const theme = await ensureTheme(options, palette, mode, extra);
	const out = await renderMarkdown(PG, source, theme);

	onStatus?.('Reading notes + projecting slides…');
	const [deckMod, authoringMod, readAlongCore, projectionMod, resolveCaptionsMod] = await Promise.all([
		import('@/playground/deck-preview.js'),
		import('@/playground/authoring-core.generated.js'),
		import('@/playground/read-along-core.generated.js') as unknown as Promise<ReadAlongCore>,
		import('./narration-projection'),
		import('@/lib/resolve-captions'),
	]);
	const deck = deckMod as unknown as { splitSections: (html: string) => string[] };
	const notesCore = (authoringMod as unknown as { notesCore: NotesCore }).notesCore;
	const sections = deck.splitSections(out.html);

	// The FULL narration chain, identical to the CLI export's writeCaptionsSidecar
	// (HARD RULE #1): a slide's inline `<!-- caption: -->` → its front-matter `captions:`
	// entry → its speaker note → the component-aware DOM projection. So a note-free deck
	// exported from the docs site now produces the SAME projected captions the CLI does —
	// closing the gap where the client `.vtt` was silently empty (the CLI already projected).
	const notes = notesCore.extractSlideNotes(sections);
	const captions = notesCore.extractSlideCaptions(sections);
	// Front-matter `captions:` is keyed by 1-based AUTHORED slide number. The docs render
	// (`renderMarkdown`) never runs the emulator's Fit-Spine autosplit, so `sections` is 1:1
	// with the authored slides and `fmCaptions.get(i+1)` binds correctly — we deliberately do
	// NOT port the CLI's `AUTOSPLIT_APPLIES` guard (which nulls the map): here it would be a
	// dead no-op at best, and wrong if keyed off the `autosplit:` front-matter alone. An
	// autosplit deck's exported `.vtt` differs from the CLI's by design (the CLI splits).
	const fmCaptions = resolveCaptionsMod.frontMatterCaptions(source);
	const acronyms = resolveCaptionsMod.acronymSpokenMap(source);
	const lexicon = resolveCaptionsMod.lexiconMap(source); // author lexicon beats the built-in commons
	const lang = resolveCaptionsMod.frontMatterLang(source); // non-English → bypass English say-as (#919)
	// Project the ALREADY-rendered sections (no second full render — projected[i] ≡ sections[i]
	// by construction). Failure degrades to notes-only, exactly as the CLI's projection does
	// (lattice-emulator.js projectDeckSpeechFromHtml), so a notes-full deck still exports.
	let projected: string[] = [];
	try {
		projected = await projectionMod.projectSectionsToSpeech(sections);
	} catch {
		projected = []; // projection unavailable → note/caption text still narrates
	}
	const slideTexts = readAlongCore.mergeNarration(notes, projected, { captions, fmCaptions });

	onStatus?.('Building captions…');
	const readAlong = readAlongCore.buildReadAlong(slideTexts, {
		// Voice is metadata only — captions time off `pace`, not the voice (regenerate
		// mode has no audio). Mirrors the CLI's default; the deck acronym registry expands.
		voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
		pace: 'moderate',
		acronyms,
		lexicon,
		lang: lang ?? undefined,
	});
	if (!readAlong.slides.length) throw new Error('nothing to narrate — the deck has no notes, captions, or projectable slide content');

	onStatus?.('Packaging…');
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	zip.file(`${name}.vtt`, readAlongCore.readAlongToVtt(readAlong)); // deck-level, continuous
	const parts = readAlongCore.readAlongToVttParts(readAlong); // per-slide, slide-relative
	const pad = Math.max(2, String(notes.length).length);
	for (const { index, vtt } of parts) zip.file(`${name}.${String(index + 1).padStart(pad, '0')}.vtt`, vtt);
	const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

	onStatus?.('Downloading…');
	const { downloadBlob } = await import('./download');
	downloadBlob(`${name}-captions.zip`, blob);
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
