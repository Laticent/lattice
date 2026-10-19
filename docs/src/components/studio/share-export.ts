// Studio Share — the REAL export pipeline, wired to the engine exporters.
//
// WRAP, DON'T REINVENT (HARD RULE #15). Every format below is produced by the
// SAME code the Drawing Board ships (drawing-board-export.js) — Markdown (source
// + embedded theme/components), the Marp ZIP bundle, the one-click image PDF /
// PPTX, and the browser's vector Print. This module only assembles the inputs
// those functions need (an engine render of the FULL deck) from the Studio's
// renderer options + current palette, so Share hands off real artifacts rather
// than a toast.

import { deriveKatexProviderUrl, ensureKatexProvider } from '@/lib/ensure-katex';
import { ensureEngine } from '@/lib/load-engine';
import { offFences, offFencesSentence } from '@/lib/off-fences';
import type { LatticePlaygroundEngine } from '@/lib/playground-global';
import { renderMarkdown } from '@/lib/render-engine';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { createThemeFetcher } from '@/lib/theme-fetch';
import { glossaryEntries, resolveGlossaryMode, withoutAutoGlossary } from '../../../../lib/core/glossary-auto.mjs';
import { sanitizeStyleText } from '../../../../lib/core/sanitize-style-text.mjs';
import { unwrapFlatSheet } from '../../../../lib/export/unwrap-flat-sheet.mjs';
import { sourceHasMath } from '../../../../lib/plugins/math/math.syntax.mjs';
import { samplesBaseFor } from '../../lib/samples-base';
import type { StudioComponent } from './component-library';
import type { StudioFinish } from './finish-library';
import { getFrontMatter, mergeClassTokens, stripFrontMatter, withPrintCanvas, writeFrontMatterLine } from './front-matter';
import type { LatticeMedia } from './lattice-file';
import type { BakeVoice } from './read-aloud';
import type { SlideComment } from './slide-comments';
import type { OverflowMarker } from './studio-store';
import type { StudioTheme } from './theme-library';
import { MAX_EMBEDDED_MEDIA_BYTES, MAX_LATTICE_MEDIA_BYTES } from './zip-limits';

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
	// No Mermaid URL: the capture frame's runtime loads the diagram library (the Mermaid
	// plugin's payload) from beside `runtimeUrl` — our own origin, never a third party at
	// export time (engineering/decisions/2026-09-03-self-hosted-runtime-deps.md).
	/** Local dagre URL (`<assetBase>lattice-dagre.js`), so a state chart that BRANCHES
	 *  is laid out rather than falling back to the numbered column. Absent → no tag is
	 *  injected and the machine renders as a column — a different layout, not a missing
	 *  one, which is why lib/runtime/index.js says so on the console. Split out of the
	 *  runtime bundle because inlining it put 25.9 KiB gzipped on every reader of every
	 *  deck for an engine only a branching machine uses. */
	dagreUrl?: string;
	/** Who a clipped slide's marker speaks to in the exported file (lib/core/resolve-overflow-marker.js). Set by the export entry points, never by `buildDeckRender`: the Studio's own measuring and reading views stay on the authoring default. */
	overflowMarker?: OverflowMarker;
	/** The engine's FLAT pack (`styles: 'flat'`), wrapper-stripped, with the local component
	 *  CSS after it. Present only when the caller asked for the flat mode — a host that shows
	 *  slide content outside a slide (the Reading view). */
	flatCss?: string;
	/** Web origins the reader allowed this deck's images to load from (trio follow-up 11),
	 *  from `SingleSlideOptions.webOrigins`. The capture frame and the print document load
	 *  those and export every other web image as the placeholder. */
	webOrigins?: string[];
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
/** A saved component the deck uses: its class name and its CSS. */
export type LocalComponentCss = { name: string; css: string };
/** The saved Library records a deck uses — what a `.lattice` project carries along. */
export type DeckPackages = { themes: StudioTheme[]; components: StudioComponent[]; finishes: StudioFinish[] };

/**
 * Register the theme to render with and return its name. A saved library theme
 * (`extra`) has no on-disk CSS, so we register the raw CSS into the engine; a
 * built-in palette is fetched (+ its dark companion) by name as before.
 */
async function ensureTheme(options: SingleSlideOptions, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, source?: string): Promise<string> {
	const PG = pg();
	// KaTeX's faces are stripped from the registered base until something asks for them
	// (2026-08-17 loading audit §9.6). The EXPORT path composes from that same registered
	// base — `renderMarkdown` → `ThemeStore.cssFor` → `byName.get('lattice')` — so without
	// this an exported PDF/PPTX/player could carry math laid out in FALLBACK metrics. That
	// is a change to exported artifact BYTES, which CLAUDE.md makes a stop-and-show gate,
	// so it must not depend on a live preview having happened to warm the faces first.
	if (source && sourceHasMath(source)) {
		await createThemeFetcher(options.themeBase).ensureKatexFaces().catch(() => {});
	}
	if (extra) {
		// ALWAYS (re-)register so an edited theme re-saved under the same name
		// exports with the current CSS (addThemes overwrites by name); a hasTheme
		// guard would silently export the stale theme.
		if (PG) PG.addThemes([{ name: extra.name, css: extra.css }]);
		return extra.name;
	}
	const themes = createThemeFetcher(options.themeBase);
	await themes.ensure(palette, mode);
	return mode === 'dark' && PG?.hasTheme(`${palette}-dark`) ? `${palette}-dark` : palette;
}

/**
 * The render option that lets an EXPORT show the deck's Library photos: a name → `data:` URI map for
 * the photos `source` names. Empty for a deck that names none, which never loads the registry. A
 * `blob:` URL from the live preview is not usable in a file or a capture frame (media-urls.ts).
 */
async function assetOpts(source: string): Promise<{ assetUrls?: Record<string, string>; assetAlts?: Record<string, string> }> {
	if (!/\basset:[a-z0-9]/i.test(source)) return {};
	try {
		const { altsFor, dataUrlsFor } = await import('./media-urls');
		const assetUrls = await dataUrlsFor(source);
		return { assetUrls, assetAlts: await altsFor(source) };
	} catch (e) {
		// An EMPTY map, not none: with none the Studio's render hook would fill in the preview's `blob:` URLs,
		// which die with the tab. With an empty map every photo is drawn as the missing-image stand-in.
		console.warn('lattice: could not read the Library photos for an export', e);
		return { assetUrls: {} };
	}
}

/**
 * Render the FULL deck through the engine and assemble the `render` object the
 * image exporters need. This is the single piece of glue Share adds on top of
 * the shared exporters.
 */
export async function buildDeckRender(
	options: SingleSlideOptions,
	source: string,
	palette: string,
	mode: 'light' | 'dark',
	extra?: ExtraTheme,
	extraCss?: string,
	styles: 'scoped' | 'flat' = 'scoped',
): Promise<DeckRender> {
	const PG = await ensureReady(options);
	const theme = await ensureTheme(options, palette, mode, extra, source);
	const out = await renderMarkdown(PG, source, theme, { samplesUrl: samplesBaseFor(options.themeBase), ...(await assetOpts(source)), ...(styles === 'flat' ? { styles } : {}) });
	const { previewFontFaceCss } = await loadDeckRenderFonts();
	return {
		html: out.html,
		// Saved local-component CSS (extraCss) rides last so the deck's `.<name>`
		// slides export with their styles — same composition as the live preview.
		css: out.css + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : ''),
		mode,
		geom: { w: out.width || 1280, h: out.height || 720 },
		runtimeUrl: options.runtimeUrl,
		fontCss: previewFontFaceCss(),
		dagreUrl: options.dagreUrl,
		webOrigins: options.webOrigins ?? [],
		...(out.flatCss !== undefined
			? { flatCss: unwrapFlatSheet(out.flatCss) + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : '') }
			: {}),
	};
}

/** `buildDeckRender`'s one on-demand module. Exported so a surface's idle warm-up
 *  (`warmArticleProjection`, `warmNarrationProjection`) fetches it with the rest of its path. */
export const loadDeckRenderFonts = () => import('@/playground/font-embed.js');

type ExportMod = typeof import('@/components/studio/export/deck-export.js');
function exporters(): Promise<ExportMod> {
	return import('@/components/studio/export/deck-export.js');
}

// ── Webpage (.html) — the self-contained player, assembled in the browser ────────
// The APP side of the download the original brief called for (P2 of
// engineering/decisions/2026-07-08-studio-html-player-export.md). It drives the
// SAME pure assembler the CLI `--player` uses (lib/export/player-core.mjs, bundled
// for the browser as player-core.generated.js), supplying browser capabilities in
// place of the Node ones — no engine byte lives twice (HARD RULE #1).

/** Escape text for an HTML text node / attribute value. */
/** The bake's bookends in the shape `narrationPayload` takes (lib/export/player-core.mjs): the
 *  greeting's four variants under `greeting`, the closing under `closing`. A greeting missing a
 *  variant is left out whole, as the LTT producer would drop it anyway. */
function bookendsPayload(baked: Record<string, { text: string; track: unknown; cues: { audio: string | null; clip?: string; leadMs?: number }[] }> | undefined) {
	if (!baked) return null;
	const one = (b: (typeof baked)[string] | undefined) =>
		b ? { text: b.text, track: b.track, clips: b.cues.map((c) => (c.audio && c.clip ? { audio: c.audio, clip: c.clip, leadMs: c.leadMs } : null)) } : null;
	const variants = ['morning', 'afternoon', 'evening', 'neutral'] as const;
	const greeting = variants.every((v) => baked[`greeting-${v}`]) ? Object.fromEntries(variants.map((v) => [v, one(baked[`greeting-${v}`])])) : null;
	const closing = one(baked.closing);
	return greeting || closing ? { ...(greeting ? { greeting } : {}), ...(closing ? { closing } : {}) } : null;
}

