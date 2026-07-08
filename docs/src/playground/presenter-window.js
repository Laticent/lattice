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
		':root{color-scheme:dark}',
		'*{box-sizing:border-box}',
		'html,body{margin:0;height:100%;background:#0b0b0e;color:#f4f4f6;',
		'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}',
		'.pp{display:grid;grid-template-rows:auto 1fr;height:100%}',
		'.pp-top{display:flex;align-items:center;gap:1rem;padding:.7rem 1rem;border-bottom:1px solid rgba(255,255,255,.12)}',
		'.pp-clock{font-size:1.6rem;font-weight:600;font-variant-numeric:tabular-nums}',
		'.pp-count{margin-left:auto;color:#b9b9c2;font-variant-numeric:tabular-nums}',
		'.pp-btn{font:inherit;color:#f4f4f6;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);',
		'border-radius:8px;padding:.4rem .8rem;cursor:pointer}',
		'.pp-btn:hover{background:rgba(255,255,255,.16)}',
		'.pp-reset{margin-left:.5rem}',
		'.pp-body{display:grid;grid-template-columns:1.4fr 1fr;gap:1rem;padding:1rem;min-height:0}',
		'.pp-stage{display:grid;grid-template-rows:auto 1fr;gap:.5rem;min-height:0}',
		'.pp-side{display:grid;grid-template-rows:auto 1fr auto auto;gap:.5rem;min-height:0}',
		'.pp-label{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#8a8a96}',
		'.pp-screen{position:relative;background:#000;border-radius:10px;overflow:hidden;min-height:0;aspect-ratio:16/9}',
		'.pp-screen iframe{position:absolute;inset:0;width:100%;height:100%;border:0}',
		'.pp-next .pp-screen{aspect-ratio:16/9}',
		'.pp-notes{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;',
		'padding:.85rem 1rem;overflow:auto;line-height:1.55;font-size:1.05rem}',
		'.pp-notes p{margin:0 0 .7rem}.pp-notes .empty{color:#8a8a96;font-style:italic}',
		'.pp-nav{display:flex;gap:.5rem}.pp-nav .pp-btn{flex:1;text-align:center}',
		'</style></head><body>',
		'<div class="pp">',
		'<div class="pp-top"><span class="pp-clock" id="clock">0:00</span>',
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
		'<button class="pp-btn" id="next-btn">Next ›</button></div></div>',
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
		'document.getElementById("reset").onclick=function(){started=Date.now();tick()};',
		'window.addEventListener("keydown",function(e){',
		'if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown"){e.preventDefault();send("go",1)}',
		'else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();send("go",-1)}});',
		'window.addEventListener("message",function(e){var d=e.data||{};',
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
				const st = getState() || {};
				presenterWin.postMessage({ ppInit: true, doc: buildDoc(), total: st.total || 0 }, '*');
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
			const st = getState() || {};
			presenterWin.postMessage({ ppInit: true, doc: buildDoc(), total: st.total || 0 }, '*');
		} catch {
			/* gone */
		}
		sync();
	}
	return { toggle, sync, close, isOpen, refresh };
}
