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
 * How long the first reveal may wait for the adaptive `image` probes (lib/transformers/
 * image-adaptive.js) before showing the provisional composition anyway.
 *
 * An image slide's card takes the photo's aspect, and in a browser the aspect is known only once
 * the photo loads, so a reveal that does not wait shows the Clean floor and then re-lays out:
 * measured in the Studio with the picture held 2.5 s, the panel went 605x504 -> 552x345 and the
 * heading moved 18px after the slide was on screen (followup 2358-p2). The cap is set by that
 * case: 2.5 s of held request plus the ~1 s the Studio took to reach first paint on the same run,
 * rounded up. Armed when the faces settle, and only on a document that HAS a probe
 * pending — a deck with no web or blob image pays nothing. Past the cap the slide reveals, and a
 * probe that lands later fires `lattice:layout-late` so a revealer can fade through the relayout.
 */
export const PREVIEW_IMAGE_GATE_MS = 4000;

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
 * @param {number} [imageTimeoutMs] cap on the adaptive-image wait, PREVIEW_IMAGE_GATE_MS by
 *   default; `0` skips it (a whole-deck document, where one slide's photo must not hold the rest).
 * @returns {string} self-contained IIFE source, no closure over anything.
 */
export function fontGateAgent(timeoutMs = PREVIEW_FONT_GATE_MS, imageTimeoutMs = PREVIEW_IMAGE_GATE_MS) {
	const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : PREVIEW_FONT_GATE_MS;
	// `0` turns the image wait OFF. A whole-deck document (the Playground filmstrip, the audience
	// Stage window) carries every slide's probe, so one slow photo on slide 30 would hold slide 1
	// blank; only the single-slide preview, where the photo IS the slide on screen, opts in.
	const imgMs = imageTimeoutMs === 0 ? 0 : Number.isFinite(imageTimeoutMs) && imageTimeoutMs > 0 ? Math.round(imageTimeoutMs) : PREVIEW_IMAGE_GATE_MS;
	return [
		'(function(){',
		'  var settled=false, release=null, timedOut=false, fontsDone=false;',
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
		// The font backstop ends the FONT wait only; the image wait below has its own cap.
		// A timeout says the READY PROMISE was slow, not that a face was. WebKit holds
		// `document.fonts.ready` until the document's other loads finish, so a slow photo kept it
		// pending with all 17 faces already loaded (measured in the Studio, WebKit 26), and the
		// landing faded the whole frame for a relayout that never came. So the backstop notes
		// whether any face was genuinely still loading; only then is a later arrival late.
		'  setTimeout(function(){try{timedOut=!document.fonts||document.fonts.status!=="loaded";}catch(e){timedOut=true;}fonts();},' + ms + ');',
		// IMAGES. Once the faces are in, wait for the adaptive image probes the runtime published
		// (lib/transformers/image-adaptive.js) — re-reading the list after each batch, because a
		// transform pass can add probes while earlier ones are in flight. Every probe settles on
		// load or error, and a cap armed on the FIRST pending batch bounds a probe that never does —
		// so a document with no probe arms no second timer and waits for nothing.
		'  var imgCap=false;',
		'  function images(){var P=window.__latticeImageProbes;if(!P||!P.length){go();return;}if(!imgCap){imgCap=true;setTimeout(go,' + imgMs + ');}var n=P.length;Promise.all(P).then(function(){if(P.length>n)images();else go();},go);}',
		'  function fonts(){if(fontsDone)return;fontsDone=true;' + (imgMs ? 'images();' : 'go();') + '}',
		// LATE FACES. When the backstop above revealed the document before its faces landed,
		// their arrival re-lays the text out in front of the reader. Say so, once, so a
		// revealer can mask it (single-slide-render fades the frame through the relayout).
		'  function late(){if(timedOut&&!window.__latticeFontsLate){window.__latticeFontsLate=true;try{window.dispatchEvent(new Event("lattice:fonts-late"));}catch(e){}}}',
		'  function start(){',
		'    try{',
		'      if(document.fonts&&document.fonts.ready){',
		// Force the layout that puts the needed faces in flight — see the header.
		'        void document.documentElement.offsetHeight;',
		'        document.fonts.ready.then(function(){late();fonts();},fonts);',
		'      }else{fonts();}',
		'    }catch(e){fonts();}',
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
