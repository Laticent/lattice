/**
 * PREVIEW FONT GATE — hold a preview document's reveal until its own faces land.
 *
 * WHY THIS EXISTS
 * A preview document (the Studio filmstrip's srcdoc, the Stage window) builds its
 * own `@font-face` set and every one of them is `font-display: swap`
 * (tools/build-css.js emits the descriptor). So the document lays out once against
 * FALLBACK metrics, paints, and re-solves when the real face arrives. Nothing in
 * the engine reports it: the slide box is pinned to its `@size`, so no box
 * overflows and no fit channel fires — the text simply moves, once, after the
 * reader is already looking at it.
 *
 * Measured on the real Studio (`/playground/?view=edit`, a `list` + `cards-grid`
 * deck, faces served over a modeled link): the preview frame showed a reader TWO
 * layouts, at 197ms and 517ms, and the worst text run moved 330.3px horizontally
 * and 50.7px vertically between them, with one line box appearing. #2095 removed
 * this for matrix-grid's columns alone, by pinning `table-layout: fixed` at wide;
 * this removes the cause for every text-metric-dependent layout at once.
 *
 * THE GATE. Every preview builder already hides its content until it has scaled
 * it — `.lattice{visibility:hidden}` in deck-preview.js, `#latt-stage` in
 * stage-window.js. The content is therefore ALREADY invisible at the moment the
 * fallback solve happens; the only defect is that the reveal does not wait. This
 * emits the agent that makes it wait, and publishes ONE promise
 * (`window.__latticeFontsReady`) so each builder keeps its own reveal mechanics
 * and there is still one definition of "the faces are ready".
 *
 * WHY `document.fonts.ready` AND NOT `settleFonts` (lib/core/font-settle.js).
 * They answer different questions and the difference is 13 downloads. `settleFonts`
 * force-loads EVERY DECLARED face, which is right for its callers — an exporter
 * rasterizing off-screen slides, a boot overflow sweep — because a face a
 * not-yet-painted slide needs is not pending yet, so `ready` would resolve without
 * it. A REVEAL has the opposite requirement: it must wait for the faces this
 * layout actually uses and NOT for the thirteen the deck never touches (the engine
 * declares 17; a plain deck paints four). Forcing all 17 would hold the reveal on
 * Caveat and Shantell Sans to show a deck set in Outfit.
 *
 * THE FLUSH IS LOAD-BEARING, and it is the trap this file exists to record.
 * A face is fetched only when text using it is first laid out, so `fonts.ready`
 * read before layout has run resolves IMMEDIATELY — nothing is pending yet — and
 * the gate certifies a document whose faces have not been requested. Reading
 * `documentElement.offsetHeight` forces the layout that puts them in flight, so
 * `ready` then has something to wait for. Same race `lib/runtime/index.js` names
 * at its boot sweep, arrived at from the other side.
 *
 * IT NEVER HOLDS FOREVER. A dead face fetch must cost a shift, never a preview
 * that does not appear. The mechanism is a one-way latch plus an unconditional
 * backstop timer — not a `Promise.race`: whichever of the two fires first wins and
 * the other is a no-op, and the timer is armed OUTSIDE the try, so it releases the
 * reveal even on a host whose `document.fonts` throws on access.
 * The worst case is exactly today's behavior; the common case is no shift at all.
 *
 * WHAT THIS DOES NOT COVER, stated plainly: it gates a DOCUMENT'S FIRST REVEAL.
 * `renderDeck` patches sections into a live document rather than rewriting it on
 * every edit, and that document's gate has long since resolved — so an edit that
 * introduces a face the document has not loaded yet (typing a `finish: sketch`
 * front-matter, say) can still swap visibly. That is the pre-existing behavior and
 * a much narrower window: the slide is already on screen and the reader is the one
 * who just changed it, rather than a page assembling itself in front of them. A
 * per-patch gate would mean hiding content the author is actively editing, which is
 * a worse trade. Revisit only if a real edit path is found where it reads as a
 * defect.
 */

/**
 * How long a reveal may wait for faces before showing the fallback solve anyway.
 *
 * MEASURED, not picked. On the real Studio with the faces served over a modeled
 * link, the frame's own settle completed 320ms after first layout; on a warm cache
 * it is under one frame. 1500ms leaves ~4.7x headroom over the measured cold case
 * while capping what a reader can ever wait at well under the ~2s a page-load
 * stall becomes noticeable. Deliberately NOT `lib/runtime`'s 2000ms: that bound
 * governs a re-measure nobody is watching, where being late costs nothing, and
 * this one governs pixels a reader is waiting on.
 */
