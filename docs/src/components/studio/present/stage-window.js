// Stage-window kernel — the AUDIENCE surface, shared (HARD RULE #1).
//
// The Stage is the window the ROOM looks at: the deck, fit to the display, with
// no presenter instruments on it at all. The presenter's own surface is the
// Present overlay on the laptop (the console), which keeps the transport, the
// lens, the slide grid, the notes and the next slide. Why the split exists, and
// why a rename could not have fixed what it fixes:
// engineering/decisions/2026-08-24-stage-console-split.md.
//
// Two pure-ish pieces:
//   • buildStageDoc(opts)   → the single-slide STAGE document (all sections, one
//     shown, uniformly scaled, driven by `postMessage({pv:n})`). ONE document,
//     two hosts: as an iframe `srcdoc` it is the console's own slide card and the
//     rehearsal stage, and with `standalone: true` it is the whole projected
//     window — so what the room sees is pixel-identical to what the presenter is
//     driving.
//   • createStageController(hooks) → the OPENER-side manager: open/close the
//     window (from a user gesture, popup-blocker-safe), the ready handshake,
//     the `{pv}` navigation relay, and Window-Management auto-placement on the
//     external screen.
//
// State rides the held window handle over `postMessage` (not localStorage /
// BroadcastChannel — those are partitioned under file://, and one code path is
// what the self-contained `.html` export player can inherit; see
// 2026-06-16-lattice-export-format.md §2c/§2d).
//
// The Stage is SAME-ORIGIN with its opener (`window.open('')` then a document
// write), which is load-bearing rather than incidental: the console renders the
// audience chrome — the caption crawl and the progress rail — straight into this
// document with a React portal, and aims the Guide cursor at elements inside it.
// A cross-origin stage would have forced all three to be re-implemented in
// inline strings, which is the cost that ruled out architecture S.

import {
	createWheelGate,
	createZoomGesture,
	fitScale,
	keyAction,
	PRESENT_KEYMAP,
	padInset,
	swipeAction,
} from '../../../../../lib/core/present-transport.mjs';
import { sanitizeStyleText } from '../../../../../lib/core/sanitize-style-text.mjs';
import { sanitizeSlideHtml } from '../../../lib/sanitize-slide-html.js';
import { slideBox } from '../../../playground/frame-css.js';
import { previewCspMeta } from '../../../playground/preview-csp.js';
import { STAGE_CHROME_CSS } from './stage-chrome.js';

/**
 * The single-slide stage document — one `<section>` of `html` shown at a time,
 * centered and uniformly scaled to fit, the slide box pinned through frame-css so
 * container-query layouts resolve against the real `@size` (preview parity).
 * `show(n)` is driven from the parent via `postMessage({pv:n})`. A no-zoom
 * viewport + touch-action kill the iOS double-tap jolt.
 *
 * `standalone` promotes the same document from an iframe payload to a WINDOW the
 * room looks at. It adds exactly three things and no chrome:
 *   • the two empty hosts the console portals the audience chrome into
 *     (`#latt-cc`, `#latt-rail`) plus their shared stylesheet;
 *   • the opener handshake — `{stage:'ready'}` once the fit is live, and
 *     `{stage:'closed'}` on unload, so the console stops driving a window that is
 *     gone the instant it goes — rather than up to one 2s liveness poll later,
 *     mid-sentence. (Whether that also gets SAID out loud is a separate question,
 *     answered by `onLost` below: a window the presenter closed by hand is not
 *     announced back to them.);
 *   • `f` for fullscreen, because auto-fullscreening a popup from the opener's
 *     gesture is not something a browser is obliged to allow (§7 of the decision
 *     note); when it is declined, this key is the whole fallback.
 * All three are gated on `window.opener`, which is null in an iframe — so they are INERT
 * in the srcdoc hosts. Not "byte-identical", which is what this said and was not true:
 * `#latt-view` is a new wrapper and `#latt-stage` gained `flex-direction: column`, both
 * unconditionally. Behaviorally equivalent (the chrome row is absent, so the view box IS
 * the stage box), but the cell named for this claim only asserts the ABSENCE of three
 * strings and could never have seen the difference — so the comment is the only place the
 * distinction can live, and it may as well be accurate.
 */