/** A deck's bookends as caption text: the neutral greeting, and the closing. */
function captionBookends(
	ends: { greeting: { template: string } | null; closing: { text: string } | null },
	greetingText: (template: string, variant: 'morning' | 'afternoon' | 'evening' | 'neutral') => string,
) {
	return { greeting: ends.greeting ? greetingText(ends.greeting.template, 'neutral') : null, closing: ends.closing?.text ?? null };
}

function escHtml(s: string): string {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
	return escHtml(s).replace(/"/g, '&quot;');
}

/**
 * The document `assemblePlayer` packs (its `docHtml`), built from the CLI's own pieces: the deck
 * <style> is `exportDeckStyleText` (lib/export/export-scaffold.js), the same template lattice.js
 * fills, with the deck's `style:` block packed by `exportGlobalCss`; the texture <defs> are the sets
 * the page references, chosen as the CLI chooses them. Until 2026-10-17 this was a hand-written
 * mirror that carried none of the Marp system rules, no `style:` block and every texture set, so
 * the same deck packed two ways (decisions/2026-10-16-player-as-library-audit.md §11.9). The
 * skip link and `<main>` the CLI's page also carries never reach a player, so they are left out.
 * Offline by construction — the `#lattice-embedded-fonts` block is data-URI base64, not bundled URLs.
 */
function buildSelfContainedDoc(p: { lang: string; title: string; fontCss: string; katexFacesCss: string; deckStyle: string; a11yDefs: string; slides: string; katexLink: string }): string {
	return `<!DOCTYPE html>
<html lang="${escAttr(p.lang)}"><head><meta charset="utf-8">
<title>${escHtml(p.title)}</title>
<style id="lattice-embedded-fonts">${sanitizeStyleText(p.fontCss)}${p.katexFacesCss}</style>
${p.katexLink}
<style>
${p.deckStyle}
</style></head><body>
${p.a11yDefs}
${p.slides}
</body></html>`;
}

type NotesCore = {
	extractSlideNotes: (sections: string[]) => (string | null)[];
	extractSlideDescriptions: (sections: string[]) => (string | null)[];
	extractSlideSayLines: (sections: string[]) => (string | null)[];
	stripCommentNodes: (html: string) => string;
	/** Same deck? Same slide count, same markup per slide, whitespace ignored. Declared here
	 *  because this object is handed to `stripNotesCut`, whose own kernel type requires it —
	 *  the two must stay in step or the Studio's cut measurement stops typechecking. */
	sameSlideShape: (a: string[], b: string[]) => boolean;
	noteBodiesFromHtml: (sectionHtml: string) => string[];
	stripNotesFromSource: (source: string, noteBodies: Set<string> | string[], opts?: { boundary?: string }) => string;
	SCRUB_BOUNDARIES: readonly string[];
	auditStrippedSource: (strippedSource: string) => string[];
	slideNoteRecord: (sections: string[]) => SlideNoteRecord[];
};

/** One slide's whole comment channel, lifted once at the render boundary. */
// `note` is the display JOIN of a slide's notes; `noteBodies` is the pre-join array. The
// privacy scrub must use `noteBodies` — see `slideNoteRecord` in lib/authoring/notes-core.js.
type SlideNoteRecord = {
	note: string | null;
	noteBodies: string[];
	description: string | null;
	say: string | null;
};

/** The depth-aware `<section>` walker (lib/core/split-sections.js), via the authoring bundle. */
type SplitSectionsCore = (html: string) => { type: 'gap' | 'section'; openTag?: string; inner?: string; cls?: string }[];

/**
 * Materialize speaker notes + accessible descriptions into the (already re-tagged)
 * sections, mirroring the CLI emulator (lattice.js): the engine emits notes
 * ONLY as raw HTML comments, so — like the emulator — lift them via the shared
 * `notesCore` and inject a `hidden` `aside.lattice-notes` (spoken by the presenter,
 * kept out of the a11y tree) plus an sr-only `p.lattice-description` referenced by
 * `aria-describedby`. Without this the Studio player would silently drop both (its
 * notes sheet would find no aside, and screen-reader slide descriptions would vanish
 * — a WCAG 1.1.1 regression vs. the CLI player).
 *
 * Reads the channel from a RECORD lifted at the render boundary, not from the sections
 * it is injecting into. Those two used to be the same thing, and that coupling is what
 * broke: the sections handed here have been through the capture frame, whose sanitizer
 * deletes comment nodes, so every note and description silently became null — and the
 * same empty set left the envelope scrub with nothing to remove, inverting
 * `--strip-notes` into a leak. The record is taken before any of that happens, so this
 * function no longer cares what the bake did to the markup.
 *
 * `stripNotes` mirrors the CLI `--strip-notes`: it BLANKS the speaker notes (no
 * `aside` is materialized, so the shared file carries no speaker text) while KEEPING
 * the accessible descriptions (they are the slide's text alternative, not private
 * speaker copy). The caller additionally scrubs the note text from the envelope
 * source — see `shareHtmlPlayer`.
 */
function materializeNotes(sections: string[], notesCore: NotesCore, record: SlideNoteRecord[], stripNotes = false): string {
	const notes = record.map((r) => (stripNotes ? null : r.note));
	const descriptions = record.map((r) => r.description);
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

type PlayerCore = {
	assemblePlayer: (
		data: {
			docHtml: string;
			source: string;
			title?: string;
			/** The deck's real canvas in px. Omitted → the player's historical 1280x720 (#1577). */
			width?: number;
			height?: number;
			theme?: unknown;
			config?: unknown;
			notes?: boolean;
			/** `false` ships the still even when the deck asks for motion; undefined inherits
			 *  the deck's own `motion:` / `player-motion:` registers. Suppression only. */
			playerMotion?: boolean;
			glossary?: { term: string; definition: string }[];
			narration?: unknown;
			/** `false` leaves the Guide out of a narrated export; otherwise it ships (player-core). */
			guide?: boolean;
			readAlong?: unknown;
			now?: number;
			build?: string;
			playerVersion?: string;
			host?: string;
		},
		caps: import('./player-caps-browser').PlayerCaps,
	) => Promise<{ html: string; report: unknown }>;
	/** The export document's deck stylesheet, the CLI's own (lib/export/export-scaffold.js). */
	exportDeckStyleText: (p: { w: number; h: number; deckCss: string; globalCss?: string }) => string;
	/** The deck's front-matter `style:` CSS, packed as the CLI packs it (lib/export/author-css.js). */
	exportGlobalCss: (fmText: string, slidesHtml: string) => string;
	/** The texture pattern sets the page references, as the CLI selects them (lib/core/accessibility-textures.js). */
	texturePatternDefs: (only?: string[]) => string;
	texturePrefixesReferencedIn: (text: string) => string[];
	/** KaTeX's sheet made self-contained, as the CLI makes it (lib/export/katex-inline.js). */
	katexFontFiles: (css: string) => string[];
	inlineKatexFonts: (css: string, base64Of: (file: string) => string | null) => string;
	splitKatexSheet: (inlined: string) => { faces: string; rules: string };
	/** The engine's front-matter parser (lib/engine/directives.js). */
	parseFrontMatter: (src: string) => { directives: Record<string, unknown>; body: string };
	/** The engine version, from the root package.json at build time. */
	ENGINE_BUILD: string;
};

/**
 * Download the current deck as a self-contained `.html` player — the app-side
 * equivalent of the CLI `--player` export. Renders the full deck in-browser,
 * assembles a self-contained document (base64 fonts, full deck CSS), and runs the
 * shared `assemblePlayer` with browser capabilities, then prunes the CSS and the
 * font faces the deck never uses (`player-prune-browser.ts`, P2b). Kept faces are
 * glyph-subset by the CLI's own subsetter, so the packer stages match the CLI's.
 */
/**
 * The overflow-marker level a Webpage export bakes at: the workspace's standing setting, resolved by
 * `resolveExportOverflowMarker` (lib/core/resolve-overflow-marker.js), the one resolver the CLI's
 * `--overflow-marker` and the Marp bundle also go through. `loadSettings()` does not validate the
 * stored value, so the resolver is what keeps a stored `off` or a junk string from silencing the
 * marker; it always answers a level, never nothing.
 */
async function exportOverflowMarker(): Promise<OverflowMarker> {
	const [{ loadSettings }, core] = await Promise.all([
		import('./studio-store'),
		import('../../../../lib/core/resolve-overflow-marker.js') as unknown as Promise<{ default: { resolveExportOverflowMarker: (o: { workspace?: unknown }) => { marker: OverflowMarker } } }>,
	]);
	return core.default.resolveExportOverflowMarker({ workspace: loadSettings().overflowMarker }).marker;
}

/** An export's render, with the marker level the export setting names (`reader` unless the author chose otherwise). The capture frame paints the runtime's marker into every raster, so without this a clipped slide reached a PDF, PNG or PowerPoint reader with the red ring and "OVERFLOWS" (followups.d/2739-p6). */
export async function withExportMarker(render: DeckRender): Promise<DeckRender> {
	return { ...render, overflowMarker: await exportOverflowMarker() };
}

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
	// Narration, when the author asked for it in the export panel. Absent (or both switches
	// off) leaves the file byte-identical to a player built before narration existed.
	//
	// The two switches are independent because they cost wildly different amounts and are
	// separately useful — see NarrationExportOptions for the four states. `audio` is the one
	// that synthesizes: the bake reads this device's clip store first and bills only the
	// sentences it does not have, in `voice`, and REFUSES if any of them cannot be prepared.
	narration?: { captions: boolean; audio: boolean; voice: BakeVoice; allowPartial?: boolean; signal?: AbortSignal; guide?: boolean },
	// Whether the exported file carries the deck's CHART MOTION. `false` ships the still even
	// when the deck sets `motion: on` — the same one-way suppression the CLI's
	// `--no-player-motion` performs, and the same field `assemblePlayer` reads, so the Studio
	// and the CLI cannot drift on what the flag means. Undefined inherits the deck's own
	// registers (`motion:`, with `player-motion: off` as the author-side opt-out).
	playerMotion?: boolean,
	// Fetch pictures from OTHER sites too, and embed them — the author's opt-in from the export
	// panel. Off, only this site's pictures are fetched and every other one ships as the
	// placeholder. The file is self-contained either way; this decides only whether the author's
	// browser contacts those sites now.
	embedWebPictures = false,
	// Origins whose pictures the player loads only after the reader presses "Load pictures" — the CLI's
	// `--player-consent`, through the same `assemblePlayer` field. Ignored for pictures that were embedded.
	consentOrigins: string[] = [],
	// Resolves to a DEGRADATION reason when the export completed but shipped something
	// lesser than intended (today: the diagram bake did not run), else undefined. The
	// caller surfaces it in the completion toast — see the return at the end.
): Promise<string | undefined> {
	onStatus?.('Rendering the deck…');
	const PG = await ensureReady(options);
	// The deck's own theme, never its `-dark` twin. The CLI renders the theme the deck declares and
	// lets `color-mode:` set the slides' `dark` class; the Studio rendered `<palette>-dark` whenever
	// its PREVIEW was dark, so the same deck exported under two theme names (§11.9 of
	// decisions/2026-10-16-player-as-library-audit.md). The player carries both modes either way
	// (its dark block), and `scheme` below picks the one it opens in.
	const theme = await ensureTheme(options, palette, 'light', extra, source);
	// `styles: 'flat'`: the player is a document that shows slide content outside a slide, so it
	// asks for the flat mode and ships `out.flatCss`. `out.css` stays the scoped preview shape
	// for the diagram bake's capture frame below.
	let out = await renderMarkdown(PG, source, theme, { styles: 'flat', samplesUrl: samplesBaseFor(options.themeBase), ...(await assetOpts(source)) });
	// Split on STRUCTURE, as the CLI's `--player` does (lib/core/structural-split.js): at
	// portrait/square/mobile a multi-member slide becomes cover → one element per page → closing.
	// `settle: false` is the CLI's own setting, so both hosts emit the same pages. A no-op at
	// landscape. Without it a `size: story` deck exported 8 slides here and 32 from the CLI.
	// The strip-notes candidate below re-renders through the same cut, so it compares like-for-like.
	// Loud when the bundle lacks it: the export would quietly ship each multi-element slide as one
	// crowded page, and a portrait deck as a different file from the CLI's.
	if (!PG.splitForPreview) console.warn('lattice: this engine bundle has no structural split; a portrait, square or mobile deck exports unsplit.');
	const splitLikeCli = <R extends { html: string; width?: number; height?: number }>(r: R, src: string): R =>
		PG.splitForPreview ? { ...r, html: PG.splitForPreview(r.html, src, r.width || 1280, r.height || 720, { settle: false }).html } : r;
	out = splitLikeCli(out, source);

	onStatus?.('Embedding fonts…');
	const [fontMod, coreMod, sanitizeMod, authoringMod] = await Promise.all([
		import('@/playground/font-embed.js'),
		import('@/playground/player-core.generated.js') as Promise<PlayerCore>,
		import('@/lib/sanitize-slide-html.js'),
		import('@/playground/authoring-door.js').then((door) => door.loadAuthoring()),
	]);
	const fontCss = await fontMod.buildFontEmbedCss();
	const notesCore = (authoringMod as unknown as { notesCore: NotesCore }).notesCore;
	const splitSectionsCore = (authoringMod as unknown as { splitSectionsCore: SplitSectionsCore }).splitSectionsCore;
	// THE COMMENT CHANNEL, LIFTED ONCE, BEFORE ANYTHING TOUCHES THE MARKUP. Notes,
	// `describe:` and `say:` ride as HTML comments, and every pipeline below this
	// point destroys them — the capture frame sanitizes, and `sanitizeSlideHtml` deletes
	// comment nodes. Reading them here, from the engine's own output, is what keeps the
	// notes sheet, the a11y descriptions and the `--strip-notes` scrub independent of
	// what the bake does.
	//
	// Split DEPTH-AWARE. A flat walk that pairs each `<section>` with the NEXT `</section>`
	// (what `deck.splitSections` did until it moved onto this same walker) truncates a slide
	// containing a hand-authored `<section>` at the nested close tag, and its comments fall
	// outside the chunk — while the slide COUNT stays correct, which is exactly why a
	// count-parity check cannot catch it.
	// A SEPARATE variable from `bakeWarning`, merged with it at the end. The bake's own branches
	// ASSIGN rather than append (they are mutually exclusive), so setting bakeWarning here would
	// be silently clobbered by any bake outcome — the exact failure the merge below the audit
	// already documents.
	let fidelityWarning: string | undefined;
	const sectionsOf = (html: string) =>
		splitSectionsCore(html)
			.filter((p) => p.type === 'section')
			.map((p) => `${p.openTag}${p.inner}</section>`);
	// WEB IMAGES (trio follow-up 11). The player never loads one: its policy is `img-src data:`.
	// So its web images are placeholders on EVERY path, the bake's fallback (the static render)
	// included, which used to ship the raw address and show a broken-image mark.
	const { default: remoteRef } = (await import('../../../../lib/core/remote-ref.js')) as unknown as { default: typeof import('../../../../lib/core/remote-ref.js') };
	// PICTURES BY URL (followup 2358-p2). The same policy that blocks web images blocks EVERY
	// picture that is not already a `data:` URI, a same-origin `/images/x.jpg` included, so a
	// `![bg](…)` panel and a video poster the preview showed came out blank in the player. Fetch
	// each one from THIS origin now and embed it; a picture from another site is left to the
	// placeholder pass below and counted — unless the author turned on "Embed pictures from other
	// sites", which fetches those too. The recipient's file loads nothing on open either way.
	onStatus?.('Embedding images…');
	const { inlineUrlMedia, browserFetchDataUri, describeMissingMedia, sourceHasWebPictures } = await import('../../../../lib/export/inline-url-media.mjs');
	const mediaCache = new Map();
	const fetchDataUri = browserFetchDataUri(fetch.bind(globalThis), { ownOrigin: location.origin, followRedirects: embedWebPictures });
	const withMedia = (html: string) => inlineUrlMedia(html, { baseUrl: document.baseURI, origins: [location.origin], anyWebOrigin: embedWebPictures, fetchDataUri, cache: mediaCache });
	const media = await withMedia(out.html);
	const placed = remoteRef.blockWebImages(media.html, []);
	// `let`: the strip-notes cut below swaps in the scrubbed render, and the bake must bake THAT.
	let playerHtml = placed.html;
	// Reported with the other degradations at the end: a picture the file cannot show is a
	// silent gap otherwise, because the player's placeholder looks deliberate.
	// Our own origin is left out of the placeholder list: a picture of ours reaching that pass is one
	// that failed to embed, and `missing` already names it with its reason.
	const mediaWarning = describeMissingMedia(media.missing, remoteRef.webOrigins(placed.blocked.filter((b) => b.kind !== 'diagram')), location.origin, embedWebPictures, sourceHasWebPictures(source, location.origin));
	let recordSections = sectionsOf(playerHtml);
	let noteRecord = notesCore.slideNoteRecord(recordSections);
	// `let`, because the guard below picks WHICH cut ships once it knows which one reproduces
	// the deck — the source that ships is the source that was rendered.
	let envelopeSource = source;
	// --strip-notes privacy export: the note text must appear NOWHERE in the shipped file —
	// not the DOM, and not the verbatim envelope source. Scrub the source with the INDIVIDUAL
	// note bodies lifted from the render (directive-safe: only exact note bodies are removed,
	// never a `_class`/pragma comment), exactly as the CLI emulator does. The note/non-note
	// boundary stays the shared notesCore.
	//
	// Read those bodies from the RECORD, not from the baked sections below. Those have been
	// through the bake, so scraping them for note bodies is what produced an empty set and
	// turned this scrub into a no-op — the leak. A multi-note slide joins its notes with a
	// blank line, so the record carries them pre-join: the scrub matches INDIVIDUAL bodies.
	//
	// THEN RENDER THAT SOURCE, and ship its bytes. Blanking the note copies after the fact
	// left the comment's own whitespace behind, so a stripped slide carried one byte more
	// than the same slide written without a note — naming WHICH slides had one, computable
	// by the recipient from the shipped file alone, since the envelope carries this same
	// scrubbed source to re-render (#1985). Parity with the CLI is the point: `--strip-notes`
	// and this button are the same guarantee, and the CLI does exactly this
	// (lattice.js, "PASS 2"). Costs one extra render, on this flag's path only.
	//
	// FAIL-CLOSED ON FIDELITY, and the measurement lives in `strip-notes-guard.ts` — loaded on
	// demand, because it runs when someone exports and never on the way to first paint. Keeping
	// it inline put the studio route over its eager-payload budget, and the ledger's own
	// `architect-model.js` note makes the same argument for the same reason.
	if (stripNotes) {
		const { stripNotesCut } = await import('./strip-notes-guard.js');
		const cut = await stripNotesCut(
			source,
			notesCore,
			new Set(noteRecord.flatMap((r) => r.noteBodies || [])),
			recordSections,
			sectionsOf,
			// Placeholders on the candidate too, so it compares like-for-like with `recordSections`.
			// The same embed + placeholder passes, so the candidate compares like-for-like with
			// `recordSections`. The cache means it fetches nothing the first pass already did, and
			// the notes cut changes no picture, so the first pass's report stands for it.
			async (src) => renderMarkdown(PG, src, theme, { styles: 'flat', samplesUrl: samplesBaseFor(options.themeBase), ...(await assetOpts(src)) }).then((r) => splitLikeCli(r, src)).then(async (r) => ({ ...r, html: remoteRef.blockWebImages((await withMedia(r.html)).html, []).html })),
		);
		envelopeSource = cut.source;
		fidelityWarning = cut.warning;
		if (cut.out && cut.sections) {
			out = cut.out;
			// The bake reads `playerHtml`, not `out.html`, so re-point it at the scrubbed render.
			// Without this the bake shipped the AUTHORED render, note whitespace and all (#1985).
			playerHtml = out.html;
			recordSections = cut.sections;
			noteRecord = notesCore.slideNoteRecord(cut.sections);
		}
	}
	// The engine omits `data-lattice-slide`; the CLI's emulator re-tags each section with it
	// (lattice.js), and the player CSS + transport key off it. Split the render into
	// per-slide sections and re-tag them the same way, so the assembled player finds its slides.
	// (The emulator's extra image fixups are preview-parity concerns handled the same way the
	// Studio preview does — i.e. not here.) Then materialize speaker notes + a11y descriptions the
	// same way the emulator does, so the Studio player carries them exactly like the CLI player
	// (`notes: true` is honest).

	// BAKE FIRST. The engine's render is static: a ```mermaid fence is still a
	// `<pre><code class="language-mermaid">`, and state-chart / function-plot are still
	// inert scripts — all three are inflated by the RUNTIME in the preview iframe, and
	// the player ships no runtime (it strips every script). So an un-baked export froze
	// the un-rendered form: raw Mermaid source on the slide and, worse, a wall of it
	// where Read·Article should have shown the diagram. `bakeDeckSections` runs the deck
	// through the shared capture frame (runtime + our vendored Mermaid, fonts settled)
	// and hands back the settled markup — the browser-side twin of the CLI's own
	// "Bake the player's DOM" step. A bake that can't run falls back to the static
	// render: the same file we shipped before, never a failed export.
	onStatus?.('Rendering diagrams…');
	let baked: string[] | null = null;
	let bakeWarning: string | undefined;
	try {
		const ex = await exporters();
		const result = await ex.bakeDeckSections({
			html: playerHtml,
			css: out.css + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : ''),
			mode: 'light', // the render's own mode (above); the frame forces no scheme on the slides
			geom: { w: out.width || 1280, h: out.height || 720 },
			runtimeUrl: options.runtimeUrl,
			fontCss,
			...(options.dagreUrl ? { dagreUrl: options.dagreUrl } : {}),
			// WHO a clipped slide's marker speaks to: the workspace's export setting (`reader` unless
			// the author chose `author`), as the Marp bundle reads it and as the CLI's
			// `--overflow-marker` defaults. Without it the frame took itself for an authoring
			// surface, and every Webpage export shipped the red ring, "OVERFLOWS" and the "Fix Me"
			// chips to its reader (decisions/2026-10-16-player-as-library-audit.md §11.8).
			// Through the resolver the CLI and the Marp bundle use, so a stored `off` (never a valid
			// standing default) or a junk value falls back to `reader` instead of silencing every clip.
			overflowMarker: await exportOverflowMarker(),
		}, { playerBake: true });
		// Slide-count parity is the correctness gate: notes, narration cues and the
		// manifest are all indexed by slide, so a bake that lost or gained a section
		// would silently mis-bind them. Mismatch → use the static render.
		if (result && result.sections.length === noteRecord.length) {
			// The bake's markup is taken as-is. The comment channel it destroys was already
			// lifted into `noteRecord` above, so nothing downstream depends on the sanitizer
			// having spared anything — which is what makes this safe to swap wholesale.
			baked = result.sections;
			// Honesty, matching the CLI's own bake warnings: a diagram Mermaid could not
			// render ships as its source `<pre>`, and the author should hear that once
			// rather than discover it in the file.
			if (result.failed) {
				console.warn(`lattice: ${result.failed} figure(s) (diagrams or plots) failed to render — they ship as their source, not as a drawing.`);
				// This is the LIKELIER degradation (some diagrams rendered, some did not) and it
				// reached only the console, so an export shipping N diagrams as raw source still
				// said "Webpage ready." The rare total failure surfaced and the common partial one
				// did not.
				bakeWarning = `${result.failed} figure(s) ship as source, not as drawings`;
			}
		} else if (result) {
			// Count mismatch. It used to fall through with no `else`, silently shipping the
			// un-inflated fence — one of the two most likely bake failures, and the one the
			// `catch` below cannot see because nothing threw.
			console.warn(`lattice: diagram bake produced ${result.sections.length} slides for a ${noteRecord.length}-slide deck; exporting without it.`);
			onStatus?.('Diagrams could not be rendered — exporting without them…');
			bakeWarning = 'diagrams ship as source, not as drawings';
		} else {
			// `bakeDeckSections` returns null rather than throwing when the frame yields
			// nothing usable — the other silent path.
			console.warn('lattice: the diagram bake produced nothing usable; exporting without it.');
			onStatus?.('Diagrams could not be rendered — exporting without them…');
			bakeWarning = 'diagrams ship as source, not as drawings';
		}
	} catch (err) {
		// The static render is a SAFE fallback (it is the file we shipped before the bake
		// existed) but it is not a GOOD one — it is the un-inflated fence this whole step
		// exists to replace. A bare swallow here is how a stale generated bundle once made
		// a broken bake look like a working one: the throw fell back to the raw sections,
		// notes and diagrams both looked plausible, and nothing said the bake never ran.
		// Say so, loudly enough to be seen in the export UI, not just the console.
		console.warn('lattice: diagram bake failed; the webpage export ships un-rendered diagram source.', err);
		onStatus?.('Diagrams could not be rendered — exporting without them…');
		bakeWarning = 'diagrams ship as source, not as drawings';
	}
	// A section the structural split already numbered (`2.2`, `2.3`: page k of authored slide 2) keeps
	// its number, as `stampSlideNumbers` (lib/core/structural-split.js) keeps it for the CLI. Prepending
	// a second attribute shadowed it, so the same split page was slide `3` here and `2.2` from the CLI.
	const tagged = (baked ?? recordSections).map((sec, i) =>
		/^<section\b[^>]*\sdata-lattice-slide=/i.test(sec) ? sec : sec.replace(/^<section\b/i, `<section data-lattice-slide="${i + 1}"`),
	);
	// Belt and braces: under `--strip-notes` the render above is already note-free, so this
	// is a second, independent guarantee that no materialized copy carries note text.
	const slides = materializeNotes(tagged, notesCore, noteRecord, stripNotes);
	// FAIL-CLOSED, mirroring the CLI. The scrub matches bodies lifted from the RENDER against
	// comments in the SOURCE, and every leak this has had was a new way for those two sides to
	// disagree. So check the OUTPUT rather than trusting the matcher: a comment still standing
	// that is not a directive, pragma, `describe:` or `say:` is suspected speaker text. It
	// reaches the completion toast, because a strip-notes export that quietly keeps a note is
	// the one failure the author cannot take back once the file has been sent.
	if (stripNotes) {
		const survivors = notesCore.auditStrippedSource(envelopeSource);
		if (survivors.length) {
			console.warn(`lattice: --strip-notes left ${survivors.length} comment(s) that look like speaker text.`, survivors.slice(0, 5));
			// APPEND, never overwrite. These are two INDEPENDENT degradations and both can hold on
			// one deck; assigning here dropped a bake failure that had already been recorded, so
			// the toast reported the audit and the diagrams-as-source problem fell back to the
			// transient status line — the exact failure the bake block three screens up exists to
			// prevent.
			const privacy = `${survivors.length} comment(s) that look like speaker text are still in the embedded source`;
			bakeWarning = bakeWarning ? `${bakeWarning}; ${privacy}` : privacy;
		}
	}
	// The fidelity guard's degradation, folded in the same append-never-assign way.
	if (fidelityWarning) {
		bakeWarning = bakeWarning ? `${bakeWarning}; ${fidelityWarning}` : fidelityWarning;
	}
	if (mediaWarning) {
		bakeWarning = bakeWarning ? `${bakeWarning}; ${mediaWarning}` : mediaWarning;
	}
	// A fence whose plugin is off ships as source: the panel said so before the export, the toast says so after (#2758).
	const offList = offFences(source);
	if (offList) {
		const offWarning = offFencesSentence(offList, 'shipped');
		bakeWarning = bakeWarning ? `${bakeWarning}; ${offWarning}` : offWarning;
	}

	// KaTeX is styled by a stylesheet the offline file must carry inline. The core's
	// `katexCss` cap is SYNCHRONOUS, so pre-fetch the vendored sheet here (only when
	// the deck actually renders math) and hand the core a sync accessor.
	const needsKatex = out.html.indexOf('class="katex') !== -1;
	let katexText: string | null = null;
	if (needsKatex) {
		// ONLY the caller's locally-vendored sheet. There used to be a `|| deck.KATEX_URL`
		// fallback to jsdelivr here, which made an EXPORT reach a third party at export
		// time to bake bytes into a file the author then hands someone. No URL now means
		// no fetch: the core drops the link and reports it, and math ships unstyled —
		// the same degradation the catch below already produced on a network failure.
		const katexUrl = options.katexUrl;
		if (katexUrl) {
			try {
				katexText = await (await fetch(katexUrl)).text();
			} catch {
				katexText = null; // core drops the link + reports it; math ships unstyled
			}
		}
	}
	// SELF-CONTAINED, as the CLI makes it (lib/export/katex-inline.js): each woff2 the sheet names is
	// fetched from beside it and inlined, the faces join the font block and the rules ride in
	// `#lattice-katex`. Linked instead, the sheet's relative font urls could not load in a shared file,
	// the dead faces were stripped, and every Studio math player drew its math in fallback type
	// (decisions/2026-10-16-player-as-library-audit.md §11.9). A font that cannot be fetched keeps its
	// relative url, inert, exactly as the CLI keeps a font it cannot read.
	let katexFaces = '';
	let katexRules = '';
	if (katexText != null && options.katexUrl) {
		const files = coreMod.katexFontFiles(katexText);
		const b64 = new Map<string, string | null>(
			await Promise.all(
				files.map(async (f): Promise<[string, string | null]> => {
					try {
						const res = await fetch(new URL(`fonts/${f}`, new URL(options.katexUrl as string, document.baseURI)).href);
						if (!res.ok) return [f, null];
						const bytes = new Uint8Array(await res.arrayBuffer());
						let bin = '';
						for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
						return [f, btoa(bin)];
					} catch {
						return [f, null];
					}
				}),
			),
		);
		({ faces: katexFaces, rules: katexRules } = coreMod.splitKatexSheet(coreMod.inlineKatexFonts(katexText, (f) => b64.get(f) ?? null)));
	}

	// Narration. Projected from THESE sections rather than from a second render, so
	// `projected[i] ≡ tagged[i]` by construction and a cue can never bind to the wrong slide
	// (the property `projectSectionsToSpeech` exists to give). The panel measured against its
	// own projection of the same deck; if the two ever disagreed the bill would differ from
	// the quote, so the bake re-resolves here and the store makes the difference free.
	let narrationCues: unknown;
	let readAlongVoice: BakeVoice | null = null;
	if (narration && (narration.captions || narration.audio)) {
		onStatus?.('Projecting narration…');
		const [{ projectSectionsToScript }, bake] = await Promise.all([import('./narration-projection'), import('./narration-bake')]);
		let projected: string[] = [];
		// Parallel to `projected` — carried so the BAKED deck holds the same beats Present plays and
		// the CLI export writes. Empty when the projection failed, which stands emphasis down with it.
		let projectedEmphasis: readonly { start: number; end: number; weight: number }[][] = [];
		// And the bindings, so the sent deck's Guide focuses what each sentence was read from.
		let projectedRefs: readonly (readonly unknown[] | undefined)[] = [];
		try {
			const scripts = await projectSectionsToScript(tagged);
			projected = scripts.map((x) => x.text);
			projectedEmphasis = scripts.map((x) => x.emphasis as { start: number; end: number; weight: number }[]);
			projectedRefs = scripts.map((x) => x.refs);
		} catch {
			projected = []; // the chain still resolves captions, notes and chart facts
			projectedEmphasis = [];
			projectedRefs = [];
		}
		// THE SCRUBBED SOURCE, not the raw one. The narration chain's third rung reads the
		// slide's speaker note out of the source comments (`narration-bake.ts` →
		// `getSlideNote`), so passing `source` here shipped every note as visible caption
		// text — and, with audio on, as a synthesized clip the recipient can play aloud —
		// in a file exported with "Strip speaker notes" ON. Same flag, same file, a third
		// channel. `envelopeSource` already has the note bodies removed when stripping, so
		// the chain simply finds nothing to narrate and falls through to its next rung.
		const result = await bake.bakeNarration(envelopeSource, projected, {
			voice: narration.voice,
			audio: narration.audio,
			projectedEmphasis,
			projectedRefs,
			// The author's explicit override, only ever set after a refusal named the sentences.
			allowPartial: narration.allowPartial,
			signal: narration.signal,
			onProgress: (p) => {
				if (p.phase === 'assembling') return onStatus?.('Assembling the player…');
				onStatus?.(p.synthesized ? `Recording narration — ${p.done} of ${p.total} sentences…` : `Reading prepared narration — ${p.done} of ${p.total}…`);
			},
		});
		// The deck's narration as the player's LTT is built from it (lib/core/ltt-deck.mjs): per
		// slide, the text Cadenza timed, its full track, and one clip per cue. Captions OFF ships
		// the same track — the LTT's core requires the words — and no band or crawl to show them.
		narrationCues = {
			captions: narration.captions,
			voice: result.voice ? { model: result.voice.model, voice: result.voice.voice, speed: result.voice.speed } : null,
			inputs: result.inputs,
			slides: result.narrated.map((n, i) =>
				n
					? {
							text: n.text,
							track: n.track,
							clips: (result.slides[i] ?? []).map((c) => (c.audio && c.clip ? { audio: c.audio, clip: c.clip, leadMs: c.leadMs } : null)),
							...(n.emphasis ? { emphasis: n.emphasis } : {}),
							// The chart narrator's binding (narration-bake.ts `refsOf`): the player's Guide plays a
							// bound sentence's scene from it (2026-09-27-delivery-styles-and-component-scenes.md).
							...(n.refs ? { refs: n.refs } : {}),
						}
					: null,
			),
			bookends: bookendsPayload(result.bookends),
		};
		readAlongVoice = result.voice;
	}

	onStatus?.('Assembling the player…');
	const w = out.width || 1280;
	const h = out.height || 720;
	const lang = getFrontMatter(source, 'lang') || 'en';
	const title = deckTitle || getFrontMatter(source, 'title') || 'Lattice deck';
	// The browser engine scopes every deck rule to the live-preview wrapper
	// (`article.lattice > section …`), but the exported player lays its `<section>`s out
	// FLAT under `#lp-stage` — no `.lattice` ancestor — exactly like the CLI's
	// `cleanDocHtml`. So un-scope the deck CSS to the CLI's shape with the CLI's own
	// `unwrapFlatSheet`, so `section.title{…}`, tokens, and every component rule actually
	// match the exported slides. It unwraps rather than strips: `article.lattice > section`
	// becomes `section:where(:not(section *))`, so a `<section>` an author nests inside a
	// slide is not styled as a slide (lib/export/unwrap-flat-sheet.mjs). Without this the file ships the full CSS but
	// NONE of it applies — slides render as raw unstyled Markdown, and the used-selector
	// prune then (correctly) drops every never-matching rule. `@container lattice` and
	// `container-name:lattice` use the container NAME, not `.lattice`, so they're
	// untouched. (extraCss is author `section.<name>` CSS, already unscoped.)
	//
	// The strip alone is not the CLI's shape, and Read · Article is where that showed: the
	// view lifts each chart's figure OUT of its slide, and the preview pack had also scoped
	// every palette token (`:root` → the slide) and every re-host rule (`figure.chart-frame
	// …` → `section figure.chart-frame …`) to the inside of one. Every chart in the article
	// painted SVG's initial black. `flatCss` is the same pack with each re-scoped arm also
	// shipped as written — see `packSelector` in lib/engine/css.js. `?? out.css` keeps an
	// engine bundle that predates the `styles` option exporting what it did before.
	const deckCss = unwrapFlatSheet(out.flatCss ?? out.css);
	const css = deckCss + (extraCss ? `\n/* studio-local-components */\n${extraCss}` : '');
	const fmText = (source.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] ?? '';
	const deckStyle = sanitizeStyleText(coreMod.exportDeckStyleText({ w, h, deckCss: css, globalCss: coreMod.exportGlobalCss(fmText, slides) }));
	const docHtml = buildSelfContainedDoc({
		lang,
		title,
		fontCss,
		deckStyle,
		a11yDefs: coreMod.texturePatternDefs(coreMod.texturePrefixesReferencedIn(`${deckStyle}\n${slides}`)),
		slides,
		// As the CLI writes them: the rules in `#lattice-katex`, the faces after the text faces in the one font block.
		katexLink: katexRules.trim() ? `<style id="lattice-katex">${sanitizeStyleText(katexRules)}</style>` : needsKatex ? '<link rel="stylesheet" href="katex.min.css">' : '',
		katexFacesCss: katexFaces ? sanitizeStyleText(katexFaces) : '',
	});

	// The packer's browser half: the shared prune kernel's page and the CLI's own glyph subsetter
	// (player-prune-browser.ts), loaded before assembly since the subsetter seals the document.
	// The capabilities live in player-caps-browser.ts so the host-parity test drives these exact
	// functions (test/integration/export/player-host-parity.test.js).
	const [packer, { browserPlayerCaps }] = await Promise.all([import('./player-prune-browser').catch(() => null), import('./player-caps-browser')]);
	// The core's inlineAssets cap is SYNCHRONOUS, and the browser's fetch is not, so the pictures
	// were embedded up front (`withMedia`, above) and the cap hands the core that pass's tally. The
	// browser render carries no `file://` refs (a CLI-only concern).
	const caps = browserPlayerCaps({
		sanitize: sanitizeMod.sanitizeSlideHtml,
		media: { count: media.count, missing: media.missing.map((m) => m.url) },
		katexCss: () => katexText,
		subsetFonts: packer?.subsetFontsInBrowser,
	});

	const { html } = await coreMod.assemblePlayer(
		{
			docHtml,
			source: envelopeSource,
			title,
			// The deck's REAL canvas, the same numbers this function already wrote into the
			// exported document's own sizing rule. Without them the player hardcoded 1280x720,
			// so a deck declaring a non-default `size:` exported at ~3x and spilled its frame
			// while the PDF beside it was correct (#1577).
			width: w,
			height: h,
			theme: { name: palette, mode: scheme },
			// The deck's front-matter directives, read by the engine's own parser, as the CLI records them.
			config: coreMod.parseFrontMatter(source).directives,
			// Describes the ARTIFACT — does this file carry notes — not the FLAG that made it.
			// Parity with the CLI export: `!stripNotes` was a one-bit answer to "did the author
			// run the privacy flag?", in plain base64 at the bottom of a file people share. See
			// the same field in lattice.js for the reasoning (#1833).
			notes: !stripNotes && noteRecord.some((r) => !!r.note),
			// Motion in a forwarded file: a separate choice from motion while presenting,
			// because it costs bytes and it moves for a recipient the author is not there to
			// frame it for. Suppression only — a deck that says `motion: off` cannot be made
			// to move from here.
			playerMotion,
			// The auto-glossary term→definition projection, gated on the `glossary: auto` opt-in —
			// parity with the CLI export's manifest field (#920); omitted otherwise.
			glossary: resolveGlossaryMode(source) === 'auto' ? glossaryEntries(source) : [],
			// The baked delivery, per slide. The timing track and the AUDIO ride in their own inert
			// blocks rather than in the manifest envelope (see player-core's `narrationPayload` for
			// why); the manifest records the voice and points at the timing track.
			narration: narrationCues,
			// The Guide rides with the narration unless the author switched it off (player-core).
			guide: narration?.guide !== false,
			readAlong: readAlongVoice ? { voice: readAlongVoice } : undefined,
			// Pinned, as the CLI pins it (SOURCE_DATE_EPOCH, else the epoch): two exports of an unchanged
			// deck are byte-identical, and the same deck at the same epoch packs the same from either
			// host (decisions/2026-10-16-player-as-library-audit.md §11). Nothing reads the stamp.
			now: 0,
			...(consentOrigins.length ? { consentOrigins } : {}),
			// The same provenance a CLI export stamps: the engine's version and the player's (the core
			// defaults `playerVersion` to the one PLAYER_VERSION). Which tool made the file is the
			// `host` field, the one piece of metadata host parity ignores (§11.9).
			build: coreMod.ENGINE_BUILD,
			host: 'studio',
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
		const pr = packer ? await packer.prunePlayerInBrowser(html) : null;
		if (pr?.applied) finalHtml = pr.html;
	} catch {
		/* prune skipped — ship the full player */
	}

	onStatus?.('Downloading…');
	const { downloadText } = await import('./download');
	downloadText(`${name}.html`, finalHtml, 'text/html');
	// A DEGRADED export is still an export, but the author must not be told it is fine.
	// `onStatus` is transient — it is replaced by the next line and gone by the time the
	// file lands — so a bake failure announced only there is invisible in practice, and
	// the completion toast then says "Webpage ready." over a file whose diagrams shipped
	// as raw source. Returning the reason lets the caller put it IN the toast, which is
	// the part that persists.
	return bakeWarning;
}

/**
 * Render the theme's showcase deck → PDF bytes (a Blob), for the Library's
 * theme-share zip. Reuses the same render + PDF path as Share→PDF, so the zip
 * SHOWS the theme on a representative deck rather than just shipping tokens.
 */
export async function renderThemeShowcase(options: SingleSlideOptions, theme: { name: string; label?: string; css: string }): Promise<Blob> {
	const { showcaseDeck } = await import('./asset-bundle');
	const render = await withExportMarker(await buildDeckRender(options, showcaseDeck(theme.label || theme.name), theme.name, 'light', { name: theme.name, css: theme.css }));
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
	// Both edits are LINE SPLICES (`writeFrontMatterLine`, via `mergeClassTokens`): this is an
	// OUTBOUND path, so a whole-block rebuild here shipped the recipient a corrupted `.md` —
	// the sender's YAML comments, `_class:`, `style: |` body and flow sequences deleted from a
	// copy they never see, with no Undo on the far side (#1256).
	const classed = finishClass ? writeFrontMatterLine(mergeClassTokens(source, finishClass), 'finish', null) : source;
	// #22 stylesheet channel — a SAVED FINISH is user- or model-authored CSS, and this
	// splices it into a `<style>` in the markdown handed to a RECIPIENT. A `</style>` in it
	// would end the element on their machine.
	const block = `<style>\n/* Lattice Studio — embedded finish (self-contained: this deck keeps its surface\n   finish even where the saved finish is not installed). Generated on export. */\n${sanitizeStyleText(finishCss.trim())}\n</style>\n`;
	const fm = /^(---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$))/.exec(classed);
	if (fm) return classed.slice(0, fm[0].length) + '\n' + block + '\n' + classed.slice(fm[0].length);
	return block + '\n' + classed;
}

