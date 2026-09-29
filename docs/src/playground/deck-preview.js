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

import { fontGateAgent, onFontsReady } from '../../../lib/core/preview-font-gate.mjs';
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

// FIT agent (a string injected into the iframe). Scales each section to the
// container width, collapses the gap the un-scaled layout box would leave,
// clamps + clips the filmstrip tail, then reveals .lattice. `gap` is the visible
// px between slides (must match the SYNC agent's slot pitch); `clamp` removes the
// dead trailing scroll space the final section's full-height box leaves.
function fitAgent(gap, clamp) {
	return [
		'(function(){',
		'  function fit(){',
		'    var lattice=document.querySelector(".lattice"); if(!lattice) return;',
		'    var w=lattice.clientWidth; if(!w) return;',
		// Pinned to the deck's `@size` box (GEOM globals), so scale by the constant
		// w/SW — no offsetWidth measurement to drift as KaTeX/Mermaid stream in.
		'    var SW=window.__SLIDE_W||1280, SH=window.__SLIDE_H||720, GAP=' + gap + ';',
		// Sections AND the virtual filmstrip's placeholders (deck-render.js), in deck order: a
		// placeholder is scaled and spaced exactly like the slide it stands for, so the
		// filmstrip's geometry is the same mounted or not.
		'    var secs=lattice.querySelectorAll(":scope>section,:scope>div[data-lv-ph]");',
		'    var sc=w/SW;',
		// STAGE: a host that shows ONE slide at a time (the Playground's desktop Explore) marks
		// its iframe `data-stage`. Centering a slide then leaves (pane - slide) / 2 above and
		// below it, and with the ordinary gap a strip of each neighbor showed there. Widen the
		// gap to cover that margin. Read off the frame element, so it holds from the first fit,
		// and every other host (no attribute) keeps its gap exactly.
		// Only while the frame really IS one slide tall (a margin of 40px or less, the same line
		// the host's `scrollWalk` centers under). A pane the frame's width clamp leaves taller —
		// an iPad in portrait above the tab breakpoint — is a filmstrip, where the host pins the
		// slide to the top; widening there gave a 300px empty band. Found by a checker.
		'    try{if(window.frameElement&&window.frameElement.hasAttribute("data-stage")){var sp=(window.innerHeight-SH*sc)/2;if(sp>0&&sp<=40){var sg=Math.ceil(sp)+8;if(sg>GAP)GAP=sg;}}}catch(e){}',
		// The engine's slide EDGE needs one number: slide-percent per screen pixel (100 / the
		// slide's on-screen width). Only when the builder asked for an edge (`slideEdge`).
		'    if(window.__SLIDE_EDGE){var k=String(100/w);if(lattice.__lfK!==k){lattice.style.setProperty("--slide-edge-k",k);lattice.__lfK=k;}}',
		// WRITE ONLY WHAT CHANGED. This runs after every section patch — every keystroke —
		// and writing the same transform and margin onto every slide again invalidated the
		// style of the whole deck each time: measured, it was the largest single cost of a
		// keystroke after the runtime pass. A section keeps the value it was given on an
		// expando; a patched-in section is a new element with none, so it is always written.
		'    var T="scale("+sc+")", MB=(SH*sc-SH+GAP)+"px";',
		'    for(var i=0;i<secs.length;i++){var s=secs[i];',
		'      if(s.__lfT===T&&s.__lfM===MB&&s.style.transform) continue;',
		'      s.style.transformOrigin="top left";',
		'      s.style.transform=T;',
		'      s.style.marginBottom=MB;',
		'      s.__lfT=T; s.__lfM=MB;',
		'    }',
		// Clamp the filmstrip to the scaled-content height and CLIP the tail the
		// last slide leaves: transform scales the paint, not the layout box, so the
		// final 1280xSH section keeps its full-height box and would otherwise spill
		// ~SH*(1-sc) of dead scroll space below the deck. The slide frame is a filter on
		// `.lattice` itself, which its own overflow clip never clips; the clip margin is
		// kept for any author content that paints past a slide's box.
		clamp
			? '    if(secs.length){var H=(secs.length*SH*sc+(secs.length-1)*GAP)+"px";if(lattice.__lfH!==H){lattice.style.height=H;lattice.style.overflow="clip";lattice.style.overflowClipMargin="40px";lattice.__lfH=H;}}'
			: '',
		// Reveal only once scaled AND once the document's own faces have landed.
		// The srcdoc hides .lattice so the first paint (and the display:none->block
		// pane switch on mobile, where clientWidth is 0 until shown) never flashes
		// the slides at full 1280px width — `revealOk` extends that same gate over
		// the FONT SWAP, which was the other thing a reader saw happen to a slide
		// that was already on screen.
		//
		// Measured on `/playground/?view=edit` with a `list` + `cards-grid` deck and
		// the faces served over a modeled link: without the gate the frame showed
		// TWO layouts (197ms, 517ms) and the worst text run moved 330.3px across
		// them. `fit()` still runs and still SCALES on every earlier call — only the
		// reveal waits, so the geometry is finished before it is visible rather than
		// computed late. See lib/core/preview-font-gate.mjs for why this waits on
		// `document.fonts.ready` and not on `settleFonts`.
		'    if(revealOk&&lattice.style.visibility!=="visible") lattice.style.visibility="visible";',
		'  }',
		'  var revealOk=false;',
		// `fit()` and not `gatedFit()`, deliberately: the drag suspension below exists to
		// stop a PER-FRAME fit storm while a splitter is dragged, and this is ONE fit, once
		// per document. Routing it through the gate would mean a reader who happens to be
		// dragging the splitter as the faces land sees nothing at all until they let go.
		'  function revealNow(){revealOk=true;fit();}',
		// Drag-time suspension: a live pane-splitter drag resizes this iframe every
		// frame, and each width change would run fit() (O(sections) style writes +
		// a filmstrip reflow) via the resize/RO listeners below — a per-frame layout
		// storm on large decks. The parent suspends during drag and resumes on the
		// authoritative end-of-drag, which runs the ONE re-fit that matters.
		'  var fitSuspended=false;',
		'  function gatedFit(){if(!fitSuspended)fit();}',
		'  window.__latticeFit=gatedFit;',
		'  window.__latticeFitSuspend=function(){fitSuspended=true;};',
		// Resume defers ONE frame: on iOS WebKit the parent may commit the new
		// track widths and resume in the same tick — measuring clientWidth before
		// the iframe relayout lands re-fits against the stale width (tiny slides
		// over background). One rAF puts the measurement after layout; a second
		// fit on a timeout is the WebKit belt.
		// The follow-ups go through the GATE so a new drag started within ~120ms
		// of a release can't sneak one full mid-drag fit past the suspension.
		'  window.__latticeFitResume=function(){fitSuspended=false;requestAnimationFrame(gatedFit);setTimeout(gatedFit,120);};',
		'  window.addEventListener("resize",gatedFit);',
		'  if(typeof ResizeObserver!=="undefined"){',
		'    var ro=new ResizeObserver(function(){gatedFit();});',
		'    var m=document.querySelector(".lattice");',
		'    if(m){ro.observe(document.documentElement);',
		'      var ss=m.querySelectorAll(":scope>section,:scope>div[data-lv-ph]");',
		'      for(var i=0;i<ss.length;i++) ro.observe(ss[i]);}',
		'  }',
		'  fit();',
		// …and reveal once the faces are ready. `revealNow` re-runs fit(), so the
		// geometry a reader first sees is the one solved against the real metrics.
		'  ' + onFontsReady('revealNow'),
		// Backstop for async Mermaid/chart renders that grow a section after the
		// observers are attached (or where ResizeObserver is absent). The fixed-box
		// scale is content-independent, so these are belt-and-braces, not required.
		'  [60,300,1200,2500].forEach(function(t){setTimeout(fit,t);});',
		'})();',
	].filter(Boolean).join('\n');
}