export function buildStageDoc({ html, width, height, bg, css, runtimeUrl, katexUrl = '', mermaidUrl = '', a11yDefs = '', pad = { factor: 0.012, floor: 0 }, standalone = false, chromeDecls = '', token = '' }) {
	html = sanitizeSlideHtml(html); // #616 T-CONTENT — strip script before the same-origin stage srcdoc
	const sw = width;
	const sh = height;
	// The fit factor is the shared transport kernel's `fitScale`/`padInset`
	// (lib/core/present-transport.mjs) — inlined VERBATIM into the stage script (which
	// runs in an isolated iframe and can't import), so the docs stage, the rehearsal
	// stage, and the export player all scale by the identical maths. `pad` selects the
	// symmetric inset: the Stage uses ×0.012 (floor 0), rehearsal ×0.04
	// (floor 14). See P3 of 2026-07-07-html-lattice-player.md.
	// ASSIGN to vars named EXACTLY as the call sites below use them: the production bundler
	// RENAMES the imported `fitScale`/`padInset`, and their `.toString()` carries the renamed
	// (or anonymous/arrow) form — so inlining the bare source left `fitScale`/`padInset`
	// undefined at the call sites and `fit()` threw "padInset is not defined" on every call,
	// silently never scaling the slide (the long-standing presenter CROP). The `var name =`
	// binding restores the names regardless of how the function prints.
	// THE SAME INPUT KERNEL THE CONSOLE RUNS, inlined by source (HARD RULE #1).
	//
	// The Stage drives the deck — keyboard, wheel and swipe — and the console follows. That
	// is a reversal: the first cut of this window bound exactly one key (`f`) on the theory
	// that "the room does not drive the deck". It was wrong for the case that actually
	// happens, which is the presenter standing AT the machine the Stage is on.
	//
	// Driving it means reading a gesture, and there are two ways to do that: inline the
	// kernel the console already uses, or hand-roll a second one inside this string. The
	// second is how two surfaces drift — `present-transport.mjs`'s header exists because of
	// it. So the kernel travels by `.toString()`, exactly as `fitScale` already does, and
	// `test/unit/export/inlinable-kernels.test.js` is what keeps every one of these
	// self-contained enough to survive the trip (no module-scope closure).
	//
	// `keyAction` defaults its map argument to a module-scope constant, which does NOT
	// travel — so the map is inlined beside it and passed explicitly, which is the contract
	// that test pins.
	const kernel = [
		`var fitScale=${fitScale.toString()}`,
		`var padInset=${padInset.toString()}`,
		`var keyAction=${keyAction.toString()}`,
		`var swipeAction=${swipeAction.toString()}`,
		`var createWheelGate=${createWheelGate.toString()}`,
		`var createZoomGesture=${createZoomGesture.toString()}`,
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)}`,
	].join(';\n');
	const padF = Number(pad.factor);
	const padFl = Number(pad.floor || 0);
	// Resolve the runtime URL to ABSOLUTE, and it is load-bearing on BOTH hosts. The
	// Stage window is `window.open('')` + a document write, so its base URL is
	// `about:blank` — a root-relative `/…/runtime.js` then fails to resolve and the
	// parser-blocking script stalls the inline reveal/fit scripts after it (slides
	// render but stay hidden & unscaled). It was the retired presenter popup's iframes
	// that first hit this, for the same reason and one nesting level deeper. Absolute
	// resolves identically for the in-page stage (base = page).
	const rt = (() => {
		try {
			return new URL(runtimeUrl, location.href).href;
		} catch {
			return runtimeUrl;
		}
	})();
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
	const FIT =
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
		'function show(n){cur=n|0;fit()}' +
		'window.addEventListener("message",function(e){if(e.data&&e.data.pv!=null)show(e.data.pv)});' +
		'window.addEventListener("resize",fit);window.addEventListener("orientationchange",fit);' +
		'if(window.visualViewport){try{window.visualViewport.addEventListener("resize",fit)}catch(e){}}' +
		// Re-fit when the stage resizes, and when the film's subtree repaints (the engine may
		// re-render the deck AFTER this inline script). childList-only, so our own style writes
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
		'if(window.opener){var OP=window.opener;var OR=location.origin;var TOK=' + JSON.stringify(String(token || '')) + ';' +
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
		'})();';
	// The audience chrome's two hosts — EMPTY. Nothing in this document ever writes to
	// them; the console portals React into them across the same-origin boundary, so the
	// caption crawl and the rail have exactly one implementation and it is the one the
	// console already renders when no Stage is open.
	const chrome = standalone ? '<div id="latt-chrome" class="latt-chrome"><div id="latt-cc"></div><div id="latt-rail"></div></div>' : '';
	// THE OVERLAY CONTROLS, standalone only. Absent from the srcdoc hosts by construction —
	// an in-page stage is already surrounded by the console's own transport, and a second
	// set inside the frame would be two controls for one deck.
	//
	// `aria-hidden` is NOT set at rest: the bar is visually hidden but stays in the
	// accessibility tree and tab order, because a keyboard user has no pointer to summon it
	// with and "invisible until you move a mouse you do not have" is not an affordance.
	// Focus reveals it (`:focus-within` in the sheet) so sighted keyboard users see what
	// they are on.
	const controls = standalone
		? '<div id="latt-ctl" class="latt-ctl">' +
			'<button id="latt-prev" type="button" aria-label="Previous slide">\u2039</button>' +
			'<span id="latt-count" class="latt-ctl-count" aria-live="off">1 / 1</span>' +
			'<button id="latt-next" type="button" aria-label="Next slide">\u203a</button>' +
			'<button id="latt-full" type="button" aria-label="Full screen" aria-pressed="false" class="latt-ctl-full">\u26f6</button>' +
			'</div>'
		: '';
	return (
		'<!doctype html><html><head><meta charset="utf-8">' +
		// Remote-subresource containment, before any content (#1753). The Stage renders the
		// same untrusted deck HTML the other preview frames do, so it takes the same policy.
		previewCspMeta({ katexUrl }) +
		(standalone ? '<title>Stage</title>' : '') +
		'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
		(katexUrl ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		'<style>html,body{margin:0;padding:0;height:100%;background:' + bg + ';overflow:hidden;touch-action:manipulation;-webkit-text-size-adjust:100%;}' +
		'#latt-stage{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;visibility:hidden;}' +
		'#latt-view{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;}' +
		'#latt-fit{overflow:hidden;}' +
		'#latt-film{position:relative;transform-origin:top left;}' +
		'#latt-film .lattice{margin:0;padding:0;}' +
		// The chrome row's own typography, and it lives HERE rather than in the shared sheet
		// on purpose: `stage-chrome.js` is injected into the console too, where a font-family
		// would overwrite the site's. This document has no site font to inherit — the deck's
		// registered faces belong to the SLIDE — so the audience chrome states a stack instead
		// of silently rendering the caption crawl in the browser's serif default.
		'#latt-chrome{flex:0 0 auto;padding:0 clamp(16px,4vw,48px) 18px;' +
		// The chrome's PALETTE, baked in. It is not painted from the opener any more —
		// that ran one step after the chrome first rendered, and in that window
		// `color-mix(in srgb, var(--text-muted) …, transparent)` had no color to mix, so
		// it resolved invalid and fell back to `canvastext`: measured at 1.12:1 against
		// this letterbox. A built document should not need a second party to be legible.
		// The opener still writes these inline for a LIVE palette change (`paintStageTokens`),
		// and inline beats this rule, which is the ordering we want.
		(standalone ? chromeDecls : '') +
		"font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.4;}" +
		// BORDER-BOX, and SCOPED to the chrome row. A bare `*{box-sizing:border-box}` would
		// reach the deck as well, and the deck's own sheet is the authority on how the deck
		// measures — this row is the only thing here that is ours. Without it the row's own
		// side padding is ADDED to its stretched width and the rail is clipped off the edge
		// of the display (measured: 1376px of chrome in a 1280px window).
		'#latt-chrome,#latt-chrome *{box-sizing:border-box;}' +
		// THE OVERLAY CONTROLS. Fixed above everything, centered on the bottom edge, and
		// INVISIBLE AT REST — `opacity` + `pointer-events`, not `display`, so summoning them
		// is a fade rather than a layout jump under the pointer, and so they keep their place
		// in the tab order for a keyboard user who cannot summon them with a mouse.
		// `:focus-within` reveals them for exactly that user.
		// ANCHORED TO THE SLIDE BOX, not the window. Fixed-to-viewport put it on top of the
		// caption band and the rail — the chrome row owns the bottom of this window — and a
		// short window clipped it off the edge entirely. `#latt-view` is the slide area, so
		// absolute-inside-it floats the bar over the deck exactly the way a video player's
		// does, above the chrome and never in its way. Out of flow, so summoning it cannot
		// resize the slide underneath.
		// THE BAR NEEDS THE PALETTE TOO, and scoped the same way for the same reason.
		//
		// The audience palette is declared ON `#latt-chrome` rather than on `:root`, because
		// `--bg` / `--accent` / `--text-heading` are the DECK's token names as well — hoisting
		// them to the root would repaint the slide with the chrome's colors. The control bar
		// lives outside that element, so it inherited none of them: measured in the real
		// popup, `--bg` and `--text-heading` came back EMPTY, the bar's background resolved to
		// `rgba(0,0,0,0)` and its glyphs to `rgb(0,0,0)` — black on a near-black slide.
		//
		// That is the same trap `paintStageTokens` fell into (a palette that never reached the
		// element reading it), the second time on this branch. So the decls are repeated here
		// rather than widened: same values, second scope, deck untouched.
		(standalone ? '.latt-ctl{' + chromeDecls + '}' : '') +
		'.latt-ctl{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;' +
		'display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:999px;' +
		'background:color-mix(in srgb, var(--bg) 82%, transparent);border:1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);' +
		'backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .18s ease;}' +
		'.latt-ctl.on,.latt-ctl:focus-within{opacity:1;pointer-events:auto;}' +
		'@media (prefers-reduced-motion:reduce){.latt-ctl{transition:none;}}' +
		'.latt-ctl button{appearance:none;border:0;background:transparent;color:var(--text-heading);' +
		'font:inherit;font-size:18px;line-height:1;cursor:pointer;border-radius:999px;padding:6px 10px;min-width:36px;min-height:36px;}' +
		'.latt-ctl button:hover{background:color-mix(in srgb, var(--accent) 18%, transparent);}' +
		// A visible focus ring, because this bar is reachable by Tab and is the only way a
		// keyboard user knows the fade brought them somewhere.
		'.latt-ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}' +
		'.latt-ctl-count{color:var(--text-muted);font-size:13px;font-variant-numeric:tabular-nums;padding:0 4px;min-width:56px;text-align:center;}' +
		'.latt-ctl-full{font-size:15px;}' +
		// The two hosts are the PORTAL TARGETS, and React renders its own root inside each —
		// so a host that shrink-wraps hands its child a zero-width box to be `width:100%` of.
		// Measured: `#latt-rail` came out 12px wide and `#latt-cc` 0x0, i.e. an invisible rail
		// and no captions at all, on the surface where that is least recoverable.
		'#latt-cc,#latt-rail{width:100%;}' +
		slideBox(sw, sh) +
		// HARD RULE #22, stylesheet channel — the deck's composed sheet is caller
		// influenced (a Studio theme's label/description sit in its comment header), and
		// a `</style>` in it would end this element and turn the remainder into markup in
		// the stage window. Everything above is ours; `css` is not.
		sanitizeStyleText(css) +
		// AFTER the deck, not before. Source order breaks a specificity tie, and a deck's
		// composed sheet is thousands of rules of someone else's CSS — every one of them
		// authored without knowing this row exists. Our selectors are all `.latt-*`, which
		// no deck uses, so putting them last costs the deck nothing and removes the whole
		// class of "a theme quietly restyled the room's captions".
		(standalone ? STAGE_CHROME_CSS : '') + '</style></head><body>' +
		a11yDefs + '<div id="latt-stage"><div id="latt-view"><div id="latt-fit"><div id="latt-film">' + html + '</div></div>' + controls + '</div>' + chrome + '</div>' +
		(mermaidUrl ? '<scr' + 'ipt src="' + mermaidUrl + '"></scr' + 'ipt>' : '') +
		'<scr' + 'ipt src="' + rt + '"></scr' + 'ipt>' +
		'<scr' + 'ipt>requestAnimationFrame(function(){var st=document.getElementById("latt-stage");if(st)st.style.visibility="visible"});</scr' + 'ipt>' +
		'<scr' + 'ipt>' + FIT + '</scr' + 'ipt></body></html>'
	);
}