/** Markdown source with the current theme + referenced components + (when active) the saved finish embedded. */
export async function shareMarkdown(options: SingleSlideOptions, source: string, name: string, palette: string, extra?: ExtraTheme, finishClass?: string, finishCss?: string, components: ReadonlyArray<LocalComponentCss> = [], deckId?: string): Promise<string | undefined> {
	const ex = await exporters();
	// The photos the deck names ride beside the .md in a .zip (a Markdown file cannot hold a picture).
	const { named, photos } = await photosBesideDeck(source, deckId);
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
	// …and the saved components the deck uses. This passed `[]` until 2026-09, so a
	// saved component's slides arrived unstyled on the recipient's machine while the
	// theme and finish beside them survived (2026-09-23-portable-packages.md §1).
	await ex.exportMarkdown(embedFinishInMarkdown(photos?.source ?? source, finishClass, finishCss), name, theme, [...components], photos?.files);
	return latticePhotoNote(named, true, photos);
}

/** The photos a Markdown or Marp export carries, or none when the deck names none (no Library read at all). */
async function photosBesideDeck(source: string, deckId: string | undefined) {
	const named = (await import('./media-urls')).assetNamesIn(source);
	const photos = named.length ? await (await import('./lattice-media')).bundlePhotos(source, deckId) : undefined;
	return { named, photos };
}

