// Presenter-window kernel — the dual-screen speaker view, shared (HARD RULE #1).
//
// Extracted from drawing-board-present.js so BOTH the Drawing Board's Present
// player AND the Studio's Present overlay drive the SAME reveal.js-style speaker
// view: a `window.open` second window showing the current + next slide, the
// speaker notes, and an elapsed timer, kept in sync over `postMessage` on the
// held window handle (not localStorage/BroadcastChannel — those are partitioned
// under file://, and one code path is what the self-contained `.html` export
// player can inherit; see 2026-06-16-lattice-export-format.md §2c/§2d).
//
// Three pure-ish pieces:
//   • buildStageDoc(opts)   → the single-slide STAGE document (all sections, one
//     shown, uniformly scaled, driven by `postMessage({pv:n})`). The same doc
//     feeds the main player iframe AND the presenter's current/next iframes, so
//     a presented slide is pixel-identical to the live preview.
//   • buildPresenterDoc()   → the self-contained SECOND-WINDOW document. Slides
//     arrive by postMessage after load (the payload is large), and its controls
//     postMessage back to the opener.
//   • createPresenterController(hooks) → the OPENER-side manager: open/close the
//     window (from a user gesture, popup-blocker-safe), the ready→init→sync
//     handshake, navigation relay, and Window-Management auto-placement on a
//     second screen. Framework-agnostic — the Drawing Board (vanilla) and the
//     Studio (React, via a thin wrapper) both pass closures into their state.

import { createWheelGate, createZoomGesture, fitScale, keyAction, PRESENT_KEYMAP, padInset, swipeAction, zoomStep } from '../../../../../lib/core/present-transport.mjs';
import { sanitizeSlideHtml } from '../../../lib/sanitize-slide-html.js';
import { slideBox } from '../../../playground/frame-css.js';

/**
 * The single-slide stage document — one `<section>` of `html` shown at a time,
 * centred and uniformly scaled to fit, the slide box pinned through frame-css so
 * container-query layouts resolve against the real `@size` (preview parity).
 * `show(n)` is driven from the parent via `postMessage({pv:n})`. A no-zoom
 * viewport + touch-action kill the iOS double-tap jolt.
 */