/**
 * Put the Stage on the EXTERNAL screen, and try to fill it.
 *
 * This is the code #1805's predecessor already had — it just pointed the wrong
 * window at it. Under the split the window that belongs on the projector is the
 * one carrying the deck, and the browser stays on the laptop with the console.
 *
 * Enhancement only: no Window Management permission, no second screen, or a
 * refusal, and the presenter drags the window themselves. Resolves to whether we
 * found an external screen to aim at — the DETECT half of §7's "detect to decide
 * whether to offer; verify the outcome to decide whether it worked". The VERIFY
 * half is `fillExternalScreen` below, and it runs later for a reason given there.
 */
async function autoPlaceStage(win) {
	let placed = false;
	try {
		if ('getScreenDetails' in window) {
			const details = await window.getScreenDetails();
			// NOT-CURRENT FIRST, then prefer a non-internal one among those.
			//
			// The order matters and the original had it inverted: `find((s) => !s.isInternal)
			// || find((s) => s !== currentScreen)` reads as "an external screen, or failing
			// that any other screen", but the second arm is UNREACHABLE whenever any screen
			// reports `isInternal: false` — and on hardware that does not flag its internal
			// panel, EVERY screen reports that. So the first arm matched `screens[0]`, which
			// is as likely to be the laptop as the projector, and the fallback written for
			// exactly that hardware never ran. Measured: two unflagged screens placed the
			// Stage at (0, 0) — on top of the console the presenter drives from.
			//
			// Excluding the current screen FIRST is the rule that actually expresses the
			// intent: the Stage belongs on a surface that is not the one showing the console.
			const others = details.screens.filter((s) => s !== details.currentScreen);
			const ext = others.find((s) => !s.isInternal) || others[0];
			if (ext) {
				win.moveTo(ext.availLeft, ext.availTop);
				// resizeTo before the fullscreen attempt, so a browser that declines still
				// leaves the room a display-filling window rather than a 1280×720 box in a
				// corner. availWidth/Height exclude the OS bars, which is what we want.
				try {
					win.resizeTo(ext.availWidth, ext.availHeight);
				} catch {
					/* some browsers refuse to resize a window they did not size */
				}
				placed = true;
			}
		}
	} catch {
		/* permission denied / unsupported */
	}
	return placed;
}

