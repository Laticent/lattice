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

import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { texturePatternDefs } from './a11y-textures.generated.js';
import { slideBox } from './frame-css.js';
import { splitSections } from './preview-virtual.js';

export { splitSections };

export const KATEX_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
// UMD build sets window.mermaid, which lattice-runtime.js polls for and then
// renders ```mermaid fences (and charts/split-panels via applyAllToDom).
export const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

// The categorical/chart texture <defs> (the a11y redundant-encoding mechanism),
// built ONCE from the shared kernel (HARD RULE #1). buildSrcdoc injects this on
// EVERY render so every surface that uses this controller — Drawing Board,
// Playground, both Workbench studios — shows a11y textures identically, instead
// of each caller opting in (the Drawing Board did; the others didn't → wireframe
// pies). Inert under colour themes: nothing references the patterns there.
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
		'    var secs=lattice.querySelectorAll(":scope>section");',
		'    var sc=w/SW;',
		'    for(var i=0;i<secs.length;i++){var s=secs[i];',
		'      s.style.transformOrigin="top left";',
		'      s.style.transform="scale("+sc+")";',
		'      s.style.marginBottom=(SH*sc-SH+GAP)+"px";',
		'    }',
		// Clamp the filmstrip to the scaled-content height and CLIP the tail the
		// last slide leaves: transform scales the paint, not the layout box, so the
		// final 1280xSH section keeps its full-height box and would otherwise spill
		// ~SH*(1-sc) of dead scroll space below the deck. overflow-clip-margin lets
		// the slide drop-shadow still bleed past the clip edge.
		clamp
			? '    if(secs.length){lattice.style.height=(secs.length*SH*sc+(secs.length-1)*GAP)+"px";lattice.style.overflow="clip";lattice.style.overflowClipMargin="40px";}'
			: '',
		// Reveal only once scaled — the srcdoc hides .lattice so the first paint
		// (and the display:none->block pane switch on mobile, where clientWidth is
		// 0 until shown) never flashes the slides at full 1280px width.
		'    lattice.style.visibility="visible";',
		'  }',
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
		'      var ss=m.querySelectorAll(":scope>section");',
		'      for(var i=0;i<ss.length;i++) ro.observe(ss[i]);}',
		'  }',
		'  fit();',
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
		// Honour prefers-reduced-motion: a smooth cursor-follow scroll becomes an instant jump.
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
// returns false/undefined and we fall through to the open-a-tab behavior. Clicks
// reach the iframe fine on iOS (it's touch-move gestures that don't), so this hook
// is enough — no parent hit-surface needed.
//
// Exported so the OTHER preview builders (presenter-window.js, single-slide-render.ts,
// drawing-board-practice.js) that assemble their own srcdoc can inject the same
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

// Print CSS for the browser ⌘P / "Print deck" surface (the shared kernel for the
// Studio's Print drawer AND the Drawing Board print — HARD RULE #1). Three jobs
// beyond one-slide-per-page:
//   1. Pick the standard sheet that wastes the least page for this deck's aspect and
//      pre-select landscape in the dialog — 16:9 → US Legal (far less letterbox than
//      Letter), 4:3 → Letter landscape (near edge-to-edge), tall decks → Letter
//      portrait. The
//      MediaBox/orientation IS how a PDF tells the printer, so this fixes the old
//      "16:9 shrunk into portrait A4" default (2026-06-14-deck-print-styling.md).
//   2. Scale each fixed slide box to the printable area with `zoom`, not `transform`:
//      zoom scales the LAYOUT box, so pagination and centering see the fitted size
//      (a transform would leave a 1280px box overflowing an 816px page). `zoom` is
//      supported in print by current Chromium and Firefox (≥126).
//   3. Hold a 9mm safe margin — it also dodges the ~3-5mm unprintable edge every
//      physical printer clips, so full-bleed content never loses its border.
// Never crops; a slide narrower than the sheet centers with white letterbox bands.
// Paper sheets in CSS px at 96dpi, PORTRAIT (w×h). Landscape swaps them.
export const PRINT_SHEETS = {
	letter: [816, 1056],   // 8.5×11in
	legal: [816, 1344],    // 8.5×14in
	a4: [794, 1123],       // 210×297mm
};

