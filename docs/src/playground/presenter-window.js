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

import { fitScale, padInset } from '../../../lib/core/present-transport.mjs';
import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { slideBox } from './frame-css.js';

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
	const kernel = `${fitScale.toString()}\n${padInset.toString()}`;
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
	// ISOLATION (the real bug): stage layout must NOT share the cascade with the
	// engine out.css. Positioning lives on OUR #latt-stage/#latt-fit — ID selectors
	// (1,0,0) out.css's element/:where/class rules can't clobber — and #latt-stage
	// wraps .lattice from OUTSIDE, so the slide's own transform:scale can't trap our
	// fixed positioning (an ancestor transform re-bases position:fixed). #latt-stage
	// fills 100dvh (tracks the iOS toolbars → visual center, not behind the bar) and
	// flex-centers #latt-fit, which fit() sizes to the SCALED slide box; the section
	// scales from top-left to fill it.
	const FIT =
		'(function(){' +
		kernel + ';' +
		'var stage=document.getElementById("latt-stage"),fitEl=document.getElementById("latt-fit");' +
		'function secs(){var m=document.querySelector(".lattice");return m?m.querySelectorAll(":scope>section"):[]}' +
		'var cur=0;' +
		'function fit(){var s=secs();if(!s.length||!stage||!fitEl)return;' +
		'var W=stage.clientWidth||window.innerWidth,H=stage.clientHeight||window.innerHeight;' +
		'var inset=padInset(W,H,{factor:' + padF + ',floor:' + padFl + '});' +
		'var sc=fitScale({stageW:W,stageH:H,slideW:' + sw + ',slideH:' + sh + ',insetX:inset,insetY:inset});if(!(sc>0))sc=1;' +
		'fitEl.style.width=(sc*' + sw + ')+"px";fitEl.style.height=(sc*' + sh + ')+"px";' +
		'for(var i=0;i<s.length;i++){var on=i===cur;s[i].style.display=on?"":"none";' +
		'if(on){s[i].style.transformOrigin="top left";s[i].style.transform="scale("+sc+")"}}}' +
		'function show(n){cur=n|0;fit()}' +
		'window.addEventListener("message",function(e){if(e.data&&e.data.pv!=null)show(e.data.pv)});' +
		'window.addEventListener("resize",fit);window.addEventListener("orientationchange",fit);' +
		'if(window.visualViewport){try{window.visualViewport.addEventListener("resize",fit)}catch(e){}}' +
		'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(fit).observe(stage)}catch(e){}}' +
		'[60,300,1200].forEach(function(t){setTimeout(fit,t)});show(0);' +
		'})();';
	return (
		'<!doctype html><html><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
		(katexUrl ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		'<style>html,body{margin:0;padding:0;height:100%;background:' + bg + ';overflow:hidden;touch-action:manipulation;-webkit-text-size-adjust:100%;}' +
		'#latt-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;visibility:hidden;}' +
		'#latt-fit{overflow:hidden;}' +
		'#latt-fit .lattice{margin:0;padding:0;}' +
		'#latt-fit .lattice>section{transform-origin:top left;}' +
		slideBox(sw, sh) +
		css + '</style></head><body>' +
		a11yDefs + '<div id="latt-stage"><div id="latt-fit">' + html + '</div></div>' +
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
		'.pp-screen iframe{position:absolute;inset:0;width:100%;height:100%;border:0}',
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
		'<div class="pp-stage"><span class="pp-label">Current</span>',
		'<div class="pp-screen"><iframe id="cur" title="Current slide"></iframe></div></div>',
		'<div class="pp-side"><span class="pp-label">Next</span>',
		'<div class="pp-next"><div class="pp-screen"><iframe id="next" title="Next slide"></iframe></div></div>',
		'<span class="pp-label">Speaker notes</span>',
		'<div class="pp-notes" id="notes"></div>',
		'<div class="pp-nav"><button class="pp-btn" id="prev">‹ Prev</button>',
		'<button class="pp-btn pp-fwd" id="next-btn">Next ›</button></div></div>',
		'</div></div>',
		'<script>(function(){',
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
		'window.addEventListener("keydown",function(e){',
		'if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown"){e.preventDefault();send("go",1)}',
		'else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();send("go",-1)}});',
		'window.addEventListener("message",function(e){var d=e.data||{};',
		// Adopt the Studio\'s accent so the second screen speaks the deck\'s color, not a fixed one
		// (falls back to the cuoio gold in :root when the opener sends none, e.g. the Drawing Board).
		'if(d.accent){var rs=document.documentElement.style;rs.setProperty("--pp-accent",d.accent);if(d.onAccent)rs.setProperty("--pp-on-accent",d.onAccent)}',
		'if(d.ppInit){doc=d.doc;total=d.total;cur.srcdoc=doc;nxt.srcdoc=doc;}',
		'if(d.ppIndex!=null){last=d.ppIndex;',
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