/** The `.lattice` project file — the deck source, its review comments and the Library photos it
 *  names, in one zip, so all three travel with the deck (re-import restores them). `now` is stamped by
 *  the caller (app code) into the manifest; the download name gets a `.lattice` ext.
 *
 *  `includePhotos` (on by default) packs the photos the deck names as they sit in the Library. Resolves
 *  to a reason for the toast when the file shipped without a picture the deck uses: the author turned
 *  photos off, the file would have passed the size cap, or a named photo is not in the Library. The
 *  note is written HERE because only this function knows which of the three happened. */
export async function shareLattice(source: string, name: string, deckTitle: string, deckId: string | undefined, now: number, packages?: DeckPackages, includePhotos = true): Promise<string | undefined> {
	const { listComments } = await import('./slide-comments');
	const { assetNamesIn } = await import('./media-urls');
	const named = assetNamesIn(source);
	const photos = includePhotos && named.length ? await (await import('./lattice-media')).packLatticePhotos(source, deckId) : undefined;
	const blob = await latticeBlob(source, deckTitle, deckId ? listComments(deckId) : [], now, packages, photos?.media);
	const { downloadBlob } = await import('./download');
	downloadBlob(`${name}.lattice`, blob);
	return latticePhotoNote(named, includePhotos, photos);
}

