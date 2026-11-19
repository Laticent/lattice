// lib/core/frame-agents.mjs — the scripts every preview frame runs, as ONE same-origin file.
//
// WHY A FILE. A preview is a same-origin `srcdoc` frame (or, for the Studio's Stage window, an
// `about:blank` popup written by the opener), and both inherit the page's Content-Security-Policy.
// The site's policy allows a script only from our origin or by the hash of its exact text
// (docs/scripts/csp.mjs). These agents used to be written INLINE into each frame, some with
// per-deck values in the text (`window.__SLIDE_W=1280…`), so no build-time hash could cover them,
// and under the policy the Playground preview rendered blank (#3277). So the agents now live in
// one file, `lattice-frame-agents.js`, staged beside `lattice-runtime.js` in the versioned asset
// directory (docs/scripts/sync-playground-assets.mjs). A frame names an agent with
// `<script src="…/lattice-frame-agents.js" data-agent="fit" data-gap="16">`: the file runs once
// per tag, reads its own tag's data attributes (CSP does not govern attributes), and runs the one
// agent that tag names. Classic `src` scripts in a parsed document still run in document order,
// so every ordering rule the builders document (the font gate in <head>, dagre before the
// runtime, the fit after it) holds exactly as it did inline. Measured 2026-11-17 in Chromium,
// Gecko and WebKit: a same-origin `src` script runs in a srcdoc frame under the inherited policy,
// sandboxed or not; an inline one does not (engineering/decisions/2026-11-17-site-discovery.md).
//
// PURE AND FS-FREE: the docs build imports it in Node to write the file, and the three builders
// (deck-preview.js, single-slide-render.ts, studio/present/stage-window.js) import it to write the
// tags. The agent bodies are the same strings they always were; a per-deck value that used to be
// spliced into the text is now an expression over `D`, the tag's dataset.

import { createWheelGate, createZoomGesture, fitScale, keyAction, PRESENT_KEYMAP, padInset, stepEnter, swipeAction } from './present-transport.mjs';
import { fontGateAgent, onFontsReady } from './preview-font-gate.mjs';
import { applyStepAt, stepsOfSection } from './step-state.mjs';

/** The agents file's name, beside `lattice-runtime.js` in the versioned asset directory. */
export const FRAME_AGENTS_FILE = 'lattice-frame-agents.js';

/**
 * The agents file's URL for a frame that loads the runtime from `runtimeUrl`: the same directory,
 * the way the runtime's plugin host finds its libraries (lib/plugins/host-browser.mjs). A query or
 * fragment on the runtime URL is dropped, since it names the runtime's bytes and not these.
 * @param {string} runtimeUrl
 * @returns {string}
 */
