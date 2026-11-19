// deck-preview.js — THE single multi-slide "filmstrip" preview controller.
//
// WHY THIS EXISTS
// Four surfaces independently re-implemented the same "render markdown → write an
// iframe → scale every <section> to the container width" routine, then drifted:
// the Drawing Board grew a visibility gate (anti first-paint flash), incremental
// section patching (anti per-keystroke reload flicker) and content-visibility
// virtualization; the playground and BOTH Workbench studios never did — so they
// flash, flicker, and leave a dead trailing-scroll gap, and the studios weren't
// even size-aware (a `size: 4K` deck rendered 3× oversized). Same bug surface,
// fixed in one place and forgotten in three. This module is that one place.
//
// THE MODEL (ported from the proven Drawing Board controller)
//   - ONE persistent iframe per host. `renderDeck()` decides per render:
//       • sig unchanged + a live document  → PATCH only the <section> nodes whose
//         HTML changed (the runtime's body observer re-runs its transforms on the
//         replaced nodes for free; FIT/SYNC re-apply via their window hooks).
//       • otherwise (first render, theme/mode/size/deck change) → full `srcdoc`
//         rewrite (theme CSS + Mermaid theming bake into the document).
//   - The FIT agent (runs INSIDE the iframe) scales each fixed-`@size` section by
//     the constant w/SW behind a `.lattice{visibility:hidden}` gate it flips to
//     visible only once scaled — so the first paint never flashes the slides at
//     full 1280px width. It also CLAMPS the filmstrip to the scaled-content height
//     and clips the tail the last un-scaled box leaves (transform scales the
//     paint, not the layout box), killing the dead trailing scroll space.
//   - The split kernel (`splitSections`) is the unit-tested pure core in
//     preview-virtual.js, re-exported here so every host shares one implementation
//     instead of inlining a mirror.
//
// Per-surface knobs (see buildSrcdoc opts): padding/gap, forced color-scheme
// (studios + library themes), content-visibility + cursor + active outline + the
// print page + the cursor↔slide SYNC agent (Drawing Board), and the vendored
// @font-face CSS (Drawing Board). Everything host-specific — which deck to render,
// theme resolution, the component bridge, the editor wiring — stays in the host
// controller; this module owns only HOW a rendered deck becomes a live preview.
//
// GRACEFUL DEGRADATION: the height clamp uses `overflow:clip` + `overflow-clip-
// margin` and `center` uses `justify-content: safe center` — all 2022+ CSS. On
// older engines (e.g. Safari <15.4) they're simply ignored: the dead trailing
// scroll gap returns and a very tall centered deck could top-clip. Both degrade
// to the pre-consolidation behavior, never to a broken preview. `overflow:clip`
// is non-scrolling, so it does NOT turn `.lattice` into a scroll container — the
// SYNC scroll math (window.scrollY) and content-visibility virtualization both
// keep measuring against the document viewport.

import { agentTag, frameAgentsUrl } from '../../../lib/core/frame-agents.mjs';
import {
	buildPrintCss,
	fitSlideOnSheet,
	handoutRegions,
	nUpCells,
	nUpGrid,
	PRINT_SAFE_PX,
	PRINT_SHEETS,
	resolvePrintSheet,
} from '../../../lib/core/print-sheet.mjs';
import remoteRef from '../../../lib/core/remote-ref.js';
import { sanitizeStyleText } from '../../../lib/core/sanitize-style-text.mjs';
import { slideFrameFilter } from '../../../lib/core/slide-frame.mjs';
import { drawnLibraryPreload } from '../../../lib/plugins/drawn-library.mjs';
import { markupHasDrawnFence } from '../../../lib/plugins/drawn-probe.mjs';
import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { texturePatternDefs } from './a11y-textures.generated.js';
import { slideBox } from './frame-css.js';
import { previewCspMeta } from './preview-csp.js';
import { splitSections } from './preview-virtual.js';

// Re-exported so callers that already reach for it here keep working; the policy itself
// lives in its own dependency-free module (see preview-csp.js for why).
export { previewCspMeta, splitSections };