// 9mm safe margin in px @96dpi (≈34px) — also dodges the ~3-5mm unprintable edge
// every physical printer clips. Shared by the vector print CSS and the print PDF.
export const PRINT_SAFE_PX = Math.round(9 * (96 / 25.4));

// Resolve the print SHEET (paper + orientation + px dimensions) for a deck's box.
// `opts` (all optional): { paper:'auto'|'letter'|'legal'|'a4', orientation:'auto'
// |'landscape'|'portrait' }. Auto picks the least-wasteful sheet + orientation for
// the deck's aspect; explicit values override. ONE source of truth for the paper
// decision (HARD RULE #1) — the Drawing Board's vector print CSS AND the Studio's
// print-to-PDF (share-export.ts, bakes the sheet into the real PDF MediaBox) both
// call this, so the two surfaces can never disagree on which sheet a deck prints on.
export function resolvePrintSheet(gw, gh, opts) {
	const o = opts || {};
	const aspect = gw / gh;
	// Paper: auto → least-wasteful sheet for the aspect (16:9→Legal, 4:3/other→Letter).
	const paper = ['letter', 'legal', 'a4'].includes(o.paper) ? o.paper : (aspect >= 1.55 ? 'legal' : 'letter');
	// Orientation: auto → landscape only once the deck is meaningfully wider than square
	// (aspect ≥ 1.15), else portrait. The 1.15 threshold — NOT `gw >= gh` — preserves the
	// original three-way ladder: a near-square deck (1.0 ≤ aspect < 1.15) prints letter
	// PORTRAIT, matching the pre-existing Drawing Board vector print exactly (a bare
	// `gw >= gh` would silently flip those to landscape). Explicit orientation overrides.
	const orientation = o.orientation === 'landscape' || o.orientation === 'portrait'
		? o.orientation
		: (aspect >= 1.15 ? 'landscape' : 'portrait');
	const [pw, ph] = PRINT_SHEETS[paper];
	const [pageW, pageH] = orientation === 'landscape' ? [ph, pw] : [pw, ph];
	return { paper, orientation, pageW, pageH };
}