const quoted = (list: string[]) => `${list.slice(0, 3).map((n) => `“${n}”`).join(', ')}${list.length > 3 ? `, and ${list.length - 3} more` : ''}`;

/** The toast's sentence about photos a `.lattice` left out, or undefined when it carries every one the deck names. */
function latticePhotoNote(named: string[], includePhotos: boolean, photos?: { omitted: string[]; missing: string[]; included: string[] }): string | undefined {
	if (!named.length) return undefined;
	const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
	if (!includePhotos) return `${plural(named.length, 'the photo', 'the photos')} it names (${quoted(named)}) ${plural(named.length, 'is', 'are')} not inside this file, so anyone who opens it elsewhere sees ${plural(named.length, 'a stand-in', 'stand-ins')}`;
	const parts: string[] = [];
	const missing = photos?.missing ?? named;
	if (missing.length) parts.push(`${plural(missing.length, 'the photo', 'the photos')} ${quoted(missing)} could not be added (not in this browser's Library, or could not be read), so ${plural(missing.length, 'it shows', 'they show')} as a stand-in`);
	const omitted = photos?.omitted ?? [];
	if (omitted.length) parts.push(`${plural(omitted.length, 'the photo', 'the photos')} ${quoted(omitted)} would have made the file larger than ${Math.round(MAX_LATTICE_MEDIA_BYTES / 1_048_576)} MB, so ${plural(omitted.length, 'it is', 'they are')} not inside it`);
	return parts.join('; ') || undefined;
}