export const PREVIEW_FONT_GATE_MS = 1500;

/**
 * JS source for the gate agent, to be injected into a preview document as its own
 * `<script>` BEFORE any script that reveals content.
 *
 * Publishes `window.__latticeFontsReady`, a promise that always resolves (never
 * rejects) once the document's faces have settled or `timeoutMs` has passed.
 * A revealer hangs off it with `.then(reveal, reveal)` and MUST fall back to
 * revealing immediately when the property is absent, so a document that somehow
 * ships without this agent still paints.
 *
 * @param {number} [timeoutMs] cap on the wait. Defaults to PREVIEW_FONT_GATE_MS.
 * @returns {string} self-contained IIFE source, no closure over anything.
 */
export function fontGateAgent(timeoutMs = PREVIEW_FONT_GATE_MS) {
	const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : PREVIEW_FONT_GATE_MS;
	return [
		'(function(){',
		'  var settled=false, release=null;',
		'  var p=new Promise(function(res){release=res;});',
		// The flag exists for POLLING revealers. `single-slide-render.ts` reveals from
		// the parent on an interval whose lifetime ends at first paint — before the
		// faces land — so a promise alone would strand the frame hidden, which is the
		// "blank" failure that file's own comments were written around. It reads the
		// flag to decide, and arms the promise to be woken. One agent serves both.
		'  function go(){if(settled)return;settled=true;window.__latticeFontsSettled=true;release();}',
		// PUBLISHED SYNCHRONOUSLY, before any measurement — this is the half that makes
		// the agent safe to place in <head>, and it is not a stylistic choice. A parent
		// that polls decides "is there a gate here?" by whether the flag EXISTS, and
		// `.lattice` is parsed long before an end-of-body script runs. Measured: with
		// the agent at the end of <body>, the landing page's frame was revealed at
		// 117ms against a font settle at ~520ms, because the poll read `undefined`,
		// concluded "no gate", and revealed — a fix that was wired correctly and did
		// nothing.
		'  window.__latticeFontsSettled=false;',
		'  window.__latticeFontsReady=p;',
		// The unconditional backstop. It is NOT redundant with the race below: the
		// race lives inside a try, and a host whose `document.fonts` throws on
		// access would otherwise never resolve the promise and never reveal.
		'  setTimeout(go,' + ms + ');',
		'  function start(){',
		'    try{',
		'      if(document.fonts&&document.fonts.ready){',
		// Force the layout that puts the needed faces in flight — see the header.
		'        void document.documentElement.offsetHeight;',
		'        document.fonts.ready.then(go,go);',
		'      }else{go();}',
		'    }catch(e){go();}',
		'  }',
		// Deferred to DOMContentLoaded so the flush above measures the REAL document.
		// Together with the synchronous publish, this makes the agent placement-
		// independent: <head> gets the flag early enough for a polling parent, and the
		// measurement still happens against parsed content rather than an empty shell.
		'  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",start);}else{start();}',
		'})();',
	].join('\n');
}

/**
 * The one-line idiom a revealer uses, so the "absent agent still paints" fallback
 * is written once rather than copied per builder.
 *
 * @param {string} fnName name of a zero-arg function already defined in the
 *   document that performs the reveal.
 * @returns {string} source that calls it once the faces are ready.
 */
export function onFontsReady(fnName) {
	// `fnName` is interpolated verbatim into source that RUNS in a same-origin,
	// un-sandboxed preview document. Both call sites pass literals today, so nothing
	// is exploitable — but none of HARD RULE #22's four gate arms can see this module
	// (it assembles no document, embeds no `<style>`, re-wraps no CSS, and is not in
	// `lib/runtime`), so the class is closed here rather than left to call-site
	// discipline. `timeoutMs` is already safe by `Math.round` of a checked number.
	if (!/^[A-Za-z_$][\w$]*$/.test(String(fnName))) {
		throw new TypeError(`onFontsReady: expected a plain identifier, got ${JSON.stringify(fnName)}`);
	}
	return (
		'if(window.__latticeFontsReady&&window.__latticeFontsReady.then){' +
		'window.__latticeFontsReady.then(' + fnName + ',' + fnName + ');' +
		'}else{' + fnName + '();}'
	);
}