// Fit + center a slide box onto a sheet (all px @96dpi), holding the 9mm safe margin.
// Returns the placement rect for the slide image on the page. `fit:'actual'` prints
// at 1:1 (may exceed the printable box → clip); default scales to fit, never upscaled.
// The print PDF (share-export.ts) uses this to place each rasterized slide on its page.
export function fitSlideOnSheet(gw, gh, pageW, pageH, fit) {
	const availW = pageW - 2 * PRINT_SAFE_PX;
	const availH = pageH - 2 * PRINT_SAFE_PX;
	const scale = fit === 'actual' ? 1 : Math.min(Math.min(availW / gw, availH / gh), 1);
	const w = gw * scale;
	const h = gh * scale;
	return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

// N-up grid arrangement — the cols×rows (cols·rows ≥ nup) that fits the biggest slide
// for this sheet + slide aspect. 1→1×1; 2→ the better of 2×1 / 1×2 (so wide 16:9 slides
// stack instead of squeezing side-by-side); 4→2×2. Pure — shared by the Print drawer
// preview and the PDF assembler (HARD RULE #1).
export function nUpGrid(nup, pageW, pageH, gw, gh) {
	if (!(nup > 1)) return { cols: 1, rows: 1 };
	if (nup === 2) {
		const scaleFor = (cols, rows) => Math.min(pageW / cols / gw, pageH / rows / gh);
		return scaleFor(2, 1) >= scaleFor(1, 2) ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
	}
	return { cols: 2, rows: 2 };
}

// Speaker-notes handout regions for ONE sheet (all px @96dpi): the slide fit + centered in
// the TOP band (~55% of the printable height), its speaker notes in the band below, both
// inside the 9mm safe margin. Shared by the Print drawer preview (slide iframe + a notes
// box) and the PDF assembler (slide image + jsPDF-drawn note text) — HARD RULE #1.
export function handoutRegions(gw, gh, pageW, pageH, fit) {
	const SAFE = PRINT_SAFE_PX;
	const availW = pageW - 2 * SAFE;
	const availH = pageH - 2 * SAFE;
	const gap = Math.round(SAFE / 2);
	const slideBandH = Math.round(availH * 0.55);
	const scale = fit === 'actual' ? 1 : Math.min(Math.min(availW / gw, slideBandH / gh), 1);
	const w = gw * scale;
	const h = gh * scale;
	const slide = { x: SAFE + (availW - w) / 2, y: SAFE + (slideBandH - h) / 2, w, h };
	const notesY = SAFE + slideBandH + gap;
	const notes = { x: SAFE, y: notesY, w: availW, h: availH - slideBandH - gap };
	return { slide, notes };
}

// Placement rects for the `nup` slides on ONE sheet (all px @96dpi): an outer 9mm safe
// margin around the whole sheet, a smaller gutter between cells, each slide fit + centered
// in its cell. `nup=1` collapses to exactly `fitSlideOnSheet` (one full-page cell). The
// assembler places image i at cells[i % nup]; the drawer preview positions an iframe per
// cell. `fit:'actual'` prints each cell 1:1 (may clip).
export function nUpCells(gw, gh, pageW, pageH, nup, fit) {
	const n = [1, 2, 4].includes(nup) ? nup : 1;
	const { cols, rows } = nUpGrid(n, pageW, pageH, gw, gh);
	const SAFE = PRINT_SAFE_PX;
	const gutter = n > 1 ? Math.round(SAFE / 2) : 0;
	const cellW = (pageW - 2 * SAFE - (cols - 1) * gutter) / cols;
	const cellH = (pageH - 2 * SAFE - (rows - 1) * gutter) / rows;
	const cells = [];
	for (let i = 0; i < n; i++) {
		const c = i % cols;
		const r = Math.floor(i / cols);
		const cx = SAFE + c * (cellW + gutter);
		const cy = SAFE + r * (cellH + gutter);
		const scale = fit === 'actual' ? 1 : Math.min(Math.min(cellW / gw, cellH / gh), 1);
		const w = gw * scale;
		const h = gh * scale;
		cells.push({ x: cx + (cellW - w) / 2, y: cy + (cellH - h) / 2, w, h });
	}
	return cells;
}

// Vector print CSS for the browser ⌘P path (the Drawing Board print; the Studio's
// "Print deck" now prints a real PDF instead — share-export.ts). `opts`:
// { paper, orientation, fit:'page'|'actual' }; auto by default.
function buildPrintCss(gw, gh, opts) {
	const o = opts || {};
	const SAFE = PRINT_SAFE_PX; // 9mm ≈ 34px, per printable edge
	const { paper, orientation, pageW, pageH } = resolvePrintSheet(gw, gh, o);
	const size = paper + ' ' + orientation;
	// GUARD: shave 2px off the printable box before fitting. At an exact fit (e.g. a
	// 9:16 slide whose scaled height equals the page), sub-pixel rounding can nudge the
	// box a hair over the page and spill every slide onto a second sheet — the guard +
	// floor keep the scaled box strictly inside, so it's always one slide per page.
	const k = Math.min((pageW - 2 * SAFE - 2) / gw, (pageH - 2 * SAFE - 2) / gh);
	// fit:'actual' → 1:1 (native size, may clip); default → scale to fit, floored, never upscaled.
	const zoom = o.fit === 'actual' ? 1 : Math.floor(Math.min(k, 1) * 10000) / 10000;
	return (
		'@page{size:' + size + ';margin:9mm;}' +
		'@media print{html,body{padding:0;margin:0;background:#fff;}' +
		// Flex column centers each slide horizontally (align-items) without a margin,
		// so a slide narrower than the sheet letterboxes evenly instead of hugging the
		// left edge. Vertical slack rides at the bottom (design doc: fit-to-width, top).
		'.lattice{visibility:visible!important;height:auto!important;overflow:visible!important;' +
		'display:flex!important;flex-direction:column!important;align-items:center!important;}' +
		// `margin:0!important` is load-bearing: the FIT agent (__latticeFit) sets an
		// INLINE marginBottom on every section for the on-screen inter-slide gap, and an
		// inline style beats a non-!important rule — so without this reset that gap leaks
		// into print (flex items honor margins) and can push a slide onto a blank second
		// sheet. `transform:none` likewise clears the preview's fit transform; `zoom` is
		// what actually scales the slide to the page here.
		'.lattice>section{content-visibility:visible!important;transform:none!important;margin:0!important;' +
		'zoom:' + zoom + ';box-shadow:none!important;border-radius:0!important;outline:none!important;' +
		'break-after:page;break-inside:avoid;}' +
		'.lattice>section:last-child{break-after:auto;}}'
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
	katexUrl = KATEX_URL,
	mermaidUrl = MERMAID_URL,
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
	lang = 'en', // <html lang> for the frame — real-text surfaces (vector Print PDF, the
	// preview a screen reader can walk) announce the deck's language (WCAG 3.1.1).
}) {
	// Strip script-bearing content before it reaches this same-origin srcdoc
	// frame (#616 T-CONTENT). Covers buildSrcdoc's external caller too
	// (drawing-board-export.js); the in-repo renderDeck path also pre-sanitizes
	// for its innerHTML patch, so this is a no-op there.
	html = sanitizeSlideHtml(html);
	const gw = (geom?.w) || 1280;
	const gh = (geom?.h) || 720;
	const bg = background ? background(mode) : (mode === 'dark' ? DARK_BG : LIGHT_BG);
	const scheme = colorScheme ? ':root{color-scheme:' + colorScheme + ';}' : '';
	const sectionRule =
		'.lattice>section{display:block;transform-origin:top left;' +
		(cursor ? 'cursor:pointer;' : '') +
		(contentVisibility ? 'content-visibility:auto;contain-intrinsic-size:' + gw + 'px ' + gh + 'px;' : '') +
		'box-shadow:0 8px 30px rgba(0,0,0,.22);border-radius:6px;}';
	const activeRule = activeOutline
		? '.lattice>section.db-active{outline:3px solid ' + activeOutline + ';outline-offset:4px;}'
		: '';
	const printCss = printRules ? buildPrintCss(gw, gh, printOpts) : '';
	const GEOM_GLOBALS = 'window.__SLIDE_W=' + gw + ';window.__SLIDE_H=' + gh + ';';
	// srcdoc (a fresh browsing context per write), NOT doc.open()/write()/close():
	// the latter keeps the iframe window, so lattice-runtime.js's one-shot Mermaid
	// bootstrap guard survives and every later render short-circuits the runtime —
	// Mermaid/charts added after the first edit never render. A fresh srcdoc resets
	// the guard. See engineering/gotchas.md "Playground: Mermaid stops rendering".
	// Inject the heavy third-party assets ONLY when the deck needs them: the KaTeX
	// stylesheet solely styles `.katex` spans, and the Mermaid runtime renders only
	// `code.language-mermaid` fences (charts use a separate DOM path). A plain text
	// deck — the common case — then pulls NEITHER, so a preview never waits on a CDN
	// (or the vendored copy) it won't use. renderDeck folds the same two flags into
	// its signature, so an edit that ADDS math/mermaid forces a full rewrite that
	// injects the asset rather than a section-only patch that would leave it out.
	const needsKatex = html.indexOf('katex') !== -1;
	const needsMermaid = html.indexOf('language-mermaid') !== -1;
	return (
		'<!doctype html><html lang="' + (String(lang || 'en').replace(/[^A-Za-z0-9-]/g, '') || 'en') + '"><head><meta charset="utf-8">' +
		(needsKatex ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		(fontCss ? '<style>' + fontCss + '</style>' : '') +
		'<style>html,body{margin:0;padding:' + padding + 'px;background:' + bg + ';}' +
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
		css +
		// printCss LAST so its `@page` wins. CSS merges same-named `@page` rules with
		// the LATER declaration winning per-descriptor, and the engine `css` carries its
		// own `@page{size:<slide-px>;margin:0}` (one-slide-per-page for the colour PDF).
		// Emitted before `css`, our `@page{size:<paper>;margin:9mm}` would be overridden
		// and every print came out on the raw slide sheet, edge-to-edge — defeating the
		// paper pick + safe margin. After `css`, the print sheet + margin win. (The
		// `@media print` block is already `!important`, so order never mattered for it.)
		printCss +
		'</style></head><body>' +
		a11yDefs +
		html +
		(needsMermaid ? '<scr' + 'ipt src="' + mermaidUrl + '"></scr' + 'ipt>' : '') +
		'<scr' + 'ipt src="' + runtimeUrl + '"></scr' + 'ipt>' +
		'<scr' + 'ipt>' + GEOM_GLOBALS + '</scr' + 'ipt>' +
		'<scr' + 'ipt>' + fitAgent(gap, clamp) + '</scr' + 'ipt>' +
		'<scr' + 'ipt>' + linkGuardAgent() + '</scr' + 'ipt>' +
		(sync ? '<scr' + 'ipt>' + syncAgent(gap) + '</scr' + 'ipt>' : '') +
		'</body></html>'
	);
}

// Patch only the <section> nodes whose HTML changed. Returns true on success
// (a live .lattice was found), false to signal the caller to fall back to a full
// write. `prev`/`next` are arrays of per-slide HTML strings (splitSections).
export function patchSections(frame, next, prev) {
	const doc = frame.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!lattice) return false;
	const cur = lattice.querySelectorAll(':scope>section');
	if (next.length !== cur.length) {
		// Slide added/removed: rebuild the filmstrip body only — no script re-eval;
		// the runtime/Mermaid/FIT/SYNC agents persist and re-process.
		lattice.innerHTML = next.join('\n');
	} else {
		const p = prev || [];
		for (let i = 0; i < next.length; i++) {
			if (p[i] === next[i]) continue;
			const holder = doc.createElement('div');
			holder.innerHTML = next[i];
			const fresh = holder.firstElementChild;
			if (fresh && cur[i]) lattice.replaceChild(fresh, cur[i]);
		}
	}
	const w = frame.contentWindow;
	if (w?.__latticeTag) w.__latticeTag();
	if (w?.__latticeFit) w.__latticeFit();
	return true;
}

// Render a deck into a persistent iframe: patch when the live document already
// matches this render's signature, else a full srcdoc write. `state` is opaque
// host-held bookkeeping ({ frameSig, lastSections }) — pass it back each call.
// `sig` must capture everything baked into the document outside the <section>s
// (theme/mode/size, and for the studios the live token/component CSS). `fresh`
// forces a full write (deck swap → reset runtime/Mermaid state).
export function renderDeck({ frame, html, css, mode, geom, sig, state, fresh = false, ...opts }) {
	const st = state || { frameSig: '', lastSections: null };
	// Sanitize ONCE here so BOTH paths below see safe HTML: the innerHTML section
	// patch (patchSections) and the full srcdoc write (buildSrcdoc, which
	// re-sanitizes harmlessly). #616 T-CONTENT.
	html = sanitizeSlideHtml(html);
	const sections = splitSections(html);
	// Fold the asset-need flags into the signature: buildSrcdoc injects the KaTeX
	// stylesheet / Mermaid runtime only when the deck has math / a mermaid fence, so
	// a transition (a deck GAINS or LOSES either) must force a full srcdoc rewrite —
	// a section-only patch would leave the newly-needed asset uninjected.
	const contentSig = sig + (html.indexOf('katex') !== -1 ? 'K' : '') + (html.indexOf('language-mermaid') !== -1 ? 'M' : '');
	const canPatch =
		!fresh &&
		contentSig === st.frameSig &&
		frame.contentDocument?.querySelector('.lattice');
	let patched = false;
	if (canPatch) patched = patchSections(frame, sections, st.lastSections);
	if (!patched) {
		frame.srcdoc = buildSrcdoc({ html, css, mode, geom, ...opts });
		st.frameSig = contentSig;
	}
	st.lastSections = sections;
	return { state: st, count: sections.length, patched };
}

export default { renderDeck, buildSrcdoc, patchSections, splitSections, KATEX_URL, MERMAID_URL };