/** ONE builder for the `.lattice` zip — the project download and the copy a re-openable
 *  PDF / PowerPoint carries — so the two can never disagree about what a deck is. */
async function latticeBlob(source: string, deckTitle: string, comments: SlideComment[], now: number, packages?: DeckPackages, media?: LatticeMedia): Promise<Blob> {
	const [{ exportLatticeBlob }, pz] = await Promise.all([import('./lattice-file'), import('./package-zip')]);
	// The user packages the deck uses ride inside the project file, as package folders, so
	// it opens on a machine that has never seen this Library (portable-packages §4).
	const pkgs = packages ? [...packages.themes.map(pz.themePackage), ...packages.components.map(pz.componentPackage), ...packages.finishes.map(pz.finishPackage)] : [];
	return exportLatticeBlob(source, deckTitle, comments, now, pkgs, media);
}

/**
 * The `.lattice` a re-openable PDF / PowerPoint carries (embedded-source.ts). Built from the
 * author's SOURCE — not the export's artifact source, which has a finish and components baked
 * in — so the recipient edits what the author wrote. COMMENTS ARE NEVER IN IT: an empty list
 * is passed whatever the deck holds (2026-10-05-reopenable-exports.md).
 */
export async function embeddableLattice(source: string, deckTitle: string, now: number, packages?: DeckPackages, deckId?: string): Promise<{ bytes: Uint8Array; note?: string }> {
	// The photos the deck names ride inside, up to MAX_EMBEDDED_MEDIA_BYTES (smaller than a standalone
	// `.lattice` so the PDF or PowerPoint stays under the carrier cap the importer enforces). A deck that
	// names none skips the Library read entirely.
	const named = (await import('./media-urls')).assetNamesIn(source);
	const photos = named.length ? await (await import('./lattice-media')).packLatticePhotos(source, deckId, MAX_EMBEDDED_MEDIA_BYTES) : undefined;
	const bytes = new Uint8Array(await (await latticeBlob(source, deckTitle, [], now, packages, photos?.media)).arrayBuffer());
	// Two reasons, worded apart: a photo over the cap is in the Library and only the copy lacks it; a missing one
	// is a stand-in on the pages too (and this note stands in for the Share sheet's own stand-in note).
	const over = photos?.omitted ?? [];
	const gone = photos ? photos.missing : named;
	const parts: string[] = [];
	if (gone.length) parts.push(`${gone.length === 1 ? 'the photo' : 'the photos'} ${quoted(gone)} could not be added (not in this browser's Library, or could not be read), so ${gone.length === 1 ? 'it shows' : 'they show'} as ${gone.length === 1 ? 'a stand-in' : 'stand-ins'} in the file and in the re-openable copy`);
	if (over.length) parts.push(`${over.length === 1 ? 'the photo' : 'the photos'} ${quoted(over)} would pass the ${Math.round(MAX_EMBEDDED_MEDIA_BYTES / 1_048_576)} MB of photos a re-openable copy holds, so ${over.length === 1 ? 'it is' : 'they are'} not inside it and whoever opens it in Lattice sees ${over.length === 1 ? 'a stand-in' : 'stand-ins'}`);
	const note = parts.join('; ') || undefined;
	return { bytes, note };
}

