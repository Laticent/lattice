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

import { fitScale, padInset } from '../../../../../lib/core/present-transport.mjs';
import { sanitizeStyleText } from '../../../../../lib/core/sanitize-style-text.mjs';
import { sanitizeSlideHtml } from '../../../lib/sanitize-slide-html.js';
import { slideBox } from '../../../playground/frame-css.js';
import { STAGE_CHROME_CSS } from './stage-chrome.js';

/**
 * The single-slide stage document — one `<section>` of `html` shown at a time,
 * centred and uniformly scaled to fit, the slide box pinned through frame-css so
 * container-query layouts resolve against the real `@size` (preview parity).
 * `show(n)` is driven from the parent via `postMessage({pv:n})`. A no-zoom
 * viewport + touch-action kill the iOS double-tap jolt.
 *
 * `standalone` promotes the same document from an iframe payload to a WINDOW the
 * room looks at. It adds exactly three things and no chrome:
 *   • the two empty hosts the console portals the audience chrome into
 *     (`#latt-cc`, `#latt-rail`) plus their shared stylesheet;
 *   • the opener handshake — `{stage:'ready'}` once the fit is live, and
 *     `{stage:'closed'}` on unload, so the console can show "Stage disconnected"
 *     rather than driving a window that is gone;
 *   • `f` for fullscreen, because auto-fullscreening a popup from the opener's
 *     gesture is not something a browser is obliged to allow (§7 of the decision
 *     note); when it is declined, this key is the whole fallback.
 * All three are gated on `window.opener`, which is null in an iframe — so the
 * srcdoc hosts are byte-identical to what they were before the split.
 */