// SYNC agent (Drawing Board only): tags each section with its index, reports the
// scrolled-to slide to the parent, and listens for scroll/active messages. `gap`
// MUST equal the FIT gap — the scroll-position math is a fixed-pitch filmstrip.
function syncAgent(gap) {
	return [
		'(function(){',
		'  function secs(){var m=document.querySelector(".lattice");return m?m.querySelectorAll(":scope>section"):[];}',
		'  function tag(){var s=secs();for(var i=0;i<s.length;i++)s[i].setAttribute("data-idx",i);}',
		'  window.__latticeTag=tag;',
		'  tag();',
		'  function setActive(i){var s=secs();for(var k=0;k<s.length;k++)s[k].classList.toggle("db-active",k===i);}',
		// Honor prefers-reduced-motion: a smooth cursor-follow scroll becomes an instant jump.
		'  var REDUCE=typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches;',
		'  function scrollTo(i,smooth){var s=secs();if(!s[i])return;window.scrollTo({top:Math.max(0,s[i].offsetTop-' + gap + '),behavior:(smooth&&!REDUCE)?"smooth":"auto"});setActive(i);}',
		'  function centered(){var m=document.querySelector(".lattice");var s=secs();if(!s.length)return -1;var w=m?m.clientWidth:0;if(!w)return 0;var SW=window.__SLIDE_W||1280,SH=window.__SLIDE_H||720;var slotH=SH*(w/SW)+' + gap + ';if(slotH<=0)return 0;var i=Math.round(window.scrollY/slotH);if(i<0)i=0;if(i>=s.length)i=s.length-1;return i;}',
		'  var raf=0,lastC=-1;',
		'  function report(){var i=centered();if(i>=0&&i!==lastC){lastC=i;setActive(i);parent.postMessage({type:"db-slide-scrolled",idx:i},"*");}}',
		'  function onScroll(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;report();});}',
		'  window.addEventListener("scroll",onScroll,{passive:true});',
		'  if(typeof IntersectionObserver!=="undefined"){var io=new IntersectionObserver(onScroll,{rootMargin:"-45% 0px -45% 0px"});var _ss=secs();for(var _si=0;_si<_ss.length;_si++)io.observe(_ss[_si]);}',
		'  document.addEventListener("click",function(e){var n=e.target;while(n&&!(n.parentNode&&n.parentNode.classList&&n.parentNode.classList.contains("lattice")))n=n.parentNode;if(n)parent.postMessage({type:"db-slide-click",idx:+n.getAttribute("data-idx")},"*");});',
		'  window.addEventListener("message",function(e){var d=e.data||{};if(d.type==="db-scroll-to")scrollTo(d.idx,d.smooth);else if(d.type==="db-set-active")setActive(d.idx);});',
		'  parent.postMessage({type:"db-frame-ready"},"*");',
		'})();',
	].join('\n');
}