/** The Share toast's note on an Export-to-Marp bundle, or undefined: the deck's own script the export
 *  left out (§ 11), what the bundle's HTML list will show as text or drop in marp-cli (§ 13,
 *  lib/core/marp-bundle-html.js), a <title> left open, which swallows the slides after it, and any
 *  equation the export could not typeset (lib/core/marp-bundle-math.js). */
export function marpExportNote(removed?: {
	scripts: number; handlers: number; urls: number; escaped?: boolean;
	refused?: { tags?: Record<string, number>; attrs?: Record<string, number>; unclosed?: string[] };
	math?: { failed?: number };
}): string | undefined {
	if (removed?.escaped) return "the deck's HTML could not be separated from its script, so the bundle shows all of it as text";
	const n = removed ? removed.scripts + removed.handlers + removed.urls : 0;
	const script = n ? `it left out the deck's own script (${n} ${n === 1 ? 'piece' : 'pieces'}), which Marp would run on the recipient's machine` : '';
	// What the bundle's HTML list will show as text or drop in marp-cli (lib/core/marp-bundle-html.js).
	const tags = Object.keys(removed?.refused?.tags ?? {});
	const attrs = Object.keys(removed?.refused?.attrs ?? {});
	const refused = tags.length || attrs.length
		? `marp-cli will ${tags.length ? `show ${tags.map((t) => `<${t}>`).join(', ')} as text` : ''}${tags.length && attrs.length ? ' and ' : ''}${attrs.length ? `drop ${attrs.join(', ')}` : ''}`
		: '';
	// A <title> left open swallows the slides after it as text in any browser; only the author can close it.
	const unclosed = removed?.refused?.unclosed?.includes('title') ? 'the deck leaves a <title> open, so the slides after it show as text' : '';
	// Equations the export could not typeset ship as TeX text (lib/core/marp-bundle-math.js, fail closed).
	const failed = removed?.math?.failed ?? 0;
	const math = failed ? `${failed} ${failed === 1 ? 'equation' : 'equations'} could not be typeset and ${failed === 1 ? 'shows' : 'show'} as TeX` : '';
	return [script, refused, unclosed, math].filter(Boolean).join('; ') || undefined;
}

/** The self-contained Marp ZIP bundle (renders anywhere). Resolves to a reason for the toast
 *  when the bundle dropped the deck's own executable HTML, which marp-cli would otherwise run on
 *  the recipient's machine (theme-css-is-a-preview-sink.md § 11). */
export async function shareMarp(options: SingleSlideOptions, source: string, name: string, palette: string, finishClass?: string, finishCss?: string, overflowMarker?: OverflowMarker, extra?: ExtraTheme, components: ReadonlyArray<LocalComponentCss> = [], deckId?: string): Promise<string | undefined> {
	await ensureReady(options); // PG.marp must be present
	const { named, photos } = await photosBesideDeck(source, deckId);
	const ex = await exporters();
	// Same finish-embed as the Markdown handoff so the ZIP renders the custom finish.
	// `overflowMarker` — who a clipped slide's marker speaks to in the exported deck.
	// The Share sheet's Marp options step passes this export's pick; the Workspace
	// setting is the standing answer it defaults from (and the fallback for any caller
	// that doesn't ask). Without it the bundle fell back to the runtime's AUTHORING
	// default and a recipient got the red QA ring and "FIX ME" overlays on any
	// clipped slide.
	const { loadSettings } = await import('./studio-store');
	// A saved theme has no file on the site, so it rides in as `extraTheme` and the
	// bundle writes its CSS itself; a saved component rides as an embedded `<style>`,
	// the same block the Markdown export uses. Without both, the bundle fell back to
	// `indaco` and dropped the component's styling without a word.
	// The plugins this deck's admission leaves off under the playground bundle's host (none on the
	// shipped default set), so the bundle's runtime draws no more than the Studio's preview does.
	const { deckPluginsOff } = await import('@/lib/plugin-admission');
	// The bundle carries its math TYPESET (lib/core/marp-bundle-math.js): Marp's own typesetter is the
	// injection surface it closes. Typesetting needs the real KaTeX, which the Studio loads on demand,
	// so load it first. If it will not load, the export still goes out: each equation ships as TeX
	// text (fail closed), and the toast below counts them.
	if (sourceHasMath(source)) {
		const katexUrl = deriveKatexProviderUrl();
		if (katexUrl) await ensureKatexProvider(katexUrl).catch(() => {});
	}
	const removed = await ex.exportMarp(embedFinishInMarkdown(photos?.source ?? source, finishClass, finishCss), name, palette, options.themeBase, { includeAgent: true, files: photos?.files, overflowMarker: overflowMarker ?? loadSettings().overflowMarker, extraTheme: extra, components: [...components], pluginsOff: deckPluginsOff(source) });
	return [marpExportNote(removed), latticePhotoNote(named, true, photos)].filter(Boolean).join('; ') || undefined;
}

/** One-click image PDF (2× raster, one slide per page). The page-image format
 *  (PNG lossless / JPEG fast) is the Workspace › General preference. `annotations`
 *  (opt-in via the export panel) is the per-page comment sticky-note payload —
 *  index-aligned to the deck's slides; absent → a clean, comment-free PDF. */
export async function sharePdf(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string, annotations?: { title: string; contents: string }[][], embedSource?: Uint8Array): Promise<string | undefined> {
	const render = await withExportMarker(await buildDeckRender(options, source, palette, mode, extra, extraCss));
	const ex = await exporters();
	const { loadSettings } = await import('./studio-store');
	// Resolves to a DEGRADATION reason when the export shipped something lesser — today,
	// an image it could not load. The caller folds it into the toast; see ShareSheet.
	// `embedSource` — the `.lattice` to carry when the author chose "Re-openable in Lattice".
	return ex.exportPdf(render, name, onStatus, { deck: name, engine: 'lattice' }, { pageFormat: loadSettings().pdfPages, writer: loadSettings().pdfWriter, annotations, embedSource });
}

/** PowerPoint (image-slides, full-bleed). Each image's alt text is the slide's
 *  accessibility description (WCAG SC 1.1.1) — image-per-slide PPTX otherwise gives
 *  a screen reader nothing. `exportPptx` reads the description from the SAME rendered
 *  section it rasterizes, so the alt stays index-locked to its slide even on
 *  front-matter or auto-split (`split: headings`) decks — no source re-split here. */
export async function sharePptx(options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string, embedSource?: Uint8Array): Promise<string | undefined> {
	const render = await withExportMarker(await buildDeckRender(options, source, palette, mode, extra, extraCss));
	const ex = await exporters();
	return ex.exportPptx(render, name, onStatus, { deck: name, engine: 'lattice' }, { embedSource });
}

/** LibreOffice (.odp) or an EDITABLE PowerPoint, through Calco (`exportOffice`): one
 *  picture per slide, or with `editable` every paragraph as a real text box over a picture
 *  of the slide with its text removed. Notes and alt text ride as in the CLI. */