/**
 * Fill the external display — AFTER the deck document is live, and only when we
 * actually placed the window on one.
 *
 * Both halves of that sentence are measured corrections. `document.open()` destroys
 * `documentElement`, and fullscreen exits with it, so requesting it during `toggle()`
 * either targeted the HOLDING page (which the deck write then replaced, dropping the
 * room back to a window) or reported `full: true` for a document that no longer
 * existed. And requesting it unconditionally meant a single-screen laptop could have
 * the Stage cover the console — the surface the presenter drives from.
 */
async function fillExternalScreen(win) {
	try {
		await win.document.documentElement.requestFullscreen();
		return !!win.document.fullscreenElement;
	} catch {
		return false; // declined — the Stage's own `f` key is the fallback
	}
}

/** A per-open identifier for one Stage document. Not a secret and not a nonce in the
 *  crypto sense — it only has to be unlikely to collide with another window's beat, so
 *  the console can recognize its own Stage's unload message when `e.source` no longer
 *  can (see `onMsg`). */
function stageToken() {
	return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The opener-side Stage manager. Hooks:
 *   • getDoc()  → the stage document string, or '' while the engine render is
 *     still in flight (the window opens on the gesture and fills in after).
 *   • getIndex() → the slide the console is on, posted the moment the Stage says
 *     it is ready.
 *   • onChange(win) → the live Stage window, or null. The console holds this in
 *     state: it is the portal host for the audience chrome and the root the
 *     Guide's cursor is mounted into, so "the Stage went away" has to be a
 *     rendered state, not a flag.
 *   • onNav(action) → a gesture made ON the Stage — 'next' | 'prev' | 'first' |
 *     'last'. DEFAULTED, and that default is load-bearing rather than cosmetic:
 *     these parameters carry no JSDoc types, so TypeScript infers the option bag
 *     from the destructuring and every un-defaulted key becomes REQUIRED. Adding
 *     this one without a default broke twelve existing call sites at
 *     `astro check` time while `vitest` — which does not typecheck — stayed green.
 *   • onLost(reason) → the Stage stopped carrying the deck and NOBODY MEANT IT.
 *     Separate from `onChange(null)` because the two need opposite treatment:
 *     the console reverting to plain Present is the visible fact, and whether
 *     the ROOM still has the deck is the one a presenter mid-sentence needs
 *     said out loud. `reason` names an OBSERVED STATE, never a guessed cause:
 *     `'navigated'` — the window is still there and is not our deck any more (a
 *     link click, a reload, a Back, or a renderer that died and left an error
 *     page in it) — or `'gone'`, the window is not there at all and never said
 *     goodbye.
 *
 *     AN EARLIER DRAFT NAMED CAUSES — "a crash, a discarded tab, a projector
 *     that lost power" — and all three were wrong. A crashed or discarded tab
 *     keeps `closed === false`, so it arrives as `'navigated'`; and a projector
 *     losing power changes nothing observable here at all, because the window is
 *     fine and it is the DISPLAY that went. (Measured while checking this: a
 *     popup shares its opener's renderer, so a Stage renderer crash generally
 *     takes the console down with it and no code here runs.) What this file can
 *     see is whether the window is still there. That is what the names say.
 *
 *     THREE TEARDOWN PATHS, TWO OF THEM DELIBERATE, AND THE SPLIT IS THE POINT.
 *     `close()` (the pill, `S`) announces nothing — the presenter pressed it.
 *     Neither does the window the presenter closes BY HAND: they closed it, and
 *     a notice for an act you just performed is the noise that teaches a
 *     presenter to ignore the notice that matters. What is left — a navigated
 *     window and a beatless disappearance — is exactly the set where the room
 *     went dark without anyone asking, and that set is what `onLost` announces.
 *     Before this it fired for a hand-close too, so the sentence "Stage
 *     disconnected" was as likely to mean "you closed it" as "the room lost the
 *     deck".
 *   • onPlaced({ placed, full }) → the outcome of the auto-placement attempt.
 *
 * Returns { toggle, write, show, close, isOpen }. `toggle()` MUST run in a user
 * gesture (popup-blocker-safe). The manager owns its own `message` listener
 * lifecycle and trusts only its held handle (`e.source`).
 */
export function createStageController({ getDoc, getIndex, onChange, onLost, onPlaced, onNav = /** @type {((action: string) => void) | null} */ (null) }) {
	let stageWin = null;
	/** Has THIS document announced itself? Reset on every (re)write, because a
	 *  rewrite replaces the listener that answered last time. */
	let ready = false;
	/** The doc string currently written into the window — so a `write()` fired by
	 *  an unrelated re-render doesn't tear down a live Stage and re-run the
	 *  engine's boot for no change. */
	let written = '';
	/** Baked into every document this controller writes and echoed in that document's
	 *  beats. Per CONTROLLER rather than per open, because the deck document is built
	 *  asynchronously and often BEFORE the window exists — a per-open token could not be
	 *  in it. That it outlives one window is handled where it is read (`onMsg`), by
	 *  requiring the window to actually be gone before a token-matched goodbye counts. */
	const token = stageToken();
	let pollId = 0;
	/** Bumped every time this controller starts or stops owning a window. A loss
	 *  classification is in flight for up to `CLOSED_GRACE_MS` (below), and a presenter who
	 *  re-opens the Stage inside that window must not be handed a notice about the one that
	 *  just went. The sequence captured at schedule time is what makes the pending answer
	 *  stale rather than wrong. */
	let ownSeq = 0;
	/** The pending step of a loss classification, so it can be CANCELED rather than merely
	 *  ignored. `ownSeq` already stops a stale answer being announced, but the chain itself
	 *  went on scheduling — up to twelve more timers belonging to a window this controller
	 *  had already let go of. Harmless in a browser and NOT harmless anywhere the timer can
	 *  outlive its globals: it surfaced as `ReferenceError: window is not defined` fired
	 *  after a jsdom environment was torn down, which vitest reports as an unhandled error
	 *  beside a green suite — the exact "passes for a reason other than the one it names"
	 *  shape this file keeps producing. An owned handle is also simply the honest lifetime:
	 *  the chain belongs to the window that went, and teardown is per-window. */
	let lossTimer = 0;

	// The holding page, written synchronously inside the gesture. Without it the
	// room watches `about:blank` for as long as the deck takes to render, which on a
	// cold engine is seconds — and a blank white window on a projector reads as a
	// crash. Deliberately not the chrome stylesheet: it is three lines of inline CSS
	// so it cannot itself be waiting on anything.
	const HOLDING =
		'<!doctype html><html><head><meta charset="utf-8"><title>Stage</title>' +
		'<style>html,body{margin:0;height:100%;background:#15110D;color:#B6A488;' +
		"font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center}" +
		'p{font-size:.95rem;letter-spacing:.02em}</style></head><body id="latt-holding"><p>Preparing the stage…</p></body></html>';

	/**
	 * Is the Stage still OUR document?
	 *
	 * `closed` is not the question, and assuming it was is what left a navigated Stage
	 * driving a console that had no idea. A window the presenter clicked a deck link in,
	 * reloaded, or went Back in is `closed === false` and is not the Stage any more.
	 * Measured in Chromium: a same-origin navigation changes `location.href`, and a
	 * cross-origin one makes reading it THROW. Both are answered here, in one place.
	 */
	/**
	 * Can we still TOUCH the window? Open, and not cross-origin.
	 *
	 * Separate from `alive()` because a freshly opened popup is reachable and carries no
	 * marker yet — it is empty until we write one. Requiring the marker in order to write
	 * it was a deadlock: nothing was ever painted, so the Stage never opened at all.
	 */
	function reachable() {
		if (!stageWin || stageWin.closed) return false;
		try {
			return !!stageWin.document;
		} catch {
			return false;
		}
	}

	function alive() {
		if (!reachable()) return false;
		try {
			// OUR OWN MARKER, not the URL. A `window.open('')` reports `about:blank` at the
			// instant it opens and the opener's href once written into, so an href captured at
			// open never matches again — and a URL comparison would depend on the Studio's own
			// routing besides. Every document this controller writes carries `#latt-stage` (the
			// deck) or `#latt-holding` (the "Preparing the stage…" page); a page the window was
			// NAVIGATED to carries neither. Reading `.document` at all THROWS once the window is
			// cross-origin, which is the same answer by a different route.
			const d = stageWin.document;
			return !!d && !!(d.getElementById('latt-stage') || d.getElementById('latt-holding'));
		} catch {
			return false; // cross-origin: not ours any more, and we can no longer look
		}
	}

	// ── DID IT DIE, OR DID SOMEONE CLOSE IT? ────────────────────────────────────────
	//
	// `closed` is the only discriminator the platform offers, and READING IT ONCE IS THE
	// WRONG WAY TO ASK IT. Measured on real Chromium, holding the handle and sampling it from
	// the moment the `{stage:'closed'}` beat arrives (the probe itself, and the same table for
	// WebKit and Firefox, are in 2026-08-24-stage-console-split.md §13):
	//
	//   teardown path            at the beat   next task   +50ms   +200ms
	//   hand-close (the X)          false        false     true     true
	//   opener close()              true         true      true     true
	//   navigate same-origin        false        false     false    false
	//
	// So a synchronous read files EVERY hand-close as a navigation — the flag has simply
	// not flipped yet when the dying document's own unload beat reaches us. A navigated
	// window, by contrast, never flips: it is still open, showing someone else's page. That
	// asymmetry is what makes sampling sound rather than merely lucky — waiting can only
	// ever turn "not closed yet" into "closed", so the grace window costs the navigation
	// case a late notice and the close case nothing at all.
	//
	// The REVERT is not delayed by any of this; `teardown()` has already run. Only the
	// sentence waits.
	const CLOSED_GRACE_MS = 600; // 12× the 50ms the flag actually took, for a slow machine
	const CLOSED_STEP_MS = 50;
	/**
	 * Announce the loss unless the window turns out to have simply been closed.
	 * @param {Window | null} w the handle teardown just let go of
	 * @param {number} seq the ownership sequence at schedule time
	 * @param {number} waited
	 */
	function announceUnlessClosed(w, seq, waited = 0) {
		if (!w || seq !== ownSeq) return; // a new Stage came up — this answer is stale
		try {
			if (w.closed) return; // deliberate: the presenter closed the window themselves
		} catch {
			return; // we cannot even ask any more; do not invent a failure
		}
		if (waited >= CLOSED_GRACE_MS) {
			onLost?.('navigated');
			return;
		}
		lossTimer = window.setTimeout(() => {
			lossTimer = 0;
			announceUnlessClosed(w, seq, waited + CLOSED_STEP_MS);
		}, CLOSED_STEP_MS);
	}

	function paint(doc) {
		if (!reachable()) return;
		// A REWRITE MAKES THE CONSOLE LET GO FIRST. `document.open()` detaches the
		// `#latt-cc` / `#latt-rail` nodes the console is portalling into, and until the
		// new document announces itself there is no live host — so without this the
		// caption crawl and the rail render into limbo while the dock still refuses to
		// show them, and they are on NEITHER surface for the length of an engine boot.
		if (written) onChange?.(null);
		ready = false;
		try {
			stageWin.document.open();
			stageWin.document.write(doc);
			stageWin.document.close();
			// Only once the write actually lands. Assigning before the `try` latched a
			// throwing write: `written === doc` made `write(doc)` a no-op forever after,
			// so the room kept whatever was on screen and nothing could replace it.
			written = doc;
		} catch {
			written = '';
		}
	}
	/** Post the current slide index. No-op until the Stage's fit says it is listening. */
	function show(index) {
		if (!alive() || !ready) return;
		try {
			// TARGETED, never `'*'`. A wildcard kept posting the presenter's live slide
			// index at the window after it had been navigated somewhere else — handing a
			// foreign origin a running read of where in the deck the talk was. Measured:
			// a targeted post still delivers to our own written document.
			// `?? 0` not `|| 0` — slide index 0 is a legitimate value, not "missing".
			stageWin.postMessage({ pv: index ?? 0 }, location.origin);
		} catch {
			/* gone */
		}
	}
	/** (Re)write the Stage with a freshly rendered deck. Idempotent on an unchanged doc. */
	function write(doc) {
		if (!doc || !alive() || doc === written) return;
		paint(doc);
	}
	function onMsg(e) {
		if (!stageWin) return;
		// ORIGIN FIRST, because `e.source` cannot answer this. A WindowProxy identifies a
		// BROWSING CONTEXT, not a document, so it survives navigation: measured in Chromium,
		// a page that navigated our Stage away posts back with `e.source === stageWin` STILL
		// TRUE, and every `ours` check below hands it the trust we meant for our own document.
		// The origin is the half that does change — and a Stage we wrote into `about:blank`
		// INHERITS our origin (measured: `e.origin === location.origin`), so this rejects the
		// foreign page without costing the real Stage a single message.
		if (e.origin !== location.origin) return;
		const d = e.data || {};
		if (typeof d.stage !== 'string') return;
		// TWO WAYS TO BE OURS, and the second one is why a navigated Stage is noticed.
		// `e.source === stageWin` is the strong check and stays the primary. But the
		// unload beat fired by a NAVIGATION arrives with a different source — measured —
		// so the guard dropped the one message it exists to receive, and `window.close()`
		// was the only teardown path that ever reported itself. The token is baked into
		// the document we wrote and echoed in its beats; a forged one can at worst make
		// us believe our own Stage closed, because we never post anywhere but our held
		// handle.
		const ours = e.source === stageWin;
		if (!ours && d.tok !== token) return;
		if (d.stage === 'ready') {
			if (!ours) return; // a `ready` is only meaningful from the handle we hold
			ready = true;
			show(getIndex?.() ?? 0);
			onChange?.(stageWin);
		} else if (d.stage === 'nav') {
			// THE STAGE DRIVES. A gesture made on the projected window arrives here as an
			// ACTION ('next' | 'prev' | 'first' | 'last'), never as an index — the console
			// owns `idx` and stays the single writer, so the two surfaces cannot disagree
			// about which slide is up and a `{pv}` echo cannot double-advance. The Stage
			// repaints only when that `{pv}` comes back, which also makes a dropped
			// message visible as "nothing moved" rather than as two surfaces drifting.
			//
			// STRICTLY `ours`, AND STILL OUR DOCUMENT: a nav is the one message that CHANGES
			// state here, so unlike the goodbye it does not accept the token-only path. The
			// second half is not redundant with the origin check above — it is the one that
			// holds if a SAME-ORIGIN page ever takes the window over (our own routing, a Back
			// into the Studio). `alive()` is already false at that instant — measured — so the
			// information to refuse was always here; this is what consults it.
			if (!ours || !alive()) return;
			if (typeof d.act === 'string') onNav?.(d.act);
		} else if (d.stage === 'closed') {
			// A goodbye we matched only by TOKEN has to be checked against reality: the
			// token outlives a window, so an old document unloading just as a new one opens
			// would otherwise tear down the new one. `alive()` is the arbiter — and in the
			// case this exists for (a navigated Stage) it is already false, so the beat
			// still lands immediately rather than waiting for the poll.
			if (!ours && alive()) return;
			// HOLD THE HANDLE ACROSS THE TEARDOWN. `teardown()` drops it, and the handle is
			// the only thing that can answer whether this window was closed or taken over —
			// so the classification is scheduled with it, not with `stageWin`.
			const w = stageWin;
			teardown();
			announceUnlessClosed(w, ownSeq);
		}
	}
	function teardown() {
		ready = false;
		written = '';
		ownSeq += 1;
		// Cancel any classification still walking. It belongs to a window this controller has
		// already let go of, and the beat path re-schedules a fresh one immediately after this
		// returns when there is something new to classify.
		if (lossTimer) {
			window.clearTimeout(lossTimer);
			lossTimer = 0;
		}
		if (pollId) {
			window.clearInterval(pollId);
			pollId = 0;
		}
		if (stageWin) {
			window.removeEventListener('message', onMsg);
			stageWin = null;
		}
		onChange?.(null);
	}
	function close() {
		// TEARDOWN FIRST, then close. The order is the guarantee, not a tidiness preference:
		// detaching the listener before the window is even asked to go means the beat its
		// unload fires cannot reach `onMsg` at all, so the console's own close can never be
		// mistaken for a loss — and `ownSeq` has already moved, so any classification still
		// in flight from a previous window goes quiet too. The old order (close, then tear
		// down) leaned on `postMessage` being asynchronous, which is true but is a fact about
		// the platform rather than something this file controls.
		const w = stageWin;
		teardown();
		if (w && !w.closed) {
			try {
				w.close();
			} catch {
				/* gone */
			}
		}
	}
	function toggle() {
		if (isOpen()) {
			close();
			return;
		}
		// A named window that is no longer ours would be HANDED BACK by `window.open` rather
		// than reopened, and painting into it throws into a silent catch — so the presenter
		// presses S and nothing happens, FOREVER: the name keeps resolving to that same
		// context. Letting go of the handle does not help, because the name is what resolves
		// (measured: after teardown, `window.open('', 'lattice-stage')` returns the SAME
		// cross-origin window and painting still throws). CLOSING it is what frees the name,
		// and a window we opened ourselves closes even once it has gone cross-origin
		// (measured: no throw, `closed === true`).
		if (stageWin) {
			const stale = stageWin;
			teardown();
			try {
				if (!stale.closed) stale.close();
			} catch {
				// Already gone, or refused — either way the reopen below is the next attempt.
			}
		}
		// Must open from the user gesture (popup-blocker-safe).
		const win = window.open('', 'lattice-stage', 'width=1280,height=720');
		if (!win) return; // blocked — leave the toggle off
		stageWin = win;
		// A NEW STAGE MAKES THE OLD ONE'S OBITUARY STALE. A navigated window's
		// classification is still in flight for up to `CLOSED_GRACE_MS`, and a presenter who
		// re-opens inside that window would be told the Stage left the deck while looking at
		// the one that just came up.
		ownSeq += 1;
		ready = false;
		written = '';
		window.addEventListener('message', onMsg);
		paint(HOLDING);
		written = ''; // the holding page is not a deck — the real doc must still land
		// THE POLL IS THE BACKSTOP THE BEAT CANNOT BE. An unload beat catches a hand-close
		// instantly, and catches nothing when the renderer is killed — which
		// 2026-08-10-studio-crash-sentinel.md exists because it happens here. Slow on
		// purpose: this is a liveness check on one window, not a sync channel.
		// THE POLL ALWAYS ANNOUNCES, and it does not consult `closed` the way the beat path
		// does. Reaching here means the Stage stopped being our document and never said
		// goodbye — and a goodbye is what a deliberate close reliably sends (measured: a
		// hand-close fires BOTH `pagehide` and `unload`, so the beat arrives twice). Whatever
		// took the deck off the room's screen without a goodbye, nobody asked for it, so it
		// gets said. A `closed` check here would silence exactly that.
		//
		// The two arms below are OBSERVED STATE, not diagnosis. The common one is
		// `'navigated'` — the window is still there and is not ours: a same-origin page took
		// it over without its beat reaching us, or the document became unreadable. `'gone'`
		// is the window vanishing with no beat at all, which is rarer than it sounds: a
		// crashed or discarded tab keeps `closed === false` and lands in the first arm.
		pollId = window.setInterval(() => {
			if (alive()) return;
			const w = stageWin;
			teardown();
			// Still open, just not ours → someone took the window over and the beat did not
			// reach us. Two seconds have passed, so `closed` has long since settled and this
			// read needs no grace window.
			let navigated = false;
			try {
				navigated = !!w && !w.closed;
			} catch {
				navigated = false;
			}
			onLost?.(navigated ? 'navigated' : 'gone');
		}, 2000);
		autoPlaceStage(win)
			.then(async (placed) => {
				if (win !== stageWin || win.closed) return; // toggled off while we were asking
				// Fullscreen AFTER the deck document is live, and only onto a screen we
				// actually placed onto — see `fillExternalScreen`.
				const full = placed ? await fillExternalScreen(win) : false;
				if (win !== stageWin) return;
				onPlaced?.({ placed, full });
			})
			.catch(() => {});
		const doc = getDoc?.();
		if (doc) paint(doc);
	}
	function isOpen() {
		return alive();
	}
	// `token` is read by the caller so the document it builds can echo it back.
	return { toggle, write, show, close, isOpen, token };
}