// LINK GUARD agent — a preview-only click interceptor so an external link tap
// can never navigate (and blank) the preview frame.
//
// A slide can carry a real `<a href="https://…" target="_blank">` — the `video`
// poster links to the clip, `contact`/`qr`/`closing` carry live URLs — because in
// the EXPORTED HTML/PDF those are genuine, clickable links. But inside the scaled
// `srcdoc` preview iframe, iOS Safari follows the tap INTO the iframe: it navigates
// the frame to the external site, which frame-blocks (X-Frame-Options / CSP), so
// the preview goes blank and never returns (reported: tap the video poster on
// iPhone → blank; desktop opened a new tab so it was invisible). Same class as the
// debug touch saga — the frame is the wrong place for the interaction
// (2026-07-01-debug-bounding-boxes.md).
//
// Capture-phase: for any http(s) anchor, cancel the frame navigation and open the
// URL in a real TOP-LEVEL tab instead (same-origin srcdoc → window.top reachable).
// If the popup is blocked the frame is still preserved (preventDefault ran), so the
// worst case is an inert tap, never a blanked preview. In-page/relative anchors
// (`#id`, `mailto:`, `tel:`) are left alone. Preview-only: the exported artifact's
// link is untouched. Injected into every filmstrip srcdoc (Playground + Drawing
// Board); the Drawing Board's SYNC slide-select still fires (we don't stop
// propagation), so tapping a linked slide both opens the tab and selects the slide.
//
// VIDEO PLAYBACK BRIDGE: a `.video-poster` tap first offers itself to a PARENT-
// hosted player (video-overlay.js sets `window.__videoPlay`). If the parent mounts
// a player (embeddable provider) it returns true → we suppress navigation and the
// clip plays IN PLACE. If there's no overlay, or the provider isn't embeddable, it
// returns false/undefined and we fall through to the open-a-tab behavior. That holds
// only where a tap can REACH the frame. The Studio's live preview sits in a
// `pointer-events-none` box (its holder owns swipe and pinch), so there the parent
// hit-tests the tap itself with `tapVideoAt` (video-overlay.js).
//
// Exported so the OTHER preview builders (present/stage-window.js, single-slide-render.ts)
// that assemble their own srcdoc can inject the same
// guard — it fixes the external-link-tap-blanks-the-frame bug on ALL of them, and
// carries the video-playback bridge to each.
export function linkGuardAgent() {
	return [
		'(function(){',
		'  document.addEventListener("click",function(e){',
		'    var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;',
		'    if(!a)return;',
		'    var href=a.getAttribute("href")||"";',
		'    if(!/^https?:/i.test(href))return;',
		'    if(a.classList.contains("video-poster")&&typeof window.__videoPlay==="function"){',
		'      try{if(window.__videoPlay(a)){e.preventDefault();return;}}catch(_p){}',
		'    }',
		'    e.preventDefault();',
		'    try{(window.top||window).open(href,"_blank","noopener,noreferrer");}catch(_e){}',
		'  },true);',
		'})();',
	].join('\n');
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
export function docStyleText({ css, mode, geom, padding = 18, background = null, colorScheme = null, contentVisibility = false, cursor = false, activeOutline = null, printRules = false, printOpts = undefined, center = false }) {
	const gw = (geom?.w) || 1280;
	const gh = (geom?.h) || 720;
	const bg = background ? background(mode) : (mode === 'dark' ? DARK_BG : LIGHT_BG);
	const scheme = colorScheme ? ':root{color-scheme:' + colorScheme + ';}' : '';
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
		// Hidden until the FIT agent scales the 1280px sections to the container
		// width (it flips this to visible). Prevents the full-size first-paint flash.
		'.lattice{visibility:hidden;}' +
		// Pins each slide to its intrinsic `@size` box BEFORE FIT scales it. Without
		// it, `section{container-type:size}` collapses and cqi/cqh layouts render
		// tiny + jitter. See frame-css.js + engineering/gotchas.md.
		slideBox(gw, gh) +
		sectionRule +
		activeRule +
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
	// The dagre layout engine (`dist/lattice-dagre.min.js`). Same contract as the one
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
	cursor = false,
	activeOutline = null, // accent color string, or null
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
	//   · the offscreen EXPORT capture frame (`deck-export.js`), which also passes
	//     `csp: false` for the mirror-image reason. It is rasterized, and `html-to-image`
	//     copies the COMPUTED style onto its clone — so a `visibility:hidden` this rule
	//     applied is baked into the .pdf / .png / .pptx;
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
	const web = remoteRef.blockWebImages(html, webOrigins);
	html = sanitizeSlideHtml(web.html);
	const gw = (geom?.w) || 1280;
	const gh = (geom?.h) || 720;
	const docCss = docStyleText({ css, mode, geom, padding, background, colorScheme, contentVisibility, cursor, activeOutline, printRules, printOpts, center });
	const GEOM_GLOBALS = 'window.__SLIDE_W=' + gw + ';window.__SLIDE_H=' + gh + ';' + (slideEdge ? 'window.__SLIDE_EDGE=1;' : '');
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
	// `data-sc-transitions` and not the `.state-chart-figure` class: only the DEFAULT
	// variant emits the attribute, and it is the only variant the browser pass draws.
	// The `inline` variant renders chips and needs no layout engine at all. The
	// attribute survives DOMPurify (data-* attributes are allowed), so it reads the
	// same on the sanitized sections renderDeck signs below.
	const needsDagre = deck ? deck.dagre : html.indexOf('data-sc-transitions') !== -1;
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
		'<scr' + 'ipt>' + fontGateAgent() + '</scr' + 'ipt>' +
		// The diagram library's fetch starts with the document, not after the runtime boots.
		(needsDrawn && runtimeUrl ? drawnLibraryPreload(runtimeUrl) : '') +
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
		'<scr' + 'ipt>' + GEOM_GLOBALS + '</scr' + 'ipt>' +
		'<scr' + 'ipt>' + fitAgent(gap, clamp) + '</scr' + 'ipt>' +
		'<scr' + 'ipt>' + linkGuardAgent() + '</scr' + 'ipt>' +
		(sync ? '<scr' + 'ipt>' + syncAgent(gap) + '</scr' + 'ipt>' : '') +
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