export async function shareOffice(format: 'odp' | 'pptx', options: SingleSlideOptions, source: string, name: string, palette: string, mode: 'light' | 'dark', extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string, editable = false, embedSource?: Uint8Array): Promise<string | undefined> {
	const render = await withExportMarker(await buildDeckRender(options, source, palette, mode, extra, extraCss));
	const ex = await exporters();
	return ex.exportOffice(format, render, name, onStatus, { deck: name, engine: 'lattice' }, { editable, embedSource });
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
 *  light/dark render the matching palette variant, print stamps the B&W `color-mode: print`
 *  canvas (rendered light), and inherit keeps the preview mode — mirroring the CLI's
 *  `--image-mode`. The chosen mode also rides in `imageOpts` so the manifest records it. */
export async function shareImageSet(options: SingleSlideOptions, source: string, name: string, palette: string, previewMode: 'light' | 'dark', imageOpts: ImageSetOptions, extra?: ExtraTheme, onStatus?: (m: string) => void, extraCss?: string): Promise<string | undefined> {
	const chosen = imageOpts.mode ?? 'inherit';
	let renderMode: 'light' | 'dark' = previewMode;
	let src = source;
	if (chosen === 'light') renderMode = 'light';
	else if (chosen === 'dark') renderMode = 'dark';
	else if (chosen === 'print') { renderMode = 'light'; src = withPrintCanvas(source); }
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
	const render = await withExportMarker(await buildDeckRender(options, src, palette, renderMode, extra, extraCss));

	// The chart/diagram SVG "look" (transparent/light/dark/print) renders the extracted vectors
	// independent of the slides. When it differs from the slides' own scheme, do a SECOND full
	// engine render in that look — so the print texture defs, dark palette, and Mermaid re-bake
	// are all correct (an in-page toggle can't reliably do that). The exporter extracts the SVGs
	// from this render instead of the slide render. print → the B&W `color-mode: print`; light/dark →
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
			svgRender = await buildDeckRender(options, withPrintCanvas(source), palette, 'light', extra, extraCss);
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
	return ex.exportImageSet(render, name, effectiveOpts, onStatus, svgRender, meta);
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
			/** Per-slide emphasis spans, parallel to `texts` — see lib/core/read-along-build.js. */
			emphasis?: readonly (readonly { start: number; end: number; weight: number }[] | undefined)[];
			/** The neutral greeting and the closing, as spoken text (lib/core/resolve-bookends.mjs). */
			bookends?: { greeting?: string | null; closing?: string | null };
		},
	) => { slides: { index: number }[] };
	/** The ONE identity rule shared by all four narration producers — see read-along-build.js. */
	emphasisForResolved: (
		slideTexts: readonly string[],
		projectedBefore: readonly string[],
		spans: readonly (readonly { start: number; end: number; weight: number }[] | undefined)[],
	) => (readonly { start: number; end: number; weight: number }[] | undefined)[];
	// The SAME merge the CLI export uses (HARD RULE #1): say line → front-matter say: map →
	// projection, with the alignment guard that drops the projection wholesale on a
	// section/slide count mismatch. Re-exported from the read-along-core bundle.
	// The first argument is a slide COUNT, not the notes it used to be — a speaker note is
	// not a narration source (narration-resolve.ts).
	mergeNarration: (
		slideCount: number,
		projected: readonly string[],
		opts?: { sayLines?: readonly (string | null | undefined)[]; fmSayMap?: ReadonlyMap<number, string> | null },
	) => string[];
	readAlongToVtt: (ra: unknown) => string;
	readAlongToVttParts: (ra: unknown) => { index: number; vtt: string }[];
};

/**
 * Read-along WebVTT captions — the SAME producer the CLI `--captions` flag uses
 * (lib/core/read-along-build.js + read-along-vtt.js), bundled for the browser
 * (tools/build-read-along-core.js → read-along-core.generated.js — same packaging
 * idiom as the Webpage player's player-core.generated.js). Resolves each slide's
 * narration through the SAME chain the CLI uses (say line → front-matter say: map →
 * component-aware DOM projection), builds a Cadenza ESTIMATE track per
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
	const theme = await ensureTheme(options, palette, mode, extra, source);
	const out = await renderMarkdown(PG, source, theme, { samplesUrl: samplesBaseFor(options.themeBase), ...(await assetOpts(source)) });

	onStatus?.('Reading notes + projecting slides…');
	const [authoringMod, readAlongCore, projectionMod, resolveNarrationMod, narrationResolve, lintMod, bookendsMod] = await Promise.all([
		import('@/playground/authoring-door.js').then((door) => door.loadAuthoring()),
		import('@/playground/read-along-core.generated.js') as unknown as Promise<ReadAlongCore>,
		import('./narration-projection'),
		import('@/lib/resolve-narration'),
		import('./narration-resolve'),
		import('./lint'),
		import('@/lib/resolve-bookends'),
	]);
	const { splitSlides } = lintMod;
	const notesCore = (authoringMod as unknown as { notesCore: NotesCore }).notesCore;
	// DEPTH-AWARE, for the same reason the webpage export is: the flat splitter pairs each
	// `<section>` with the NEXT `</section>`, so a slide containing a hand-authored
	// `<section>` is truncated at the nested close tag and its `<!-- say: -->` / note
	// falls outside the chunk — while the slide COUNT stays right, so parity cannot catch it.
	// That slide then narrates the DOM projection instead of the author's say line, silently.
	const splitSectionsCore = (authoringMod as unknown as { splitSectionsCore: SplitSectionsCore }).splitSectionsCore;
	// The auto-glossary's section is dropped (`withoutAutoGlossary`, the kernel Present, the bake and
	// the CLI share): nobody narrates it, and leaving it in made the list one long, so the chart
	// substitution below stood down and the glossary's definitions were captioned here alone.
	const sections = withoutAutoGlossary(
		splitSectionsCore(out.html)
			.filter((p) => p.type === 'section')
			.map((p) => `${p.openTag}${p.inner}</section>`),
		splitSlides(stripFrontMatter(source)).length,
		source,
	);

	// The FULL narration chain, matching the CLI export's writeCaptionsSidecar
	// (HARD RULE #1): a slide's inline `<!-- say: -->` → its front-matter `say:`
	// entry → the component-aware DOM projection, and the emphasis spans that ride with it. A speaker note is not a rung. So a deck
	// exported from the docs site now produces the SAME projected captions the CLI does —
	// closing the gap where the client `.vtt` was silently empty (the CLI already projected).
	const notes = notesCore.extractSlideNotes(sections);
	const sayLines = notesCore.extractSlideSayLines(sections);
	// Front-matter `say:` is keyed by 1-based AUTHORED slide number. The docs render
	// (`renderMarkdown`) never runs the emulator's Fit-Spine autosplit, so `sections` is 1:1
	// with the authored slides and `fmSayMap.get(i+1)` binds correctly — we deliberately do
	// NOT port the CLI's `AUTOSPLIT_APPLIES` guard (which nulls the map): here it would be a
	// dead no-op at best. A deck whose slides SPLIT exports a `.vtt` that differs from the
	// CLI's by design (the CLI paginates; splitting is intrinsic since 2026-07-29).
	const fmSayMap = resolveNarrationMod.frontMatterSayMap(source);
	const acronyms = resolveNarrationMod.acronymSpokenMap(source);
	const lexicon = resolveNarrationMod.lexiconMap(source); // author lexicon beats the built-in commons
	const lang = resolveNarrationMod.frontMatterLang(source); // non-English → bypass English say-as (#919)
	// Project the ALREADY-rendered sections (no second full render — projected[i] ≡ sections[i]
	// by construction). Failure leaves the projection empty, exactly as the CLI's does
	// (lattice.js projectDeckSpeechFromHtml) — there is no notes fallback behind it,
	// so a deck whose projection fails exports only its authored say overrides.
	let projected: string[] = [];
	// Parallel to `projected`, and the guard below compares against THIS array rather than the
	// post-substitution one: `applyChartNarration` returns a copy, so `projected` is rebound below
	// and the pre-substitution text is what the spans were measured against.
	let projectedEmphasis: readonly (readonly { start: number; end: number; weight: number }[] | undefined)[] = [];
	try {
		const scripts = await projectionMod.projectSectionsToScript(sections);
		projected = scripts.map((x) => x.text);
		projectedEmphasis = scripts.map((x) => x.emphasis);
	} catch {
		projected = []; // projection unavailable → say text still narrates
		projectedEmphasis = [];
	}
	const projectedForEmphasis = projected.slice();
	// Chart-narration parity. A recognized chart slide narrates COMPUTED facts — a funnel's
	// conversion rate, the auto-fit scale an unlabeled axis is plotted against — that exist
	// only in the render, never in the figure projection's heading-only caption. The CLI
	// export has substituted them at projection precedence since #902 Gap 1; this browser
	// export never did, so the same deck's captions disagreed with what Present spoke. Same
	// substitution, shared rather than copied (narration-resolve.ts).
	projected = narrationResolve.applyChartNarration(splitSlides(stripFrontMatter(source)), projected);
	const slideTexts = readAlongCore.mergeNarration(notes.length, projected, { sayLines, fmSayMap });
	// Emphasis only where the resolved text is still the text the spans were measured against —
	// the ONE shared rule, so all four producers spend the same beats. This sibling was missed on
	// the first pass: `shareHtmlPlayer` was wired and this was not, so the Studio's
	// "Captions (.vtt)" download carried no holds while the CLI's carried seven on the same deck.
	const emphasis = readAlongCore.emphasisForResolved(slideTexts, projectedForEmphasis, projectedEmphasis);

	onStatus?.('Building captions…');
	const readAlong = readAlongCore.buildReadAlong(slideTexts, {
		emphasis,
		// Voice is metadata only — captions time off `pace`, not the voice (regenerate
		// mode has no audio). Mirrors the CLI's default; the deck acronym registry expands.
		voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
		pace: 'moderate',
		acronyms,
		lexicon,
		lang: lang ?? undefined,
		// The NEUTRAL greeting and the closing: a caption file has no viewer clock. The same key
		// reading and the same text as the CLI's sidecar (lib/core/resolve-bookends.mjs).
		bookends: captionBookends(bookendsMod.withoutRedundantBookends(bookendsMod.resolveBookends(source), slideTexts), bookendsMod.greetingText),
	});
	if (!readAlong.slides.length) throw new Error('nothing to narrate — the deck has no captions and no projectable slide content (a speaker note is never narrated)');

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