export function frameAgentsUrl(runtimeUrl) {
	const path = String(runtimeUrl || '').split(/[?#]/)[0];
	return path.slice(0, path.lastIndexOf('/') + 1) + FRAME_AGENTS_FILE;
}

const ATTR_ESC = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };
const escAttr = (v) => String(v).replace(/[&"<>]/g, (c) => ATTR_ESC[c]);
const AGENT_NAME = /^[a-z][a-z-]*$/;
const DATA_KEY = /^[a-z][a-z0-9]*$/;

/**
 * One agent's tag. `data` becomes `data-<key>` attributes the agent reads at run time; a value of
 * `false`, `null` or `undefined` is left out, and `true` is written as "1".
 * @param {string} url the agents file (`frameAgentsUrl`)
 * @param {string} agent one of AGENT_NAMES
 * @param {Record<string, string | number | boolean | null | undefined>} [data]
 * @param {string} [attrs] extra attribute text for the tag, such as ` nonce="…"`
 * @returns {string}
 */
export function agentTag(url, agent, data = {}, attrs = '') {
	if (!AGENT_NAMES.includes(agent) || !AGENT_NAME.test(agent)) throw new TypeError(`agentTag: unknown agent ${JSON.stringify(agent)}`);
	// A tag naming a FILE, written into a document; never an inline body. (The preview builders' split-string
	// spelling of the tag marks where a document is assembled around slide HTML, which this is not.)
	let tag = '<script' + attrs + ' src="' + escAttr(url) + '" data-agent="' + agent + '"';
	for (const [k, v] of Object.entries(data)) {
		if (!DATA_KEY.test(k)) throw new TypeError(`agentTag: data key ${JSON.stringify(k)} is not a plain lower-case word`);
		if (v === false || v === null || v === undefined) continue;
		tag += ' data-' + k + '="' + escAttr(v === true ? '1' : v) + '"';
	}
	return tag + '></script>';
}

// FIT agent (run from this file by its `data-agent="fit"` tag). Scales each section to the
// container width, collapses the gap the un-scaled layout box would leave,
// clamps + clips the filmstrip tail, then reveals .lattice. `gap` is the visible
// px between slides (must match the SYNC agent's slot pitch); `clamp` removes the
// dead trailing scroll space the final section's full-height box leaves.
export function fitAgent(gap, clamp) {
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
		'    if((' + clamp + ')&&secs.length){var H=(secs.length*SH*sc+(secs.length-1)*GAP)+"px";if(lattice.__lfH!==H){lattice.style.height=H;lattice.style.overflow="clip";lattice.style.overflowClipMargin="40px";lattice.__lfH=H;}}',
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
export function syncAgent(gap) {
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
// Every preview builder (deck-preview.js, present/stage-window.js, single-slide-render.ts) names
// it with a `data-agent="link"` tag — it fixes the external-link-tap-blanks-the-frame bug on ALL of
// them, and carries the video-playback bridge to each. Exported for the unit tests.
export function linkGuardAgent() {
	return [
		'(function(){',
		'  function tileOpen(tile,viaKey){',
		'    if(typeof window.__collageOpen!=="function")return false;',
		'    try{return !!window.__collageOpen(tile,viaKey);}catch(_c){return false;}',
		'  }',
		'  document.addEventListener("click",function(e){',
		'    var t=e.target,tile=t&&t.closest?t.closest(".collage-tile"):null;',
		'    if(tile&&tileOpen(tile)){e.preventDefault();return;}',
		'    var a=t&&t.closest?t.closest("a[href]"):null;',
		'    if(!a)return;',
		'    var href=a.getAttribute("href")||"";',
		'    if(!/^https?:/i.test(href))return;',
		'    if(a.classList.contains("video-poster")&&a.closest("figure.video-embed[data-lattice-media=video]")&&!a.closest("[data-lattice-plugin]")&&typeof window.__videoPlay==="function"){',
		'      try{if(window.__videoPlay(a)){e.preventDefault();return;}}catch(_p){}',
		'    }',
		'    e.preventDefault();',
		'    try{(window.top||window).open(href,"_blank","noopener,noreferrer");}catch(_e){}',
		'  },true);',
		'  document.addEventListener("keydown",function(e){',
		'    if(e.key!=="Enter"&&e.key!==" ")return;',
		'    var el=e.target,tile=el&&el.closest?el.closest(".collage-tile"):null;if(!tile)return;',
		'    try{if(!el.matches(":focus-visible"))return;}catch(_f){}',
		'    if(tileOpen(tile,true)){e.preventDefault();e.stopPropagation();}',
		'  },true);',
		'})();',
	].join('\n');
}

export function stageFitAgent(kernel, { padF, padFl, sw, sh, token }) {
	// ISOLATION + the CROP FIX. The old fit scaled each <section> and display:none'd the
	// rest — but the engine runtime OWNS the sections (its body observer re-applies its
	// own transforms on them), so it wiped our per-section scale and the slide rendered at
	// full 1280px = cropped in the frame. Fix: never touch the engine's elements. Wrap the
	// deck in OUR OWN `#latt-film` and drive a FILMSTRIP — all sections stay put at natural
	// size, and we scale+translate the film so exactly the current slide fills `#latt-fit`
	// (which clips). #latt-stage/#latt-fit/#latt-film are ID selectors (1,0,0) the engine's
	// element/:where/class rules can't clobber; #latt-stage wraps from OUTSIDE so the
	// slide's own transforms can't trap our fixed positioning. #latt-stage fills 100dvh
	// (tracks the iOS toolbars → visual center) and flex-centers #latt-fit. The translate
	// uses the section's measured `offsetTop`, so any inter-section gap is handled exactly.
	//
	// THE BOX THE SLIDE FITS INTO IS #latt-view, NOT #latt-stage. They are the same
	// rectangle in an iframe — the chrome row below is absent, so `#latt-view` is the
	// whole stage — but on the projected window the caption band and the rail take real
	// height, and fitting against the outer box would let the slide sit UNDER them. The
	// ResizeObserver watches this same element, so a caption blooming in re-fits the
	// slide instead of covering it.
	return (
		'(function(){' +
		kernel + ';' +
		'var stage=document.getElementById("latt-view")||document.getElementById("latt-stage"),fitEl=document.getElementById("latt-fit"),film=document.getElementById("latt-film");' +
		'function secs(){var m=document.querySelector(".lattice");return m?m.querySelectorAll(":scope>section"):[]}' +
		'var cur=0;' +
		'function fit(){var s=secs();if(!s.length||!stage||!fitEl||!film)return;' +
		'var W=stage.clientWidth||window.innerWidth,H=stage.clientHeight||window.innerHeight;' +
		'var inset=padInset(W,H,{factor:' + padF + ',floor:' + padFl + '});' +
		'var sc=fitScale({stageW:W,stageH:H,slideW:' + sw + ',slideH:' + sh + ',insetX:inset,insetY:inset});if(!(sc>0))sc=1;' +
		'fitEl.style.width=(sc*' + sw + ')+"px";fitEl.style.height=(sc*' + sh + ')+"px";' +
		'var i=cur<0?0:(cur>s.length-1?s.length-1:cur);' +
		'var top=s[i].offsetTop||i*' + sh + ';' +
		// Hide the non-current sections (visibility, so layout/offsetTop is preserved): only the
		// current slide paints/composites — bounds the cost on a big deck (each stage iframe would
		// otherwise paint the WHOLE deck) and stops an adjacent slide bleeding through the rehearsal
		// stage's rounded-corner cards. The engine writes no section styles, so this never fights it.
		'for(var k=0;k<s.length;k++){s[k].style.visibility=k===i?"":"hidden"}' +
		'film.style.transform="scale("+sc+") translateY("+(-top)+"px)";}' +
		// `st` is the shown slide's step (null at rest); every other slide rests.
		// `st` is the shown slide's step (null at rest), or the direction it was entered by ('next' / 'prev'), which
		// resolves here against the slide's own walk; every other slide rests.
		'function show(n,st){cur=n|0;var s=secs();for(var k=0;k<s.length;k++){var at=null;if(k===cur&&st!=null){if(st==="next"||st==="prev"||st==="jump"){var w=stepsOfSection(s[k]);at=w?stepEnter(w.kind,w.count,st):null}else at=typeof st==="number"?st:null}applyStepAt(s[k],at)}fit()}' +
		'window.addEventListener("message",function(e){if(e.data&&e.data.pv!=null)show(e.data.pv,e.data.st==null?null:e.data.st)});' +
		'window.addEventListener("resize",fit);window.addEventListener("orientationchange",fit);' +
		'if(window.visualViewport){try{window.visualViewport.addEventListener("resize",fit)}catch(e){}}' +
		// Re-fit when the stage resizes, and when the film's subtree repaints (the engine may
		// re-render the deck AFTER this agent runs). childList-only, so our own style writes
		// never re-trigger it; the timers are the backstop if neither fires.
		'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(fit).observe(stage)}catch(e){}}' +
		'if(typeof MutationObserver!=="undefined"){try{new MutationObserver(fit).observe(film,{childList:true,subtree:true})}catch(e){}}' +
		'[60,300,1200,2500].forEach(function(t){setTimeout(fit,t)});show(0);' +
		// ── THE OPENER HANDSHAKE, and why it is gated rather than optional ──────────
		// `window.opener` is null in an iframe (opener is a property of a TOP-LEVEL
		// browsing context), so every line below is inert in the srcdoc hosts and this
		// stays ONE document rather than two that drift. In the projected window it is
		// what lets the console stop guessing: `ready` says the fit is live and the
		// `{pv}` port is listening (the runtime script above is parser-blocking and
		// multi-megabyte, so an index posted at open time would land on nothing), and
		// `closed` is how a presenter closing the window by hand reaches the console —
		// polling `win.closed` would report it up to a poll late, mid-sentence.
		'if(window.opener){var OP=window.opener;var OR=location.origin;var TOK=' + token + ';' +
		// TARGETED, and carrying the token. The opener identifies its Stage by `e.source`
		// where it can — but a beat fired by a NAVIGATION arrives with a different source
		// (measured), so it would drop the one message it most needs. The token is how the
		// console recognizes its own document's goodbye.
		'function tell(k){try{OP.postMessage({stage:k,tok:TOK},OR)}catch(e){}}' +
		// BOTH, because neither alone is enough: `unload` is on Chrome's deprecation path
		// and does not fire for a discarded tab, and `pagehide` is the modern beat. They
		// are idempotent at the other end — teardown clears the handle before onLost.
		'window.addEventListener("pagehide",function(){tell("closed")});' +
		'window.addEventListener("unload",function(){tell("closed")});' +
		// THE ROOM DOES NOT FOLLOW LINKS. A deck's own link survives sanitizing, and a click
		// on the projected copy navigated this window away — which stranded the console (it
		// went on posting the live slide index at a page it no longer owned) and handed a
		// foreign origin `window.opener` on the origin that holds the user's API key. On the
		// audience surface a link click is always accidental, so it is simply not a gesture.
		//
		// `a,area[href]` — NOT `a[href]`, which is the narrower selector this shipped with and
		// which misses two of the three shapes that actually navigate. Measured, all three
		// surviving `sanitizeSlideHtml`: an SVG `<a xlink:href>` holds no `href` ATTRIBUTE, so
		// `closest('a[href]')` is false for it while `closest('a')` is true — and a real click
		// on one navigated the window; and an `<area href>` inside a `<map>` is not an `<a>` at
		// all, so only naming `area` catches it. (A `<meta http-equiv=refresh>` survives the
		// sanitizer too but is inert in a `document.write`n `about:blank` document — measured —
		// so every live vector is click-gated, which is what makes this one listener enough.)
		'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a,area[href]");if(a)e.preventDefault()},true);' +
		// ── THE STAGE DRIVES ───────────────────────────────────────────────────────
		// Keyboard, wheel and swipe move the deck, and the console follows. `nav()` does
		// not move this window directly: it TELLS the opener, which owns `idx`, and the
		// `{pv}` that comes back is what repaints. One writer, so the two surfaces cannot
		// disagree about which slide is up — and a move made here survives the console
		// re-deriving state for its own reasons.
		'function nav(a){if(a)try{OP.postMessage({stage:"nav",act:a,tok:TOK},OR)}catch(e){}}' +
		// `keyAction` with the map passed EXPLICITLY — its default argument is a
		// module-scope constant that does not survive `.toString()` inlining.
		'window.addEventListener("keydown",function(e){' +
		'if(e.metaKey||e.ctrlKey||e.altKey)return;' +
		// THE BAR'S OWN BUTTONS KEEP THEIR NATIVE KEYS. `PRESENT_KEYMAP` maps `' '` to `next`,
		// and this listener is on `window` with no reading of `e.target` — so a keyboard user
		// who tabbed to "Previous slide" and pressed Space got `preventDefault()` on the native
		// activation and the deck went FORWARD (measured: 3/7 -> 4/7 on a Previous button, and
		// Space on the full-screen button advanced instead of filling the screen). Space and
		// Enter belong to the focused control; every other key still drives the deck, so the
		// arrows keep working while a button holds focus.
		'if(e.target&&e.target.closest&&e.target.closest("#latt-ctl")&&(e.key===" "||e.key==="Enter"))return;' +
		'if(e.key==="f"||e.key==="F"){e.preventDefault();toggleFull();return}' +
		'var a=keyAction(e.key,PRESENT_KEYMAP);if(!a)return;e.preventDefault();nav(a);});' +
		// A firm flick, not a reflexive scroll — the same gate, threshold and cooldown the
		// console applies, so a trackpad means the same thing on either surface.
		//
		// `ctrlKey||metaKey` STANDS DOWN, and it is not optional: a trackpad PINCH reaches the
		// page as ctrl+wheel, so a gate that does not read it scrubs the deck when the user
		// meant to zoom. `present-transport.mjs` names this exact pair as the #1294 root cause,
		// and shipping it again here is what the kernel exists to stop. (Measured on this
		// document before the fix: ctrl+wheel turned the deck.) The Stage does not zoom — it is
		// the projected copy, not a Studio surface — so standing down is the whole behavior.
		'var gate=createWheelGate();' +
		'window.addEventListener("wheel",function(e){if(e.ctrlKey||e.metaKey)return;' +
		'var a=gate(e.deltaX,e.deltaY,Date.now());if(a){e.preventDefault();nav(a)}},{passive:false});' +
		// Touch, via the shared swipe geometry — AND the shared finger-count rule.
		//
		// `createZoomGesture` is inlined here purely as the PINCH DETECTOR its `up()` docblock
		// demands: "Reading it [`swipeBlocked`] is what a surface must do BEFORE calling
		// `swipeAction`." The first cut did not, and measured on this document a pinch-out AND
		// a pinch-in both turned the deck forward — the hand-rolled "first touch to last touch"
		// twin the kernel was written to retire. `max:1` keeps it a counter and nothing more:
		// the scale can never leave 1, so no zoom or pan behavior is added to the Stage, and a
		// genuine one-finger swipe returns null from `move` without ever setting `moved`, so
		// `swipeBlocked` stays false for exactly the gesture that should still turn the deck.
		'var zoom=createZoomGesture({min:1,max:1});' +
		'function pts(e){var o=[],t=e.touches||[];for(var i=0;i<t.length;i++)o.push({x:t[i].clientX,y:t[i].clientY});return o}' +
		'var t0=null;' +
		'window.addEventListener("touchstart",function(e){var p=pts(e);zoom.down(p);' +
		't0=p.length===1?{x:p[0].x,y:p[0].y}:null},{passive:true});' +
		'window.addEventListener("touchmove",function(e){zoom.move(pts(e),{w:innerWidth,h:innerHeight})},{passive:true});' +
		'window.addEventListener("touchend",function(e){var rest=(e.touches&&e.touches.length)||0;' +
		'var blocked=zoom.up(rest).swipeBlocked;var t=e.changedTouches&&e.changedTouches[0];' +
		'var from=t0;if(rest===0)t0=null;' +
		'if(blocked||!from||!t)return;' +
		'var a=swipeAction({dx:t.clientX-from.x,dy:t.clientY-from.y});if(a)nav(a);},{passive:true});' +
		// ── THE OVERLAY CONTROLS ───────────────────────────────────────────────────
		// A projected screen with permanent instruments on it is the defect this whole
		// split exists to remove, and a projected screen you cannot operate from the
		// machine it is on is the defect the first cut shipped. The video-player idiom
		// resolves both: hidden at rest, summoned by the pointer or a key, gone again
		// after a beat. The room sees the deck; whoever is standing at this machine has
		// controls within one mouse-move.
		'var bar=document.getElementById("latt-ctl"),hideT=0;' +
		'function poke(){if(!bar)return;bar.classList.add("on");clearTimeout(hideT);hideT=setTimeout(function(){bar.classList.remove("on")},2400)}' +
		'window.addEventListener("mousemove",poke);window.addEventListener("keydown",poke);window.addEventListener("touchstart",poke,{passive:true});' +
		// FULLSCREEN FROM A BUTTON, which is the reliable path: the Fullscreen API wants a
		// user gesture in THIS document, and a click here is one. Auto-fullscreen at open
		// time is a request the browser may decline (§7, still unverified on real
		// hardware); this is the answer that does not depend on it.
		'function toggleFull(){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}catch(x){}}' +
		'function on(id,fn){var el=document.getElementById(id);if(el)el.addEventListener("click",function(e){e.preventDefault();poke();fn()})}' +
		'on("latt-prev",function(){nav("prev")});on("latt-next",function(){nav("next")});on("latt-full",toggleFull);' +
		// The counter reads from the opener's `{pv}`, not from a local guess, so it cannot
		// drift from the deck. Total comes from the film itself.
		'function count(){var c=document.getElementById("latt-count");if(!c)return;var n=secs().length;c.textContent=(Math.min(cur+1,n||1))+" / "+(n||1)}' +
		'window.addEventListener("message",function(e){if(e.data&&e.data.pv!=null)count()});' +
		'document.addEventListener("fullscreenchange",function(){var b=document.getElementById("latt-full");if(b)b.setAttribute("aria-pressed",document.fullscreenElement?"true":"false")});' +
		'[80,400,1400].forEach(function(t){setTimeout(count,t)});poke();' +
		'tell("ready");}' +
		'})();'
	);
}

// GEOMETRY globals the fit and sync agents and the runtime read: the deck's `@size` box, and
// whether the builder asked for the engine's slide edge.
const GEOM_AGENT = 'window.__SLIDE_W=+D.w||1280;window.__SLIDE_H=+D.h||720;if(D.edge==="1")window.__SLIDE_EDGE=1;';

// The Stage's reveal: shown once its own faces are ready (lib/core/preview-font-gate.mjs).
const STAGE_REVEAL_AGENT =
	'function lattStageReveal(){requestAnimationFrame(function(){var st=document.getElementById("latt-stage");if(st)st.style.visibility="visible"})}' +
	onFontsReady('lattStageReveal');

/**
 * THE SAME INPUT KERNEL THE CONSOLE RUNS, inlined by source (HARD RULE #1): the fit factor
 * (`fitScale`/`padInset`, lib/core/present-transport.mjs), the gesture readers, and the step painter
 * (lib/core/step-state.mjs), so the docs stage, the rehearsal stage and the export player scale and
 * step by identical maths, and the Stage reads keyboard, wheel and swipe exactly as the console does
 * (a second hand-rolled reader is how two surfaces drift). See P3 of 2026-07-07-html-lattice-player.md.
 *
 * Each is ASSIGNED to a var named exactly as the agent's call sites use it: a bundler renames an
 * imported function, and `.toString()` then carries the renamed or anonymous form, which once left
 * `padInset` undefined at the call site and never scaled the slide (the presenter CROP).
 * `test/unit/export/inlinable-kernels.test.js` keeps every one self-contained enough to survive the
 * trip (no module-scope closure). `keyAction` defaults its map argument to a module-scope constant,
 * which does NOT travel, so the map is inlined beside it and passed explicitly.
 *
 * The build serializes these in Node (docs/scripts/sync-playground-assets.mjs writes the file), so
 * the source that travels is the module's own text rather than a minified copy.
 */
export function stageKernel() {
	return [
		`var fitScale=${fitScale.toString()}`,
		`var padInset=${padInset.toString()}`,
		`var keyAction=${keyAction.toString()}`,
		`var swipeAction=${swipeAction.toString()}`,
		`var createWheelGate=${createWheelGate.toString()}`,
		`var createZoomGesture=${createZoomGesture.toString()}`,
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)}`,
		// The step painter, so the Stage shows the console's step of a `_build` / `_focusSteps`
		// slide, painted exactly as the console and the exported player paint it.
		`var applyStepAt=${applyStepAt.toString()}`,
		`var stepsOfSection=${stepsOfSection.toString()}`,
		`var stepEnter=${stepEnter.toString()}`,
	].join(';\n');
}

/**
 * Every agent, by the name a tag gives in `data-agent`, as the body of a function of `D` (the tag's
 * dataset). Per-deck values are read from `D` at run time, never spliced into the text, so the file
 * is the same bytes for every deck.
 */
function agentBodies() {
	return {
		// In <head>, before every revealer (its placement rule is in preview-font-gate.mjs).
		fontgate: fontGateAgent(),
		geom: GEOM_AGENT,
		// `data-gap` is the visible px between slides; `data-clamp="1"` clips the filmstrip tail.
		fit: 'var G=+D.gap||0,C=D.clamp==="1";\n' + fitAgent('G', 'C'),
		link: linkGuardAgent(),
		sync: 'var G=+D.gap||0;\n' + syncAgent('G'),
		'stage-reveal': STAGE_REVEAL_AGENT,
		// `data-sw`/`data-sh` the slide box, `data-padf`/`data-padfl` the inset, `data-tok` the opener's token.
		'stage-fit':
			// The opener's token leaves the DOM once read: deck CSS shares this document and an attribute,
			// unlike script text, is something a selector can match (found by review). It is in the DOM from
			// the moment the parser reads this tag until the agents file has loaded and run, and a render can
			// fall in that window. Accepted: the deck is the Studio user's own, and the frame's own policy
			// (previewCspMeta) limits where a selector-driven request can go.
			'var __pf=+D.padf||0,__pl=+D.padfl||0,__sw=+D.sw||1280,__sh=+D.sh||720,__tk=String(D.tok||"");' +
			'try{var __me=document.currentScript;if(__me)__me.removeAttribute("data-tok");}catch(e){}\n' +
			stageFitAgent(stageKernel(), { padF: '__pf', padFl: '__pl', sw: '__sw', sh: '__sh', token: '__tk' }),
	};
}

/** The names a tag may give in `data-agent`. */
export const AGENT_NAMES = Object.freeze(['fontgate', 'geom', 'fit', 'link', 'sync', 'stage-reveal', 'stage-fit']);

/**
 * The text of `lattice-frame-agents.js`. `document.currentScript` is the tag being run (a classic,
 * parser-inserted script), so each run reads its own tag's data; an unknown name runs nothing.
 * @returns {string}
 */
export function frameAgentsSource() {
	const bodies = agentBodies();
	const names = Object.keys(bodies);
	if (names.join() !== AGENT_NAMES.join()) throw new Error('frame-agents: AGENT_NAMES and the agent bodies disagree');
	return (
		'/* Lattice preview-frame agents (lib/core/frame-agents.mjs). Generated; do not edit. */\n' +
		'(function(){var me=document.currentScript,D=(me&&me.dataset)||{};var A={\n' +
		names.map((n) => JSON.stringify(n) + ':function(D){\n' + bodies[n] + '\n}').join(',\n') +
		'\n};var f=Object.prototype.hasOwnProperty.call(A,D.agent)?A[D.agent]:null;if(f)f(D);})();\n'
	);
}

const UNESC = { '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };

/**
 * FOR TESTS AND TOOLS: `html` with each agent tag replaced by an inline script holding exactly what
 * that tag runs, its data bound (`(function(D){…})({…})`). A test that reads or runs an agent out of a
 * built document keeps working against the real agent; a frame never gets this form.
 * @param {string} html
 * @returns {string}
 */
export function inlineAgents(html) {
	const bodies = agentBodies();
	const src = String(html);
	// Found by `data-agent`, the one attribute only agent tags carry, and read by position rather than
	// by one big pattern: `agentTag` writes `<script{attrs} {address} data-agent="…"{data}></script>`.
	const MARK = ' data-agent="';
	const CLOSE = '></script>';
	let out = '';
	let from = 0;
	for (let at = src.indexOf(MARK); at !== -1; at = src.indexOf(MARK, at + 1)) {
		const open = src.lastIndexOf('<script', at);
		const end = src.indexOf(CLOSE, at);
		if (open < from || end === -1) continue;
		const head = src.slice(open + 7, at); // the attributes, the address last
		const nameEnd = src.indexOf('"', at + MARK.length);
		const agent = src.slice(at + MARK.length, nameEnd);
		if (!Object.hasOwn(bodies, agent)) continue;
		const D = { agent };
		for (const [, k, v] of src.slice(nameEnd + 1, end).matchAll(/ data-([a-z0-9]+)="([^"]*)"/g)) D[k] = v.replace(/&(?:amp|quot|lt|gt);/g, (e) => UNESC[e]);
		const attrs = head.slice(0, head.lastIndexOf(' '));
		out += src.slice(from, open) + '<script' + attrs + '>(function(D){\n' + bodies[agent] + '\n})(' + JSON.stringify(D) + ');</script>';
		from = end + CLOSE.length;
		at = end;
	}
	return out + src.slice(from);
}