export function buildStageDoc({ html, width, height, bg, css, runtimeUrl, katexUrl = '', mermaidUrl = '', a11yDefs = '', pad = { factor: 0.012, floor: 0 } }) {
	html = sanitizeSlideHtml(html); // #616 T-CONTENT — strip script before the same-origin stage srcdoc
	const sw = width;
	const sh = height;
	// The fit factor is the shared transport kernel's `fitScale`/`padInset`
	// (lib/core/present-transport.mjs) — inlined VERBATIM into the stage script (which
	// runs in an isolated iframe and can't import), so the docs stage, the rehearsal
	// stage, and the export player all scale by the identical maths. `pad` selects the
	// symmetric inset: the dual-screen stage uses ×0.012 (floor 0), rehearsal ×0.04
	// (floor 14). See P3 of 2026-07-07-html-lattice-player.md.
	// ASSIGN to vars named EXACTLY as the call sites below use them: the production bundler
	// RENAMES the imported `fitScale`/`padInset`, and their `.toString()` carries the renamed
	// (or anonymous/arrow) form — so inlining the bare source left `fitScale`/`padInset`
	// undefined at the call sites and `fit()` threw "padInset is not defined" on every call,
	// silently never scaling the slide (the long-standing presenter CROP). The `var name =`
	// binding restores the names regardless of how the function prints.
	const kernel = `var fitScale=${fitScale.toString()};\nvar padInset=${padInset.toString()};`;
	const padF = Number(pad.factor);
	const padFl = Number(pad.floor || 0);
	// Resolve the runtime URL to ABSOLUTE. The stage doc is set as an iframe
	// `srcdoc`; in the dual-screen presenter that iframe lives inside an
	// `about:blank` popup, whose base URL is `about:blank` — a root-relative
	// `/…/runtime.js` then fails to resolve and the parser-blocking script stalls
	// the inline reveal/fit scripts after it (slides render but stay hidden &
	// unscaled). Absolute resolves identically for the in-page stage (base = page).
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
	const FIT =
		'(function(){' +
		kernel + ';' +
		'var stage=document.getElementById("latt-stage"),fitEl=document.getElementById("latt-fit"),film=document.getElementById("latt-film");' +
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
		'})();';
	return (
		'<!doctype html><html><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
		(katexUrl ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		'<style>html,body{margin:0;padding:0;height:100%;background:' + bg + ';overflow:hidden;touch-action:manipulation;-webkit-text-size-adjust:100%;}' +
		'#latt-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;visibility:hidden;}' +
		'#latt-fit{overflow:hidden;}' +
		'#latt-film{position:relative;transform-origin:top left;}' +
		'#latt-film .lattice{margin:0;padding:0;}' +
		slideBox(sw, sh) +
		css + '</style></head><body>' +
		a11yDefs + '<div id="latt-stage"><div id="latt-fit"><div id="latt-film">' + html + '</div></div></div>' +
		(mermaidUrl ? '<scr' + 'ipt src="' + mermaidUrl + '"></scr' + 'ipt>' : '') +
		'<scr' + 'ipt src="' + rt + '"></scr' + 'ipt>' +
		'<scr' + 'ipt>requestAnimationFrame(function(){var st=document.getElementById("latt-stage");if(st)st.style.visibility="visible"});</scr' + 'ipt>' +
		'<scr' + 'ipt>' + FIT + '</scr' + 'ipt></body></html>'
	);
}

/**
 * The self-contained presenter (second-window) document. Slides arrive by
 * postMessage after load (the notes/sections payload can be large, so we don't
 * inline it in the URL); its prev/next/reset controls postMessage back to the
 * opener, and ←/→/space/PageUp/PageDown drive navigation from the second screen.
 */
export function buildPresenterDoc() {
	// The navigation kernel, inlined VERBATIM — this popup is written with
	// `document.write` into an `about:blank` window and cannot `import`. Bound to
	// `var`s named exactly as the script's call sites use them: the production
	// bundler renames imported functions and `.toString()` carries the renamed
	// form, which is what once left `padInset` undefined inside `buildStageDoc`
	// (see the note there). Same idiom, same reason.
	//
	// THE `var` BINDING FIXES THE NAME, NOT THE BODY. It restores the identifier a
	// call site uses; it cannot restore a free variable INSIDE a function's source.
	// `swipeAction` and `createWheelGate` are safe because their defaults are
	// literals. `keyAction`'s default is `map = PRESENT_KEYMAP` — a module-scope
	// read, which minifies to a name that does not exist in this popup. So the call
	// site below MUST pass the map explicitly; the no-map form would throw at the
	// first key press, in production only. `test/unit/export/inlinable-kernels.test.js`
	// pins exactly this (it asserts the no-map form throws when inlined).
	const navKernel =
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)};\n` +
		`var keyAction=${keyAction.toString()};\n` +
		`var swipeAction=${swipeAction.toString()};\n` +
		`var createWheelGate=${createWheelGate.toString()};\n` +
		// The ZOOM rule. Inlined for the same reason as the other three, and it carries
		// the finger-count guard that stops `swipeAction` above being fed a pinch.
		// `test/unit/export/inlinable-kernels.test.js` pins both against a refactor that
		// reintroduces a module-scope reference.
		`var zoomStep=${zoomStep.toString()};\n` +
		`var createZoomGesture=${createZoomGesture.toString()};`;
	return [
		'<!doctype html><html><head><meta charset="utf-8"><title>Presenter view</title>',
		'<meta name="viewport" content="width=device-width,initial-scale=1">',
		'<style>',
		// Brand-dark presenter (2026-07-12 redesign, S5): a warm near-black surface (the
		// "brand dark by default" frame) inlined here — a window.open popup can't inherit the
		// opener's CSS vars. The ACCENT is forwarded from the Studio at ppInit (below) so the
		// second screen speaks the SAME accent as the deck/overlay it launched from; the cuoio
		// gold here is only the fallback when no accent is forwarded (e.g. the Drawing Board).
		// Accent-tinted tokens derive from --pp-accent, so forwarding one value recolors them all.
		':root{color-scheme:dark;',
		'--pp-bg:#15110D;--pp-panel:#20190F;--pp-panel-2:#2A2216;',
		'--pp-text:#F5EFE6;--pp-muted:#B6A488;',
		'--pp-accent:#C8A040;--pp-on-accent:#15110D;',
		'--pp-accent-soft:color-mix(in srgb, var(--pp-accent) 14%, transparent);',
		'--pp-border:color-mix(in srgb, var(--pp-accent) 22%, transparent)}',
		'*{box-sizing:border-box}',
		"html,body{margin:0;height:100%;background:var(--pp-bg);color:var(--pp-text);",
		"font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}",
		'.pp{display:grid;grid-template-rows:auto 1fr;height:100%}',
		'.pp-top{display:flex;align-items:center;gap:.9rem;padding:.85rem 1.25rem;border-bottom:1px solid var(--pp-border)}',
		'.pp-brand{font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;font-weight:700;color:var(--pp-accent)}',
		'.pp-clock{font-size:1.7rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.01em}',
		'.pp-count{margin-left:auto;font-size:1.05rem;font-weight:600;color:var(--pp-muted);font-variant-numeric:tabular-nums}',
		'.pp-btn{font:inherit;font-weight:600;color:var(--pp-text);background:var(--pp-panel-2);border:1px solid var(--pp-border);',
		'border-radius:999px;padding:.45rem 1rem;cursor:pointer;transition:background .15s,border-color .15s,color .15s}',
		'.pp-btn:hover{background:var(--pp-accent-soft);border-color:var(--pp-accent);color:var(--pp-accent)}',
		// Reset is a destructive one-tap wipe, so it ARMS on first click (turns accent) and only
		// resets on the confirming second click — no accidental mid-talk timer loss.
		'.pp-reset{margin-left:.75rem;font-size:.85rem;padding:.4rem .9rem}',
		'.pp-reset.armed{background:var(--pp-accent-soft);border-color:var(--pp-accent);color:var(--pp-accent)}',
		'.pp-body{display:grid;grid-template-columns:1.5fr 1fr;gap:1.15rem;padding:1.15rem;min-height:0}',
		'.pp-stage{display:grid;grid-template-rows:auto 1fr;gap:.55rem;min-height:0}',
		'.pp-side{display:grid;grid-template-rows:auto auto auto 1fr auto;gap:.55rem;min-height:0}',
		'.pp-label{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--pp-muted);font-weight:700}',
		// Whole, uncropped slides: the stage iframe fit-scales each slide to fit (letterboxed,
		// never cropped); the 16/9 frame matches the slide box so nothing is clipped.
		'.pp-screen{position:relative;background:var(--pp-bg);border:1px solid var(--pp-border);border-radius:14px;overflow:hidden;min-height:0;aspect-ratio:16/9;box-shadow:0 12px 34px rgba(0,0,0,.38)}',
		// pointer-events:none so a wheel flick or a swipe over the stage reaches the
		// window's navigation listeners instead of being swallowed by the iframe (the
		// same rule the Studio shell's preview holder uses). Both stages are passive
		// mirrors of the audience screen — there is nothing in them to click.
		'.pp-screen iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}',
		// The browser must not claim a pinch (page zoom) or a drag before our listeners
		// see it — except in the notes, which genuinely scroll.
		'.pp{touch-action:none}.pp-notes{touch-action:pan-y}',
		'.pp-zoom{margin-left:.5rem;font:inherit;font-size:.68rem;font-weight:700;letter-spacing:.06em;',
		'color:var(--pp-accent);background:var(--pp-accent-soft);border:1px solid var(--pp-accent);',
		'border-radius:999px;padding:.1rem .5rem;cursor:pointer}',
		// The NEXT preview is capped so it can never crowd the notes + nav off a short window
		// (it yields; the notes 1fr scrolls; the nav row stays on screen).
		'.pp-next{min-height:0}.pp-next .pp-screen{max-height:32vh}',
		'.pp-notes{background:var(--pp-panel);border:1px solid var(--pp-border);border-radius:14px;',
		'padding:1rem 1.2rem;overflow:auto;overflow-wrap:anywhere;line-height:1.6;font-size:1.2rem;min-height:0}',
		'.pp-notes p{margin:0 0 .8rem}.pp-notes p:last-child{margin:0}.pp-notes .empty{color:var(--pp-muted);font-style:italic}',
		'.pp-nav{display:flex;gap:.6rem}.pp-nav .pp-btn{flex:1;text-align:center;padding:.6rem;font-size:1rem}',
		'.pp-nav .pp-fwd{background:var(--pp-accent);border-color:var(--pp-accent);color:var(--pp-on-accent)}',
		'.pp-nav .pp-fwd:hover{filter:brightness(1.08);color:var(--pp-on-accent)}',
		'</style></head><body>',
		'<div class="pp">',
		'<div class="pp-top"><span class="pp-brand">Presenter</span><span class="pp-clock" id="clock">0:00</span>',
		'<button class="pp-btn pp-reset" id="reset">Reset timer</button>',
		'<span class="pp-count" id="count">– / –</span></div>',
		'<div class="pp-body">',
		'<div class="pp-stage"><span class="pp-label">Current',
		// Surfaced only while zoomed, and it doubles as the tap-target back to fit —
		// the only route on a trackpad, which has no middle button.
		'<button class="pp-zoom" id="zoom" hidden title="Reset zoom to fit"></button></span>',
		'<div class="pp-screen"><iframe id="cur" title="Current slide"></iframe></div></div>',
		'<div class="pp-side"><span class="pp-label">Next</span>',
		'<div class="pp-next"><div class="pp-screen"><iframe id="next" title="Next slide"></iframe></div></div>',
		'<span class="pp-label">Speaker notes</span>',
		'<div class="pp-notes" id="notes"></div>',
		'<div class="pp-nav"><button class="pp-btn" id="prev">‹ Prev</button>',
		'<button class="pp-btn pp-fwd" id="next-btn">Next ›</button></div></div>',
		'</div></div>',
		'<script>(function(){',
		navKernel,
		'var P=window.opener;var cur=document.getElementById("cur"),nxt=document.getElementById("next");',
		'var clock=document.getElementById("clock"),count=document.getElementById("count"),notes=document.getElementById("notes");',
		'var doc=null,total=0,last=0,started=Date.now(),timer=null;',
		'function send(t,v){try{P&&P.postMessage({pp:t,v:v},"*")}catch(e){}}',
		'function tick(){clock.textContent=fmt((Date.now()-started)/1000)}',
		'function fmt(s){s=Math.max(0,Math.round(s));var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;',
		'return (h?h+":"+String(m).padStart(2,"0"):m)+":"+String(x).padStart(2,"0")}',
		'function applyFrames(){try{cur.contentWindow.postMessage({pv:last},"*")}catch(x){}',
		'try{nxt.contentWindow.postMessage({pv:Math.min(Math.max(total-1,0),last+1)},"*")}catch(x){}}',
		'cur.addEventListener("load",applyFrames);nxt.addEventListener("load",applyFrames);',
		'document.getElementById("prev").onclick=function(){send("go",-1)};',
		'document.getElementById("next-btn").onclick=function(){send("go",1)};',
		// Reset ARMS on the first click and only wipes on a confirming second click (auto-disarms
		// after 2.5s), so a stray click near the clock can never lose the elapsed time mid-talk.
		'var rb=document.getElementById("reset"),armed=false,armT=null;',
		'function disarm(){armed=false;rb.classList.remove("armed");rb.textContent="Reset timer";if(armT){clearTimeout(armT);armT=null}}',
		'rb.onclick=function(){if(armed){disarm();started=Date.now();tick();return}',
		'armed=true;rb.classList.add("armed");rb.textContent="Confirm reset";armT=setTimeout(disarm,2500)};',
		// NAVIGATION — all three input verbs, same as every other Present surface (#1294).
		// The second screen is as likely to be a touchscreen laptop or a tablet propped on
		// a lectern as a mouse-driven tower, so keyboard, wheel and swipe all drive it.
		//
		// Every rule comes from the inlined kernel block above, so the presenter screen
		// cannot drift from the stage it mirrors. Actions become DELTAS because that is
		// this window's relay protocol (`send("go", ±n)`); the opener clamps, so a delta
		// past either end is exactly "first"/"last".
		'var NAVDELTA={next:1,prev:-1,first:-1e9,last:1e9};',
		'function nav(a){if(a)send("go",NAVDELTA[a])}',
		// The notes panel scrolls; a wheel or drag inside it is reading, not navigating.
		'function inNotes(t){return !!(t&&t.closest&&t.closest("#notes"))}',
		'window.addEventListener("keydown",function(e){',
		'if(e.metaKey||e.ctrlKey||e.altKey)return;',
		'var a=keyAction(e.key,PRESENT_KEYMAP);if(!a)return;e.preventDefault();nav(a)});',
		// ZOOM — the fourth verb, on the CURRENT-slide stage. A presenter reads the same
		// dense slide the room does, and the second screen is the one place they can
		// magnify a number without the audience seeing it happen.
		//
		// Every listener below is `{passive:false}` where it may preventDefault: a
		// pinch or a ctrl+wheel has to stop the BROWSER zooming this whole popup, which
		// is the behavior being replaced. The old handlers were `{passive:true}` AND
		// never counted fingers, so a pinch here read as a swipe and turned the deck for
		// the whole room (2026-08-10-preview-pinch-zoom.md).
		'var zb=document.getElementById("zoom");',
		'var zoom=createZoomGesture({onChange:function(s){',
		'cur.style.transformOrigin="0 0";',
		'cur.style.transform=s.scale===1?"":"translate("+s.x+"px,"+s.y+"px) scale("+s.scale+")";',
		'zb.hidden=s.scale===1;zb.textContent=Math.round(s.scale*100)+"%"}});',
		'zb.onclick=function(){zoom.reset()};',
		// The CURRENT stage's screen box is the coordinate space and the clip.
		'function vf(){var r=cur.parentNode.getBoundingClientRect();return{w:r.width,h:r.height,left:r.left,top:r.top}}',
		'function lp(p,f){return{x:p.clientX-f.left,y:p.clientY-f.top}}',
		'function pts(l,f){var a=[],i=0;for(;i<l.length;i++)a.push(lp(l[i],f));return a}',
		'var wheelGate=createWheelGate();',
		// deltaMode normalization, same as the docs controller: Firefox reports LINES
		// (deltaY ~ 3), so the pixel-tuned rate made ctrl+wheel zoom effectively inert
		// here while it worked in the shell. Two copies of one rule diverging is the
		// #1294 failure this module exists to prevent, so the popup carries it too.
		'function wpx(e){return e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*vf().h:e.deltaY}',
		'window.addEventListener("wheel",function(e){',
		'if(inNotes(e.target))return;',
		// ctrl/meta+wheel is BOTH a mouse zoom and how a trackpad pinch reaches the page.
		'if(e.ctrlKey||e.metaKey){e.preventDefault();var f=vf(),p=lp(e,f);zoom.by(zoomStep(wpx(e)),p.x,p.y,f);return}',
		'nav(wheelGate(e.deltaX,e.deltaY,e.timeStamp))},{passive:false});',
		'var swStart=null;',
		// targetTouches, never touches: `touches` is every contact on the DOCUMENT, so a
		// finger resting in the notes pane would count as a pinch finger for the stage.
		'window.addEventListener("touchstart",function(e){',
		'if(inNotes(e.target))return;var f=vf(),p=pts(e.targetTouches,f);zoom.down(p);',
		'if(p.length===1)swStart=p[0];if(p.length>1)e.preventDefault()},{passive:false});',
		'window.addEventListener("touchmove",function(e){',
		'if(inNotes(e.target))return;var f=vf();if(zoom.move(pts(e.targetTouches,f),f))e.preventDefault()},{passive:false});',
		// touchcancel was missing entirely — a system edge gesture or palm rejection left
		// the pinch flag latched, silently eating the NEXT swipe on the surface where a
		// lost slide-turn is most expensive.
		'window.addEventListener("touchcancel",function(e){',
		'var f=vf(),rem=e.targetTouches.length;zoom.up(rem);',
		'if(rem>0){zoom.anchor(lp(e.targetTouches[0],f));return}swStart=null},{passive:false});',
		'window.addEventListener("touchend",function(e){',
		'if(inNotes(e.target))return;var f=vf(),rem=e.targetTouches.length,r=zoom.up(rem);',
		'if(rem>0){zoom.anchor(lp(e.targetTouches[0],f));return}',
		'var s=swStart;swStart=null;',
		// THE FIX: a gesture that ever held two fingers, or panned a zoomed slide, is
		// never measured as a swipe.
		'if(r.swipeBlocked||!s)return;var t=e.changedTouches[0];if(!t)return;var p=lp(t,f);',
		'nav(swipeAction({dx:p.x-s.x,dy:p.y-s.y}))},{passive:false});',
		// Middle-button: drag to zoom, click to snap back to fit. preventDefault stops
		// Chrome's autoscroll widget (Windows) and X11's middle-click paste.
		'var mid=null;',
		'window.addEventListener("mousedown",function(e){',
		'if(e.button!==1||inNotes(e.target))return;e.preventDefault();',
		'var f=vf(),p=lp(e,f);mid={x:p.x,y:p.y,t:0}},{passive:false});',
		'window.addEventListener("mousemove",function(e){',
		'if(!mid)return;var f=vf(),p=lp(e,f),dy=p.y-mid.y;',
		'mid.t+=Math.abs(p.x-mid.x)+Math.abs(dy);zoom.by(zoomStep(dy,{rate:0.006}),mid.x,mid.y,f);',
		'mid.x=p.x;mid.y=p.y});',
		'window.addEventListener("mouseup",function(e){',
		'if(!mid)return;if(e.button===1&&mid.t<4)zoom.reset();mid=null});',
		'window.addEventListener("auxclick",function(e){if(e.button===1)e.preventDefault()},{passive:false});',
		'window.addEventListener("message",function(e){var d=e.data||{};',
		// Adopt the Studio\'s accent so the second screen speaks the deck\'s color, not a fixed one
		// (falls back to the cuoio gold in :root when the opener sends none, e.g. the Drawing Board).
		'if(d.accent){var rs=document.documentElement.style;rs.setProperty("--pp-accent",d.accent);if(d.onAccent)rs.setProperty("--pp-on-accent",d.onAccent)}',
		'if(d.ppInit){doc=d.doc;total=d.total;cur.srcdoc=doc;nxt.srcdoc=doc;}',
		'if(d.ppIndex!=null){last=d.ppIndex;',
		// Zoom belongs to the slide you are reading, not to the deck. (Not because the
		// offset would be "random" — every slide fits the same box, so it would be the
		// SAME region — but because arriving mid-sentence at 3x on a slide whose content
		// sits elsewhere reads as a bug. Reconsidered after #1555 against the case for
		// persisting, and KEPT on a human call — settled, not merely unexamined. See
		// the decision note.)
		'zoom.reset();',
		'count.textContent=(d.ppIndex+1)+" / "+total;',
		'applyFrames();',
		'notes.innerHTML="";var ns=d.note?String(d.note).split(/\\n{2,}/):[];',
		'if(ns.length){ns.forEach(function(p){var el=document.createElement("p");el.textContent=p.trim();notes.appendChild(el)})}',
		'else{var el=document.createElement("p");el.className="empty";el.textContent="No speaker notes on this slide.";notes.appendChild(el)}',
		'}});',
		'window.addEventListener("unload",function(){send("closed")});',
		'send("ready");timer=setInterval(tick,250);tick();',
		'})();</scr' + 'ipt></body></html>',
	].join('');
}

/**
 * Auto-place the presenter window on a second screen when the Window Management
 * permission is granted. Enhancement only; a no-op (and manual drag) otherwise.
 */
async function autoPlacePresenter(win) {
	try {
		if (!('getScreenDetails' in window)) return;
		const details = await window.getScreenDetails();
		const ext = details.screens.find((s) => !s.isInternal) || details.screens.find((s) => s !== details.currentScreen);
		if (ext) win.moveTo(ext.availLeft, ext.availTop);
	} catch {
		/* permission denied / unsupported */
	}
}

/**
 * The opener-side presenter manager. Hooks:
 *   • buildDoc() → the stage document string for the presenter's iframes (the
 *     opener renders its full deck and wraps it with buildStageDoc).
 *   • getState() → { index, total, note } — the live position + this slide's note.
 *   • onGo(delta) → navigate the OPENER by delta (it then calls sync()).
 *   • onToggle(open) → reflect open/closed in the opener UI (optional).
 * Returns { toggle, sync, close, isOpen }. `toggle()` MUST run in a user gesture
 * (popup-blocker-safe). The manager owns its own `message` listener lifecycle
 * (attached while a window is open) and trusts only its held handle (`e.source`).
 */
export function createPresenterController({ buildDoc, getState, onGo, onToggle }) {
	let presenterWin = null;
	let presenterReady = false;

	// The ppInit payload — the stage doc + total, plus the opener's resolved accent when
	// `getState()` provides it (the Studio does; the Drawing Board omits it → cuoio fallback).
	// Accent keys are added ONLY when present so a getState without them yields exactly
	// `{ppInit, doc, total}` (the shared kernel contract the DB and the tests rely on).
	function initPayload(st) {
		const msg = { ppInit: true, doc: buildDoc(), total: st.total || 0 };
		if (st.accent) msg.accent = st.accent;
		if (st.onAccent) msg.onAccent = st.onAccent;
		return msg;
	}

	function sync() {
		if (!presenterWin || presenterWin.closed || !presenterReady) return;
		const st = getState() || {};
		try {
			// `?? 0` not `|| 0` — slide index 0 is a legitimate value, not "missing".
			presenterWin.postMessage({ ppIndex: st.index ?? 0, note: st.note || '' }, '*');
		} catch {
			/* gone */
		}
	}
	function onMsg(e) {
		// Only ever act on messages from OUR presenter window — `e.source` must be
		// the exact handle we opened (unforgeable). The `!presenterWin` gate keeps a
		// stray `message` carrying a `pp` field from driving navigation against a
		// null window. Same-origin popup → permissive targetOrigin on sends; trust
		// rides on the handle check.
		if (!presenterWin || e.source !== presenterWin) return;
		const d = e.data || {};
		if (!d || typeof d.pp !== 'string') return;
		if (d.pp === 'ready') {
			try {
				presenterWin.postMessage(initPayload(getState() || {}), '*');
				presenterReady = true;
			} catch {
				/* gone */
			}
			sync();
		} else if (d.pp === 'go') {
			onGo(d.v || 0);
		} else if (d.pp === 'closed') {
			teardown();
		}
	}
	function teardown() {
		presenterReady = false;
		if (presenterWin) {
			window.removeEventListener('message', onMsg);
			presenterWin = null;
		}
		onToggle?.(false);
	}
	function close() {
		if (presenterWin && !presenterWin.closed) {
			try {
				presenterWin.close();
			} catch {
				/* gone */
			}
		}
		teardown();
	}
	function toggle() {
		if (presenterWin && !presenterWin.closed) {
			close();
			return;
		}
		// Must open from the user gesture (popup-blocker-safe).
		const win = window.open('', 'lattice-presenter', 'width=1100,height=720');
		if (!win) return; // blocked — leave the toggle off
		presenterWin = win;
		presenterReady = false;
		window.addEventListener('message', onMsg);
		win.document.open();
		win.document.write(buildPresenterDoc());
		win.document.close();
		autoPlacePresenter(win);
		onToggle?.(true);
	}
	function isOpen() {
		return !!(presenterWin && !presenterWin.closed);
	}
	// Re-send the stage doc to an already-open presenter (then re-sync the index).
	// The Drawing Board never needs this — its doc is ready synchronously at the
	// 'ready' handshake — but a surface that renders its deck ASYNCHRONOUSLY (the
	// Studio) calls this once the doc lands so the presenter isn't left blank.
	function refresh() {
		if (!presenterWin || presenterWin.closed || !presenterReady) return;
		try {
			presenterWin.postMessage(initPayload(getState() || {}), '*');
		} catch {
			/* gone */
		}
		sync();
	}
	return { toggle, sync, close, isOpen, refresh };
}