// NO KATEX_URL / MERMAID_URL CONSTANTS HERE — deliberately, and do not add them back.
//
// These used to hold jsdelivr URLs, as a "back-compat" default behind every caller's
// optional `katexUrl` / Mermaid URL. That default was the whole problem: a host that
// forgot to pass a URL silently executed third-party JavaScript. It was `mermaid@11` —
// a FLOATING major, so jsdelivr served whatever 11.x was current — with no `integrity`
// attribute, inside the preview frame, on the surface that holds the user's OpenRouter
// key (HARD RULE #22's threat model exactly). The landing page was live on that path:
// index.astro gates its `diagram` field card on ```mermaid (via CARD_COMPONENTS) and passed no URL.
//
// Every host now passes the locally-vendored copy staged by sync-playground-assets
// (`<assetBase>katex/katex.min.css`). The injection sites treat a falsy URL as "omit the
// tag", so a forgetful caller renders unstyled math instead of reaching a CDN — a visible
// local failure rather than an invisible remote dependency. Mermaid is no longer threaded at
// all: it is the Mermaid plugin's declared payload, which the runtime's plugin host loads
// from beside `lattice-runtime.js` (lib/plugins/host-browser.mjs `ensureLibrary`) — a local
// file, by construction.
//
// Pinned by test/unit/docs/no-cdn-runtime.test.js, which fails on any CDN URL under
// docs/src. See engineering/decisions/2026-09-03-self-hosted-runtime-deps.md.


// The categorical/chart texture <defs> (the a11y redundant-encoding mechanism),
// built ONCE from the shared kernel (HARD RULE #1). buildSrcdoc injects this on
// EVERY render so every surface that uses this controller — Drawing Board,
// Playground, both Workbench studios — shows a11y textures identically, instead
// of each caller opting in (the Drawing Board did; the others didn't → wireframe
// pies). Inert under color themes: nothing references the patterns there.
export const A11Y_DEFS = texturePatternDefs();

/**
 * What the frame document holds that the engine's slide HTML does not, for the on-demand style
 * loader's scan (docs/src/lib/style-loader.ts): the `<html>` the builder writes, the texture
 * <defs> it puts before the slides, and the classes and attributes this file's own agents add after
 * load (the click agent's `data-idx`, `db-active`). A rule in lattice.css keyed on any of them must
 * keep loading, so a change to `buildSrcdoc`'s shell or to an agent's DOM writes is a change here.
 * `deck-preview.scan-shell.test.ts` pins the `<html>` attributes against `buildSrcdoc`.
 */
export const SCAN_SHELL = {
	open: '<!doctype html><html lang="en" data-lattice-preview="" data-lattice-diagrams=""><body>',
	prefix: A11Y_DEFS,
	// `role` and `data-mark` are written into the frame by the host's overlays (collage-host.js makes a
	// lightbox image a button; chart-interact.js marks the chart marks it makes interactive), and both
	// names appear in lattice.css selectors. Found by listing what host code writes into the frame and
	// intersecting it with the names the modules key on; extend the list when an overlay learns a new one.
	runtime: { c: ['db-active'], a: ['data-idx', 'role', 'data-mark'] },
};

const DARK_BG = '#0c0c0c';
const LIGHT_BG = '#e7e7ea';

// Cheap, stable string hash (djb2) for render signatures. The Workbench studios
// edit the theme/component CSS live, and that CSS bakes into the document <style>
// (outside the <section>s), so a token/CSS edit must fingerprint into the sig to
// force a full rewrite rather than a section-only patch that leaves a stale style.
export function hashString(s) {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return h >>> 0;
}

// Print-sheet geometry (paper decision, safe margin, fit-on-sheet, N-up grid, notes-
// handout bands, and the vector `@page` print CSS) lives in the pure, dependency-free
// kernel `lib/core/print-sheet.mjs` (imported at the top) so the Node CLI (`--paper`
// export) and this browser module share ONE source of truth (HARD RULE #1). Re-exported
// here so every existing importer (the Print drawer, drawing-board-export.js, the tests)
// keeps its import path unchanged.
export { buildPrintCss, fitSlideOnSheet, handoutRegions, nUpCells, nUpGrid, PRINT_SAFE_PX, PRINT_SHEETS, resolvePrintSheet };

/**
 * The text of the frame document's ONE layout `<style>` (`#lattice-doc`): the letterbox, the
 * slide box, the section rule and the engine sheet. Split out of `buildSrcdoc` so the
 * Playground's RESTYLE path (`renderDeck`) can swap it on a live document — a palette or
 * light/dark flip then changes this text and the sections, and nothing else: no new
 * document, no new realm, no hidden reveal, and the reader keeps their scroll position.
 * The same function builds both, so a restyled document cannot drift from a written one.
 */