export function buildStageDoc({ html, width, height, bg, css, runtimeUrl, katexUrl = '', mermaidUrl = '', a11yDefs = '', pad = { factor: 0.012, floor: 0 }, standalone = false, chromeDecls = '' }) {
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
	const kernel = `var fitScale=${fitScale.toString()};\nvar padInset=${padInset.toString()};`;
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
		'if(window.opener){var OP=window.opener;' +
		'function tell(k){try{OP.postMessage({stage:k},"*")}catch(e){}}' +
		'window.addEventListener("unload",function(){tell("closed")});' +
		// `f` is the fallback for a browser that declines to fullscreen a fresh popup
		// (§7 — UNVERIFIED until a real two-monitor desktop says otherwise). It is the
		// ONLY key this document binds: the Stage does not navigate, because the room
		// does not drive the deck.
		'window.addEventListener("keydown",function(e){if(e.key!=="f"&&e.key!=="F")return;if(e.metaKey||e.ctrlKey||e.altKey)return;e.preventDefault();' +
		'try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}catch(x){}});' +
		'tell("ready");}' +
		'})();';
	// The audience chrome's two hosts — EMPTY. Nothing in this document ever writes to
	// them; the console portals React into them across the same-origin boundary, so the
	// caption crawl and the rail have exactly one implementation and it is the one the
	// console already renders when no Stage is open.
	const chrome = standalone ? '<div id="latt-chrome" class="latt-chrome"><div id="latt-cc"></div><div id="latt-rail"></div></div>' : '';
	return (
		'<!doctype html><html><head><meta charset="utf-8">' +
		(standalone ? '<title>Stage</title>' : '') +
		'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
		(katexUrl ? '<link rel="stylesheet" href="' + katexUrl + '">' : '') +
		'<style>html,body{margin:0;padding:0;height:100%;background:' + bg + ';overflow:hidden;touch-action:manipulation;-webkit-text-size-adjust:100%;}' +
		'#latt-stage{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;visibility:hidden;}' +
		'#latt-view{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;}' +
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
		a11yDefs + '<div id="latt-stage"><div id="latt-view"><div id="latt-fit"><div id="latt-film">' + html + '</div></div></div>' + chrome + '</div>' +
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
 * refusal, and the presenter drags the window themselves. The RESOLVED VALUE is
 * what the caller reports on, and the two halves are deliberately separate —
 * `placed` says we found a screen to aim at (detect, to decide whether to
 * offer), `full` says the window actually filled it (verify, to decide whether
 * it worked). Auto-fullscreening a just-opened popup from the opener's gesture
 * is NOT something a browser owes us: the popup has no transient activation of
 * its own, so `requestFullscreen` inside it may reject. §7 of the decision note
 * records that as UNVERIFIED until a real two-monitor desktop says otherwise,
 * and `full: false` is what lets the console say so out loud instead of leaving
 * a presenter looking at a windowed deck with no explanation.
 */
async function autoPlaceStage(win) {
	let placed = false;
	try {
		if ('getScreenDetails' in window) {
			const details = await window.getScreenDetails();
			const ext = details.screens.find((s) => !s.isInternal) || details.screens.find((s) => s !== details.currentScreen);
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
	let full = false;
	try {
		await win.document.documentElement.requestFullscreen();
		full = !!win.document.fullscreenElement;
	} catch {
		/* declined — the Stage's own `f` key is the fallback */
	}
	return { placed, full };
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
 *   • onLost() → the Stage went away WITHOUT the console asking. Separate from
 *     `onChange(null)` because the two need opposite treatment: closing the
 *     Stage yourself needs no announcement, and having the room's window
 *     disappear mid-talk needs one. Only the unload beat reaches this — `close()`
 *     detaches the listener first, so our own teardown cannot trip it.
 *   • onPlaced({ placed, full }) → the outcome of the auto-placement attempt.
 *
 * Returns { toggle, write, show, close, isOpen }. `toggle()` MUST run in a user
 * gesture (popup-blocker-safe). The manager owns its own `message` listener
 * lifecycle and trusts only its held handle (`e.source`).
 */
export function createStageController({ getDoc, getIndex, onChange, onLost, onPlaced }) {
	let stageWin = null;
	/** Has THIS document announced itself? Reset on every (re)write, because a
	 *  rewrite replaces the listener that answered last time. */
	let ready = false;
	/** The doc string currently written into the window — so a `write()` fired by
	 *  an unrelated re-render doesn't tear down a live Stage and re-run the
	 *  engine's boot for no change. */
	let written = '';

	// The holding page, written synchronously inside the gesture. Without it the
	// room watches `about:blank` for as long as the deck takes to render, which on a
	// cold engine is seconds — and a blank white window on a projector reads as a
	// crash. Deliberately not the chrome stylesheet: it is three lines of inline CSS
	// so it cannot itself be waiting on anything.
	const HOLDING =
		'<!doctype html><html><head><meta charset="utf-8"><title>Stage</title>' +
		'<style>html,body{margin:0;height:100%;background:#15110D;color:#B6A488;' +
		"font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center}" +
		'p{font-size:.95rem;letter-spacing:.02em}</style></head><body><p>Preparing the stage…</p></body></html>';

	function paint(doc) {
		if (!stageWin || stageWin.closed) return;
		ready = false;
		written = doc;
		try {
			stageWin.document.open();
			stageWin.document.write(doc);
			stageWin.document.close();
		} catch {
			/* gone between the check and the write */
		}
	}
	/** Post the current slide index. No-op until the Stage's fit says it is listening. */
	function show(index) {
		if (!stageWin || stageWin.closed || !ready) return;
		try {
			// `?? 0` not `|| 0` — slide index 0 is a legitimate value, not "missing".
			stageWin.postMessage({ pv: index ?? 0 }, '*');
		} catch {
			/* gone */
		}
	}
	/** (Re)write the Stage with a freshly rendered deck. Idempotent on an unchanged doc. */
	function write(doc) {
		if (!doc || !stageWin || stageWin.closed || doc === written) return;
		paint(doc);
	}
	function onMsg(e) {
		// Only ever act on messages from OUR Stage — `e.source` must be the exact
		// handle we opened (unforgeable). Same-origin popup → permissive
		// targetOrigin on sends; trust rides on the handle check.
		if (!stageWin || e.source !== stageWin) return;
		const d = e.data || {};
		if (d.stage === 'ready') {
			ready = true;
			show(getIndex?.() ?? 0);
			onChange?.(stageWin);
		} else if (d.stage === 'closed') {
			teardown();
			onLost?.();
		}
	}
	function teardown() {
		ready = false;
		written = '';
		if (stageWin) {
			window.removeEventListener('message', onMsg);
			stageWin = null;
		}
		onChange?.(null);
	}
	function close() {
		if (stageWin && !stageWin.closed) {
			try {
				stageWin.close();
			} catch {
				/* gone */
			}
		}
		teardown();
	}
	function toggle() {
		if (stageWin && !stageWin.closed) {
			close();
			return;
		}
		// Must open from the user gesture (popup-blocker-safe).
		const win = window.open('', 'lattice-stage', 'width=1280,height=720');
		if (!win) return; // blocked — leave the toggle off
		stageWin = win;
		ready = false;
		written = '';
		window.addEventListener('message', onMsg);
		paint(HOLDING);
		written = ''; // the holding page is not a deck — the real doc must still land
		autoPlaceStage(win).then((r) => onPlaced?.(r)).catch(() => {});
		const doc = getDoc?.();
		if (doc) paint(doc);
	}
	function isOpen() {
		return !!(stageWin && !stageWin.closed);
	}
	return { toggle, write, show, close, isOpen };
}