export function docStyleText({ css, mode, geom, padding = 18, background = null, colorScheme = null, contentVisibility = false, cursor = false, activeOutline = null, printRules = false, printOpts = undefined, center = false, scrollbar = false, activeBar = null }) {
	const gw = (geom?.w) || 1280;
	const gh = (geom?.h) || 720;
	const bg = background ? background(mode) : (mode === 'dark' ? DARK_BG : LIGHT_BG);
	const scheme = colorScheme ? ':root{color-scheme:' + colorScheme + ';}' : '';
	// A thin, quiet scrollbar for a frame a person scrolls (the live preview). The frame is its own
	// document, so the page's palette-tinted scrollbar (native-widgets.css) does not reach it and the
	// browser paints its default one, a wide gray bar beside a slide. The thumb is a wash of the
	// mode's ink; the track stays clear. Off by default: an exported or printed frame is not scrolled.
	// `scrollbar` is true (a default wash of the mode's ink) or the CSS value the host page itself resolved
	// (`getComputedStyle(root).scrollbarColor`, a "thumb track" pair), which is how the frame matches the editor's.
	const barColor = typeof scrollbar === 'string' && scrollbar !== 'auto' ? scrollbar : (mode === 'dark' ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.28)') + ' transparent';
	const bar = scrollbar ? 'html{scrollbar-width:thin;scrollbar-color:' + barColor + ';}' : '';
	const sectionRule =
		'.lattice>section{display:block;transform-origin:top left;' +
		(cursor ? 'cursor:pointer;' : '') +
		(contentVisibility ? 'content-visibility:auto;contain-intrinsic-size:' + gw + 'px ' + gh + 'px;' : '') +
		'}' +
		// THE SLIDE FRAME (lib/core/slide-frame.mjs). The EDGE is the engine's (a 1px keyline in
		// the deck's --border, base.modifiers.css) and needs only the on-screen scale, which the
		// FIT agent stamps when `slideEdge` asks for it. The LIFT rides the CONTAINER, not the
		// section: this frame used to give every slide a 6px radius and a box-shadow of its
		// own, so a square deck previewed rounded — and a `corners-rounded` section's
		// `clip-path` clips its own box-shadow away. A drop-shadow on `.lattice` traces each
		// slide's painted outline instead, square or rounded.
		'.lattice{filter:' + slideFrameFilter('card') + ';}';
	// The slide in focus, marked by a bar down its LEFT edge, inside the slide (the editor marks the same slide with
	// a bar in its gutter). Not an outline: slides are scaled to the frame's width, so an outline's left and right
	// sides fall outside the frame and are clipped, leaving two lines across the top and bottom. And not a section
	// `box-shadow`: the engine spends that property on the overflow ring, the tone rails and the finish frame, and a
	// second rule on it would hide whichever one the slide in focus carries. The bar is its own element
	// (`.db-bar`, placed by markPreviewPages in components/playground/reading-page.ts), so it paints over the slide and
	// takes nothing from it.
	const barRule = activeBar ? 'body{position:relative;}.db-bar{position:absolute;width:6px;z-index:5;pointer-events:none;display:none;background:' + activeBar + ';}' : '';
	const activeRule = activeOutline
		? '.lattice>section.db-active{outline:3px solid ' + activeOutline + ';outline-offset:4px;}'
		: '';
	const printCss = printRules ? buildPrintCss(gw, gh, printOpts) : '';
	return (
		'html,body{margin:0;padding:' + padding + 'px;background:' + bg + ';}' +
		// Center a short deck in the viewport instead of pinning it to the top with a
		// large void below (a single-component preview should sit centered, like the
		// component-page specimens). `safe center` falls back to top-alignment the
		// moment the deck is taller than the viewport, so it never clips or fights the
		// scroll. Off for the cursor-sync filmstrip (Drawing Board), whose scroll math
		// assumes slide 0 sits at the top.
		(center ? 'body{box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;justify-content:safe center;}' : '') +
		scheme +
		bar +
		// Hidden until the FIT agent scales the 1280px sections to the container
		// width (it flips this to visible). Prevents the full-size first-paint flash.
		'.lattice{visibility:hidden;}' +
		// Pins each slide to its intrinsic `@size` box BEFORE FIT scales it. Without
		// it, `section{container-type:size}` collapses and cqi/cqh layouts render
		// tiny + jitter. See frame-css.js + engineering/gotchas.md.
		slideBox(gw, gh) +
		sectionRule +
		activeRule +
		barRule +
		// HARD RULE #22, stylesheet channel. The engine sheet carries a theme's own
		// comment header, and a Studio theme's label/description ride in it — so this
		// string is caller-influenced. A `</style>` anywhere in it would end the element
		// here (RAWTEXT does not care about CSS comments) and turn the rest into markup
		// in this same-origin frame. `fontCss` and `printCss` are ours; `css` is not.
		sanitizeStyleText(css) +
		// printCss LAST so its `@page` wins. CSS merges same-named `@page` rules with
		// the LATER declaration winning per-descriptor, and the engine `css` carries its
		// own `@page{size:<slide-px>;margin:0}` (one-slide-per-page for the color PDF).
		// Emitted before `css`, our `@page{size:<paper>;margin:9mm}` would be overridden
		// and every print came out on the raw slide sheet, edge-to-edge — defeating the
		// paper pick + safe margin. After `css`, the print sheet + margin win. (The
		// `@media print` block is already `!important`, so order never mattered for it.)
		printCss
	);
}

// Build the full srcdoc for a rendered deck. `geom` is the resolved `@size` box
// {w,h}; every visual knob defaults to the simplest (playground) host.
export function buildSrcdoc({
	html,
	css,
	mode,
	geom,
	runtimeUrl,
	// No default: a missing URL means "do not inject that tag" (the sites below are
	// already `url ? tag : ''`), never "fetch it from a CDN". See the note at the top.
	katexUrl = '',
	// The dagre layout engine (`dist/lattice-dagre-min.js`). Same contract as the one
	// above: no default, and no URL means "omit the tag". It used to be inlined into
	// lattice-runtime.js, which put 25.9 KiB gzipped on every reader of every deck for
	// an engine only a BRANCHING state chart uses — see lib/runtime/index.js.
	dagreUrl = '',
	fontCss = '',
	padding = 18,
	// Visible px between stacked slides. A per-surface knob preserving each host's
	// prior spacing (playground 16 · studios 18 · Drawing Board 22) — once three
	// accidentally-drifted hardcodes, now one intentional value. For the SYNC
	// filmstrip it is also the scroll slot pitch, so the FIT margin and the SYNC
	// `centered()` math derive from this single number and can't disagree.
	gap = 18,
	background = null, // optional `(mode) => cssColor`; null → the mode default (DARK_BG/LIGHT_BG) below
	colorScheme = null, // 'light' | 'dark' | null — forced :root color-scheme
	contentVisibility = false,
	scrollbar = false,
	cursor = false,
	activeOutline = null, // accent color string, or null
	activeBar = null, // accent color string for the focus bar down the slide's left edge, or null
	// A 1px EDGE ON EVERY SLIDE, opt-in. The ENGINE draws it (base.modifiers.css, "The slide's
	// EDGE") in the deck's own --border, so it tracks palette and mode and leaves the spectrum
	// whole; this flag only makes the FIT agent tell the engine the on-screen scale.
	//
	// The lift shadow is otherwise the only thing separating a slide from its surround, and
	// it is BLACK — which works on a light ground and disappears on a dark one. The Playground
	// letterboxes the filmstrip in the pane's `--bg-alt` on purpose (see playground-engine:
	// matching the iframe body to the pane means the fade-in has no color shift), and in a
	// palette where a slide's own background lands near `--bg-alt` the two are simply the
	// same color. Measured in cuoio dark: slide, deck page background and pane were all
	// rgb(30,26,21), border `0px none`, and the only separation a 22%-black shadow nobody
	// can see. Reported from a real iPhone — "the slide blends into the background".
	//
	// OPT-IN, defaulting off. This builder also assembles the PRINT document (the engine
	// zeroes the edge under `@media print`) and the export capture frame (`deck-export.js`
	// zeroes it on the captured section), so the edge cannot reach an exported artifact.
	// Any truthy value turns it on; callers pass the old color string, which is now ignored.
	slideEdge = /** @type {string|boolean|null} */ (null),
	printRules = false,
	// { paper, orientation, fit } for buildPrintCss (undefined → auto). Structural type
	// so a caller's PrintOptions (which also carries `color`) is assignable.
	printOpts = /** @type {{paper?:string,orientation?:string,fit?:string}|undefined} */ (undefined),
	clamp = true,
	sync = false,
	center = false, // vertically center a short deck instead of pinning it to the top
	a11yDefs = A11Y_DEFS, // categorical texture <pattern> <defs> — injected into <body>
	// on every render so `fill: url(#latt-a11y-tex-N)` resolves in this browsing
	// context under an a11y theme (inert otherwise). Owned here, not per-caller.
	// A LIVE PREVIEW's font settle (lib/core/font-settle.js `settleLaidOutFonts`): the runtime
	// waits for the faces the laid-out slides use instead of force-loading every declared face.
	// Opt-in, because this builder also assembles export capture frames (the vector Print PDF),
	// which rasterize slides no one has laid out and keep `settleFonts`.
	previewFonts = false,
	lang = 'en', // <html lang> for the frame — real-text surfaces (vector Print PDF, the
	// preview a screen reader can walk) announce the deck's language (WCAG 3.1.1).
	// Emit the remote-subresource CSP (#1753). ON for every frame, previews AND the Studio's
	// export capture frame (trio follow-up 11, owner 2026-09-25): a deck's web images stay
	// blocked until the reader chooses to load them, in what they see and in what they export,
	// as the CLI's offline render has done since 2026-09-24. `false` survives only for a caller
	// that must not carry a policy at all; none in the tree does today.
	csp = true,
	// The web origins the reader allowed for this deck (trio follow-up 11). They join the
	// policy's `img-src`/`media-src`, and every other web image becomes the drawn placeholder
	// (lib/core/remote-ref.js `blockWebImages`) before the sanitizer runs.
	webOrigins = /** @type {string[]} */ ([]),
	// Stamp `data-lattice-diagrams`, the gate rule A is keyed on (see previewDiagramsAttr).
	// Defaults ON — every frame a human WATCHES wants the fence's ink withheld until
	// something draws it. TWO callers pass `false`, and they are the two documents whose
	// bytes the author KEEPS rather than watches:
	//
	//   · the offscreen EXPORT capture frame (`deck-export.js`). It is rasterized, so a
	//     `visibility:hidden` this rule applied is baked into the .pdf / .png / .pptx. (It
	//     keeps the default `csp`: the policy is what stops a web picture at export.)
	//   · the desktop VECTOR PRINT document (`PrintOptionsPanel.tsx`), mounted off-screen at
	//     -10000px and handed straight to `print()`.
	//
	// In either, if Mermaid fails (a 404, a CSP block), stamping turns the author's only
	// signal that the diagram never drew into an empty slot, in bytes they downloaded. Not
	// stamping leaves both paths exactly as they were before rule A existed.
	//
	// WHICH CALLER IS WHICH IS A TEST, NOT A CONVENTION. This list was wrong for one release
	// — it said "the one caller", while the print document had never opted out — so
	// `deck-preview.test.js` censuses every `previewDiagramsAttr` site and every caller of
	// this builder, and fails on one nobody has classified.
	diagrams = true,
	// WHAT THE WHOLE DECK NEEDS, when `html` holds only part of it. The Playground's virtual
	// filmstrip writes most slides as empty placeholders, and the three asset flags and the
	// security policy below are read out of `html` — so a KaTeX slide, a Mermaid fence or a
	// refused web image sitting in a placeholder would be missed, and mounting it later would
	// find no stylesheet, no renderer, or a policy that kept a wildcard it should have
	// withheld. `{ katex, drawn, dagre, blocked }`, from the full render; null → read `html`.
	deck = /** @type {{katex:boolean,drawn:boolean,dagre:boolean,blocked:Array<{origin:string}>}|null} */ (null),
}) {
	// Strip script-bearing content before it reaches this same-origin srcdoc
	// frame (#616 T-CONTENT). Covers buildSrcdoc's external caller too
	// (drawing-board-export.js); the in-repo renderDeck path also pre-sanitizes
	// for its innerHTML patch, so this is a no-op there.
	// The site's own origin is not a web image: it serves the `sample:` art (remote-ref.js withOwnOrigin).
	const web = remoteRef.blockWebImages(html, remoteRef.withOwnOrigin(webOrigins));
	html = sanitizeSlideHtml(web.html);
	const gw = (geom?.w) || 1280;
	const gh = (geom?.h) || 720;
	const docCss = docStyleText({ css, mode, geom, padding, background, colorScheme, contentVisibility, cursor, activeOutline, printRules, printOpts, center, scrollbar, activeBar });
	// Every script this document runs is a same-origin file, the agents' one beside the runtime
	// (frame-agents.mjs): the frame inherits the page's script policy, which allows no inline script.
	const agents = frameAgentsUrl(runtimeUrl);
	// srcdoc (a fresh browsing context per write), NOT doc.open()/write()/close():
	// the latter keeps the iframe window, so lattice-runtime.js's one-shot Mermaid
	// bootstrap guard survives and every later render short-circuits the runtime —
	// Mermaid/charts added after the first edit never render. A fresh srcdoc resets
	// the guard. See engineering/gotchas.md "Playground: Mermaid stops rendering".
	// Inject the heavy third-party assets ONLY when the deck needs them: the KaTeX
	// stylesheet solely styles `.katex` spans. A plain text deck — the common case — then
	// pulls none, so a preview never waits on a file it won't use. renderDeck folds the
	// flag into its signature, so an edit that ADDS math forces a full rewrite that injects
	// the asset rather than a section-only patch that would leave it out.
	//
	// A fence a runtime draws (Mermaid's) needs no tag here: the runtime's plugin host loads
	// the plugin's library itself, beside `runtimeUrl`, when a fence is present — including
	// one a later section patch brings in. What this document still owes is the promise
	// below (`previewDiagramsAttr`), and the fence probe comes from the plugin registry.
	const needsKatex = deck ? deck.katex : html.indexOf('katex') !== -1;
	const needsDrawn = deck ? deck.drawn : markupHasDrawnFence(html);
	// The graph charts' model attributes, not their classes: only a state chart's DEFAULT
	// variant emits `data-sc-model`, and it is the only variant the browser pass draws (the
	// `inline` variant renders chips and needs no layout engine at all); every flowchart
	// emits `data-fc-model`. The attributes survive DOMPurify (data-* attributes are
	// allowed), so they read the same on the sanitized sections renderDeck signs below.
	const needsDagre = deck ? deck.dagre : html.indexOf('data-sc-model') !== -1 || html.indexOf('data-fc-model') !== -1;
	return (
		'<!doctype html><html lang="' + (String(lang || 'en').replace(/[^A-Za-z0-9-]/g, '') || 'en') + '"' + (previewFonts ? ' data-lattice-preview=""' : '') + previewDiagramsAttr(diagrams && needsDrawn && !!runtimeUrl) + '><head><meta charset="utf-8">' +
		// FIRST in <head>, before any content or subresource link — a CSP meta governs only
		// what the parser has not already reached (#1753).
		(csp ? previewCspMeta({ katexUrl, webOrigins, blocked: [...(deck ? deck.blocked : web.blocked), ...remoteRef.webRefsInCss(css)] }) : '') +
		// BOTH conditions, and the URL half is the one that was missing. The content gate
		// alone emitted `<link href="">` when a math deck met a caller that passed no URL —
		// harmless in Chromium (measured: no request), but it made the note's stated safety
		// property ("a missing URL means no tag") false at this site. Now it is true.
		(needsKatex && katexUrl ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		// Guarded too, though `fontCss` is ours (previewFontFaceCss over a static table of
		// bundled .woff2). `buildSrcdoc` is EXPORTED and has external callers, so "ours" is
		// a property of today's call sites, not of this function — and the #22 gate is
		// file-scoped, so a second unguarded sink here would keep the file green. Two
		// independent review passes both landed on this line; the guard is free (it returns
		// by identity when there is nothing to escape) and it makes the file's own
		// accounting true rather than a comment asking to be trusted.
		(fontCss ? '<style>' + sanitizeStyleText(fontCss) + '</style>' : '') +
		'<style id="lattice-doc">' + docCss +
		'</style>' +
		// The font gate, in <head> — the ONE placement rule across all three preview
		// builders. It publishes `__latticeFontsSettled` / `__latticeFontsReady`
		// synchronously and defers its own measurement to DOMContentLoaded, so being
		// early costs nothing and being early is what a POLLING revealer needs (see
		// lib/core/preview-font-gate.mjs). It must precede every revealer, because a
		// revealer that finds no gate reveals immediately by design — so a late gate
		// is a silent no-op, not a visible failure. `preview-font-gate.test.js` pins
		// the order at every call site for exactly that reason.
		agentTag(agents, 'fontgate') +
		// The diagram library's fetch starts with the document, not after the runtime boots.
		// A library whose kind the page's draw host offers is drawn in the host's own sandboxed frame, so the preview frame loads none.
		(needsDrawn && runtimeUrl ? drawnLibraryPreload(runtimeUrl, typeof window !== 'undefined' ? window.__latticeDrawHost?.kinds : undefined) : '') +
		'</head><body>' +
		a11yDefs +
		html +
		// BEFORE the runtime tag, and that order is the mechanism rather than a tidy
		// preference: both are classic scripts, so they execute in document order, and
		// the runtime's state-chart pass reads `globalThis.__latticeDagre` synchronously
		// on its first draw. After the runtime tag the engine would arrive too late and
		// every branching machine would paint as a numbered column.
		(needsDagre && dagreUrl ? '<scr' + 'ipt src="' + dagreUrl + '"></scr' + 'ipt>' : '') +
		'<scr' + 'ipt src="' + runtimeUrl + '"></scr' + 'ipt>' +
		agentTag(agents, 'geom', { w: gw, h: gh, edge: !!slideEdge }) +
		agentTag(agents, 'fit', { gap, clamp: !!clamp }) +
		agentTag(agents, 'link') +
		(sync ? agentTag(agents, 'sync', { gap }) : '') +
		'</body></html>'
	);
}

/**
 * The attribute a preview document wears to say "a runtime that draws diagram fences is
 * loaded into me from a URL, so something WILL replace a diagram fence". ONE place writes it, because it
 * is a promise about the document rather than a style hook: `mermaid.css` withholds an
 * un-tagged Mermaid fence's ink only under `[data-lattice-diagrams]`, on the reasoning
 * that hiding a diagram's source is right only where something is going to draw it.
 *
 * KEYED ON THE BUILDER'S COMMITMENT, not on the runtime's boot mark, and the distinction
 * is the whole point. The first version of this gate used `data-lattice-runtime` — a name the RUNTIME
 * ITSELF has always written on `document.documentElement` at boot
 * (lib/runtime/index.js), which made "only a builder writes it" false in four documents
 * and, worse, turned the rule on in exactly the hosts it was meant to spare. On a page
 * with the runtime but no Mermaid (marp-vscode's plain markdown preview and its
 * render-blocks-only stub, a 404 on the Mermaid URL, a CSP that blocks it) a fence
 * arriving after boot was hidden permanently: neither guard would tag it, and the CSS hid
 * it anyway. Driven and confirmed by an independent checker before this shipped.
 *
 * The runtime alone was never the right precondition regardless. A fence is replaced by
 * MERMAID; a document with the runtime and no Mermaid renders no diagram, so its author
 * needs the source they can read.
 *
 * The commitment used to be the Mermaid `<script src>` the builder injected. Mermaid is now
 * the plugin's payload, which the runtime's plugin host fetches from beside the runtime, so
 * the builder commits by loading the runtime FROM A URL into a document that holds a drawn
 * fence (`willDraw`). A library that then fails to load is the case the old URL had too (a
 * 404 on it): the runtime gives up and hands every tagged fence back to its source.
 *
 * Returns nothing when the caller does not commit, so a document that will not
 * draw the diagram never claims it will: the fence stays readable, which is the old
 * behavior and the safe direction. The CLI export, the .html player builder and any page
 * we did not assemble fall in that half by simply not calling this.
 *
 * The Studio's offscreen EXPORT capture frame loads the runtime and would otherwise stamp through this same builder — it does not, because `buildSrcdoc`'s
 * `diagrams` knob is `false` there. It is not watched by anyone, so the anti-flash rule
 * buys nothing, and it IS rasterized: `html-to-image` copies the computed style onto its
 * clone, so a `visibility:hidden` this rule applied would be baked into the .pdf / .png /
 * .pptx whenever Mermaid failed inside that frame. Every export path therefore keeps the
 * pre-rule behavior — the .html player because its builder re-assembles the document
 * without stamping, the raster paths because the capture frame does not stamp at all.
 * See engineering/decisions/2026-09-05-diagram-fence-flash.md §4A.
 */
export function previewDiagramsAttr(willDraw) {
	return willDraw ? ' data-lattice-diagrams' : '';
}

export default { buildSrcdoc, splitSections };
