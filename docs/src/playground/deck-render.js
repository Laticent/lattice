// deck-render.js — the Playground's live filmstrip: render a deck into ONE persistent iframe
// and keep it current, cheaply.
//
// Split out of deck-preview.js (2026-09-28) because only the Playground runs it. deck-preview.js
// is also the Studio's frame BUILDER (buildSrcdoc, the agents, the print sheet), and everything
// in one module ships in one chunk: the Playground-only controller below sat in the Studio's
// eager bundle, and the virtual list would have added more. The builder stays shared; the
// controller lives here and loads only with the Playground.
//
// Four write paths, cheapest first:
//   · PATCH   — replace only the sections whose HTML changed (patchSections);
//   · RESTYLE — a theme or mode flip swaps the stylesheet and the sections in place
//               (restyleDocument);
//   · WINDOW  — the VIRTUAL filmstrip mounts the slides in view and returns the rest to
//               placeholders as the reader scrolls (attachVirtual / syncVirtual / mountAround);
//   · WRITE   — a new srcdoc, only when the document's shape or assets change (renderDeck).
import remoteRef from '../../../lib/core/remote-ref.js';
import { webPolicySig } from '../../../lib/core/subresource-csp.mjs';
import { SWAP_REFLOW, sectionSwapKind } from '../../../lib/core/swap-kind.mjs';
import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { buildSrcdoc, docStyleText } from './deck-preview.js';
import { LV_ATTR, placeholderOf, SLIDE_SELECTOR, splitSections, virtualHtml, visibleRange, windowRange, withIndex } from './preview-virtual.js';

// Patch only the <section> nodes whose HTML changed. Returns true on success
// (a live .lattice was found), false to signal the caller to fall back to a full
// write. `prev`/`next` are arrays of per-slide HTML strings (splitSections).
export function patchSections(frame, next, prev) {
	const doc = frame.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!lattice) return false;
	const cur = lattice.querySelectorAll(SLIDE_SELECTOR);
	// SAY WHICH KIND OF SWAP THIS IS, BEFORE THE WRITE — the same contract
	// `patchSlideBody` carries in single-slide-render.ts, and for the same reason: the
	// runtime holds a rendered diagram while an edited fence re-renders, and only the
	// caller knows whether a replaced section is the SAME slide edited or a different one
	// arriving. Stamped before the write, because the runtime reads it from the observer
	// callback that write triggers. See adoptOutgoingDiagrams in lib/runtime/index.js.
	//
	// This used to answer "did the slide COUNT change?", which is not the question. Equal
	// counts are what a reorder and a same-length deck paste both have, and both were
	// stamped `in-place` — one slide's diagram into another slide's box, the exact defect
	// the stamp exists to stop. `sectionSwapKind` asks what an edit actually is: exactly
	// one section's HTML changed. See lib/core/swap-kind.mjs.
	const kind = next.length !== cur.length ? SWAP_REFLOW : sectionSwapKind(prev || [], next);
	// A VIRTUAL filmstrip (preview-virtual.js) keeps most slides as placeholders. A changed
	// slide stays what it was — a placeholder is replaced by the new slide's placeholder, a
	// mounted slide by the new slide — so an edit never mounts slides nobody is looking at.
	const range = mountedRange(cur, lattice);
	if (next.length !== cur.length) {
		lattice.setAttribute('data-lattice-swap', kind);
		// Slide added/removed: rebuild the filmstrip body only — no script re-eval;
		// the runtime/Mermaid/FIT/SYNC agents persist and re-process.
		lattice.innerHTML = range ? next.map((sec, i) => (i >= range.lo && i <= range.hi ? withIndex(sec, i) : placeholderCached(sec))).join('\n') : next.join('\n');
	} else {
		const p = prev || [];
		// STAMP ONLY WHEN A WRITE WILL FOLLOW. The runtime reads this once and clears it, so
		// a stamp with no mutation behind it is never consumed — it just stands there for
		// whatever burst comes next to read. Set it on the first section that will actually
		// be replaced rather than before the loop, where a section whose HTML parses to no
		// element child would leave `in-place` latched having written nothing.
		let stamped = false;
		for (let i = 0; i < next.length; i++) {
			if (p[i] === next[i]) continue;
			const holder = doc.createElement('div');
			holder.innerHTML = !range ? next[i] : cur[i]?.hasAttribute(LV_ATTR) ? placeholderCached(next[i]) : withIndex(next[i], i);
			const fresh = holder.firstElementChild;
			if (fresh && cur[i] && !stamped) {
				lattice.setAttribute('data-lattice-swap', kind);
				stamped = true;
			}
			if (fresh && cur[i]) lattice.replaceChild(fresh, cur[i]);
		}
	}
	const w = frame.contentWindow;
	if (w?.__latticeTag) w.__latticeTag();
	if (w?.__latticeFit) w.__latticeFit();
	return true;
}

// Restyle a live document in place: the `#lattice-doc` stylesheet AND every section, in one
// synchronous task (so no frame paints the new theme over the old sections, or the reverse).
// The sections are all replaced, not diffed — a theme can change engine output anywhere,
// and a full replacement is what tells the runtime every slide is new (`SWAP_REFLOW`).
// Returns false when there is no live document to restyle; the caller then writes one.
export function restyleDocument(frame, sections, styleText) {
	const doc = frame.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	const styleEl = doc?.getElementById('lattice-doc');
	if (!lattice || !styleEl) return false;
	// textContent, never markup: a `</style>` in the text cannot end the element here, and
	// `docStyleText` already ran the engine sheet through `sanitizeStyleText`, per HARD RULE #22.
	styleEl.textContent = styleText;
	lattice.setAttribute('data-lattice-swap', SWAP_REFLOW);
	const range = mountedRange(lattice.querySelectorAll(SLIDE_SELECTOR), lattice);
	lattice.innerHTML = range ? sections.map((sec, i) => (i >= range.lo && i <= range.hi ? withIndex(sec, i) : placeholderCached(sec))).join('\n') : sections.join('\n');
	const w = frame.contentWindow;
	if (w?.__latticeTag) w.__latticeTag();
	if (w?.__latticeFit) w.__latticeFit();
	return true;
}

// ── The virtual filmstrip controller ─────────────────────────────────────────────
// The frame holds every slide as a <section>, but only the ones in view (plus an overscan)
// are REAL; the rest are placeholders — the slide's own open tag, empty (preview-virtual.js).
// These functions move that window as the reader scrolls. They run in the PARENT, on the
// sanitized per-slide strings `renderDeck` keeps in its state, so every byte that reaches the
// frame has been through the sanitizer (HARD RULE #22) exactly as the patch path's have.

// Placeholders are rebuilt on every count change and every scroll that unmounts a slide, from
// strings that rarely change between renders — so keep them. Bounded, and dropped whole: a
// cache miss costs one walk of one slide's HTML.
const placeholderCache = new Map();
function placeholderCached(sec) {
	let ph = placeholderCache.get(sec);
	if (ph === undefined) {
		if (placeholderCache.size > 4000) placeholderCache.clear();
		ph = placeholderOf(sec);
		placeholderCache.set(sec, ph);
	}
	return ph;
}

/** The inclusive range of REAL sections, or null for a document that is not virtual (no
 *  `data-lv` on the filmstrip and no placeholder in it). A virtual deck short enough to be
 *  fully mounted still answers with a range, so a slide typed onto its end is windowed too. */
function mountedRange(cur, lattice) {
	let lo = -1;
	let hi = -1;
	let virtual = !!lattice?.hasAttribute?.('data-lv');
	for (let i = 0; i < cur.length; i++) {
		if (cur[i].hasAttribute(LV_ATTR)) virtual = true;
		else {
			if (lo < 0) lo = i;
			hi = i;
		}
	}
	if (!virtual) return null;
	return lo < 0 ? { lo: 0, hi: -1 } : { lo, hi };
}

// How many slides to keep mounted on each side of the view. A move is TRIGGERED when the slide
// one past the view is not mounted (NEED), and then mounts three ahead (MOUNT), so a steady
// scroll pays a mount every few slides rather than on every one: each mount costs a runtime
// pass over the document, whatever it adds. UNMOUNT only five behind (KEEP), so scrolling back
// and forth over a boundary does not churn the same slides in and out.
const NEED_OVERSCAN = 1;
const MOUNT_OVERSCAN = 3;
const KEEP_OVERSCAN = 5;
// Scroll seek: a scroll crossing the viewport in under this many ms is a fling, not reading.
const SEEK_VIEWPORT_MS = 150;
// …and a fling that stops (no frame for this long) mounts where it landed.
const SEEK_REST_MS = 90;

/**
 * Mount `[lo, hi]` and unmount everything outside `[keepLo, keepHi]`, in ONE task, so a paint
 * never shows half a window. Stamped `reflow` before the writes — never `in-place`: a mount is
 * a different slide arriving, and `in-place` would let the runtime hand one slide's diagram to
 * another (lib/core/swap-kind.mjs). Returns whether anything changed.
 */
function applyWindow(frame, sections, lo, hi, keepLo, keepHi) {
	const doc = frame.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!lattice || !sections) return false;
	const cur = lattice.querySelectorAll(SLIDE_SELECTOR);
	if (cur.length !== sections.length || !mountedRange(cur, lattice)) return false;
	let changed = false;
	let unfitted = false;
	const swap = (i, html) => {
		if (!changed) {
			lattice.setAttribute('data-lattice-swap', SWAP_REFLOW);
			changed = true;
		}
		const holder = doc.createElement('div');
		holder.innerHTML = html;
		const fresh = holder.firstElementChild;
		if (!fresh) return;
		// Hand the fit the element it replaces already had (a placeholder is fitted exactly like
		// its slide), so a mount costs no whole-filmstrip fit pass: that loop visits every slide.
		const old = cur[i];
		if (old.__lfT) {
			fresh.style.transformOrigin = 'top left';
			fresh.style.transform = old.style.transform;
			fresh.style.marginBottom = old.style.marginBottom;
			fresh.__lfT = old.__lfT;
			fresh.__lfM = old.__lfM;
		} else unfitted = true;
		lattice.replaceChild(fresh, old);
	};
	for (let i = 0; i < cur.length; i++) {
		const ph = cur[i].hasAttribute(LV_ATTR);
		if (ph && i >= lo && i <= hi) swap(i, withIndex(sections[i], i));
		else if (!ph && (i < keepLo || i > keepHi)) swap(i, placeholderCached(sections[i]));
	}
	// Whatever was cached about this window is stale now — the next scroll re-reads it.
	if (frame.contentWindow) frame.contentWindow.__lvGeom = null;
	if (unfitted) frame.contentWindow?.__latticeFit?.();
	return changed;
}

/**
 * Bring the window to wherever the frame is scrolled. Geometry is read from the sections
 * themselves (placeholders are sized exactly like slides), so it needs no knowledge of the
 * scale, the gap or the frame's padding.
 *
 * Most scroll frames move nothing: the view is still inside the mounted run. So the first
 * pass caches the geometry (slide 0's document top, the pitch) and the mounted run on the
 * frame's window, and every later frame answers from arithmetic alone — no query, no rect,
 * so no forced layout. The cache is keyed on the section list and the viewport size (a
 * resize re-fits, a render replaces the list), and every window move drops it.
 */
export function syncVirtual(frame, state) {
	const sections = state?.lastSections;
	const win = frame?.contentWindow;
	if (!win || !sections?.length) return false;
	const g = win.__lvGeom;
	if (g && g.sections === sections && g.w === win.innerWidth && g.h === win.innerHeight) {
		const vis = visibleRange(win.scrollY, win.innerHeight, g.top, g.pitch, sections.length);
		if (!vis) return false;
		const need = windowRange(vis.first, vis.last, sections.length, NEED_OVERSCAN);
		// Unmount lazily: a run up to MOUNT past KEEP is left alone, so trimming one slide off
		// the back never costs a move of its own — the next mount trims it.
		const slack = windowRange(vis.first, vis.last, sections.length, KEEP_OVERSCAN + MOUNT_OVERSCAN);
		const settled = g.contiguous && need.lo >= g.lo && need.hi <= g.hi && g.lo >= slack.lo && g.hi <= slack.hi;
		if (settled) return false;
	}
	const lattice = frame.contentDocument?.querySelector('.lattice');
	if (!lattice) return false;
	const cur = lattice.querySelectorAll(SLIDE_SELECTOR);
	if (cur.length !== sections.length) return false;
	const now = mountedRange(cur, lattice);
	if (!now) return false;
	const r0 = cur[0].getBoundingClientRect();
	const pitch = cur.length > 1 ? cur[1].getBoundingClientRect().top - r0.top : r0.height;
	const top = win.scrollY + r0.top;
	const vis = visibleRange(win.scrollY, win.innerHeight, top, pitch, cur.length);
	if (!vis) return false;
	const mount = windowRange(vis.first, vis.last, cur.length, MOUNT_OVERSCAN);
	const keep = windowRange(vis.first, vis.last, cur.length, KEEP_OVERSCAN);
	const changed = applyWindow(frame, sections, mount.lo, mount.hi, keep.lo, keep.hi);
	// Re-read the run after a move (the old NodeList holds the replaced nodes). This runs only
	// when something mounted, never on the settled frames the cache answers.
	const after = changed ? lattice.querySelectorAll(SLIDE_SELECTOR) : cur;
	const run = changed ? mountedRange(after, lattice) : now;
	const contiguous = !!run && run.hi >= run.lo && isContiguous(after, run);
	const runLo = run?.lo ?? 0;
	const runHi = run?.hi ?? -1;
	win.__lvGeom = { sections, w: win.innerWidth, h: win.innerHeight, top, pitch, lo: runLo, hi: runHi, contiguous };
	return changed;
}

/** Whether every section in the mounted run `[lo, hi]` is real (no placeholder hole). */
function isContiguous(cur, run) {
	for (let i = run.lo; i <= run.hi; i++) if (cur[i].hasAttribute(LV_ATTR)) return false;
	return true;
}

/** Mount the slides around `index` before something scrolls to it (a step, a caret jump), so
 *  the reader lands on a real slide rather than on a placeholder that fills in a frame later. */
export function mountAround(frame, state, index) {
	const n = state?.lastSections?.length || 0;
	const mount = windowRange(index, index, n, MOUNT_OVERSCAN);
	if (!mount) return false;
	// Keep what is mounted now as well: the scroll that follows passes through it.
	const lat = frame?.contentDocument?.querySelector('.lattice');
	const cur = lat?.querySelectorAll(SLIDE_SELECTOR);
	const now = cur ? mountedRange(cur, lat) : null;
	const keepLo = now && now.hi >= now.lo ? Math.min(now.lo, mount.lo) : mount.lo;
	const keepHi = now && now.hi >= now.lo ? Math.max(now.hi, mount.hi) : mount.hi;
	return applyWindow(frame, state.lastSections, mount.lo, mount.hi, keepLo, keepHi);
}

/**
 * Follow the frame's scroll and size. Once per document (a new srcdoc is a new window), and
 * throttled to one window move per frame. `getState` is read on every event, not captured:
 * the host replaces its state object on a fresh render. `onChange` hears, 120ms after the
 * scroll comes to rest, that something mounted or unmounted — the host's overlays rebind there.
 */
export function attachVirtual(frame, getState, onChange) {
	const win = frame?.contentWindow;
	if (!win || win.__lvAttached) return;
	win.__lvAttached = true;
	let raf = 0;
	let settle = 0;
	let seekRest = 0;
	let lastY = win.scrollY;
	let lastT = win.performance.now();
	// The host's rebind (overlays, chart detail, scenes) re-queries the whole filmstrip, so it
	// runs once the scroll comes to rest, not on every slide that passes mid-flight.
	const settled = () => {
		settle = 0;
		onChange?.();
	};
	const sync = () => {
		if (!syncVirtual(frame, getState())) return;
		if (settle) win.clearTimeout(settle);
		settle = win.setTimeout(settled, 120);
	};
	// SCROLL SEEK (react-virtuoso's name for it): a fling that crosses the viewport faster than
	// SEEK_VIEWPORT_MS passes slides no one can read, and mounting each one costs a runtime pass.
	// While it lasts, the placeholders ride through and nothing mounts; once the speed drops
	// under the line — or the scroll stops for SEEK_REST_MS — the window catches up in one move.
	const tick = () => {
		raf = 0;
		const now = win.performance.now();
		const dt = Math.max(1, now - lastT);
		const speed = Math.abs(win.scrollY - lastY) / dt;
		lastY = win.scrollY;
		lastT = now;
		if (speed > win.innerHeight / SEEK_VIEWPORT_MS) {
			if (seekRest) win.clearTimeout(seekRest);
			seekRest = win.setTimeout(() => {
				seekRest = 0;
				lastT = win.performance.now();
				sync();
			}, SEEK_REST_MS);
			return;
		}
		sync();
	};
	const schedule = () => {
		if (!raf) raf = win.requestAnimationFrame(tick);
	};
	win.addEventListener('scroll', schedule, { passive: true });
	win.addEventListener('resize', schedule);
	schedule();
}

// The reader's place in a live filmstrip: the first section whose foot is still on screen,
// and the fraction of it scrolled past. Null at the top (nothing to restore) or with no
// live document.
function readAnchor(frame) {
	try {
		const win = frame.contentWindow;
		const secs = frame.contentDocument?.querySelector('.lattice')?.querySelectorAll(SLIDE_SELECTOR);
		if (!win || !secs?.length || !(win.scrollY > 0)) return null;
		for (let i = 0; i < secs.length; i++) {
			const r = secs[i].getBoundingClientRect();
			// The AUTHORED slide too (`data-lattice-slide`, `3` or `3.2` on a split page): a size
			// change can split a slide into pages, and then index N names a different slide.
			if (r.bottom > 0) return { index: i, frac: r.height ? Math.max(0, -r.top) / r.height : 0, slide: (secs[i].getAttribute('data-lattice-slide') || '').split('.')[0] };
		}
	} catch {
		/* a frame mid-navigation */
	}
	return null;
}

// Render a deck into a persistent iframe: patch when the live document already
// matches this render's signature, else a full srcdoc write. `state` is opaque
// host-held bookkeeping ({ frameSig, lastSections }) — pass it back each call.
// `sig` must capture everything baked into the document outside the <section>s
// (theme/mode/size, and for the studios the live token/component CSS). `fresh`
// forces a full write (deck swap → reset runtime/Mermaid state).
export function renderDeck({ frame, html, css, mode, geom, sig, state, fresh = false, restyleKey = /** @type {string|null} */ (null), virtual = false, ...opts }) {
	const st = state || { frameSig: '', lastSections: null };
	// INCREMENTAL SANITIZE (the typing hot path). #616 T-CONTENT still requires every
	// section reach the frame sanitized — but DOMPurify over the WHOLE deck is ~half
	// the per-keystroke render cost on a big deck and grows with slide count (a
	// 50-slide edit spends ~28ms here), enough to push the render past the frame
	// scheduler's 50ms heavy backstop into the 120ms-coalesce regime. So split the
	// RAW engine HTML per-section and sanitize only the sections whose raw HTML
	// changed, reusing the prior render's sanitized output for the rest (cache in
	// `state`). Per-section sanitize is byte-identical to whole-deck sanitize —
	// sections are independent and the allowlisted <section> boundaries are preserved
	// — locked by deck-preview.sanitize-cache.test.ts.
	// Web images the reader has not allowed become placeholders on BOTH paths (buildSrcdoc does
	// it for the write path; the patch path below would otherwise swap in the raw address).
	const web = remoteRef.blockWebImages(html, opts.webOrigins || []);
	html = web.html;
	const rawSections = splitSections(html);
	const prevCache = st.sanitizeCache instanceof Map ? st.sanitizeCache : null;
	const nextCache = new Map();
	const sections = rawSections.map((raw) => {
		let clean = prevCache ? prevCache.get(raw) : undefined;
		if (clean === undefined) clean = sanitizeSlideHtml(raw);
		nextCache.set(raw, clean);
		return clean;
	});
	st.sanitizeCache = nextCache;
	// Fold the asset-need flags into the signature: buildSrcdoc injects the KaTeX
	// stylesheet / Mermaid runtime only when the deck has math / a mermaid fence, so
	// a transition (a deck GAINS or LOSES either) must force a full srcdoc rewrite —
	// a section-only patch would leave the newly-needed asset uninjected. Both markers
	// are class names DOMPurify keeps and live INSIDE sections, so the sanitized
	// per-section array carries them identically to the old whole-sanitize check.
	const hasMermaid = sections.some((s) => s.indexOf('language-mermaid') !== -1);
	const hasKatex = sections.some((s) => s.indexOf('katex') !== -1);
	const hasDagre = sections.some((s) => s.indexOf('data-sc-transitions') !== -1);
	const contentSig =
		sig +
		(hasKatex ? 'K' : '') +
		(hasMermaid ? 'M' : '') +
		// Third flag, same reason as the other two: buildSrcdoc injects the dagre engine
		// only for a deck that has a drawn state chart, so a deck that GAINS or LOSES one
		// must force a full srcdoc rewrite. A section-only patch would leave a
		// newly-typed branching machine without its engine — laid out as a column, with
		// nothing to say why.
		(hasDagre ? 'D' : '') +
		// The web half of the policy lives in <head>, which a patch never rewrites: the allowed
		// origins AND whether each keeps its subdomain wildcard, which an edit that adds a refused
		// subdomain reference takes away (lib/core/subresource-csp.mjs `webPolicySig`).
		`|W:${webPolicySig([...(opts.webOrigins || [])].sort(), web.blocked)}`;
	const canPatch =
		!fresh &&
		contentSig === st.frameSig &&
		frame.contentDocument?.querySelector('.lattice');
	let patched = false;
	let restyled = false;
	if (canPatch) patched = patchSections(frame, sections, st.lastSections);
	// RESTYLE path (a palette or light/dark flip). The caller's `restyleKey` names what the
	// document's SHAPE depends on — the slide box — and the flags above name its injected
	// assets; when only the rest of the signature moved (the theme, the mode), the live
	// document can take the new look in place: swap the `#lattice-doc` stylesheet and every
	// section in one task, so one paint shows the new theme on the new sections. A full
	// srcdoc write here used to hide the whole deck until the new document fit and its fonts
	// settled, and threw an Edit-view reader who was reading slide 6 back to slide 1.
	//
	// NOT with a Mermaid fence: the runtime caches each diagram's SVG with its theme colors
	// baked in (lib/runtime/index.js, "Theme-change caveat"), so a restyled document would
	// keep the old palette in its diagrams. A fresh document is the only honest reset there.
	// …and the web references in the engine CSS. The document's security policy, in <head>,
	// is built from them (`buildSrcdoc`'s `webRefsInCss(css)`), and a restyle swaps the CSS
	// but never the policy — so a theme whose sheet reaches a different web host is a write.
	const cssWeb = remoteRef.webRefsInCss(css).map((b) => String(b?.origin ?? b)).sort().join(' ');
	const restyleSig = restyleKey == null ? null : `${restyleKey}${contentSig.slice(sig.length)}|C:${cssWeb}`;
	// ONLY the document the last write produced. Right after a write, `contentDocument` is
	// still the OUTGOING document until the new one loads; restyling that one left the
	// incoming document on the old theme, and every later keystroke patched on top of it,
	// so the stale theme stuck until the next theme or size change. Found by an independent
	// checker, reproduced in Chromium. A write in flight falls through to a new write.
	const current = frame.contentDocument?.documentElement?.getAttribute('data-lattice-write') === String(st.writeId ?? '');
	if (!patched && !fresh && current && restyleSig != null && restyleSig === st.restyleSig && !hasMermaid) {
		restyled = restyleDocument(frame, sections, docStyleText({ css, mode, geom, ...opts }));
		if (restyled) patched = true;
	}
	let anchor = null;
	if (!patched) {
		// Where the reader is in the document about to be replaced — the first slide still on
		// screen, and how far into it — so the host can open the new one at the same place
		// instead of at slide 1. Read only here, on the rare full write, never per keystroke —
		// and never on a `fresh` write, which is a DIFFERENT deck and opens at its start.
		anchor = fresh ? null : readAnchor(frame);
		// WRITE path (first render / theme·mode·size change / deck swap) — NOT the hot
		// path. Sanitize the whole document so buildSrcdoc sees any inter/trailing
		// content splitSections drops, keeping the written srcdoc byte-identical.
		// Stamp the document with this write's id, so the restyle path can tell it from the
		// one it replaces while it loads.
		st.writeId = (st.writeId || 0) + 1;
		// VIRTUAL: write only the slides around where the reader will be (the anchor, or the top)
		// as real sections, every other slide as its placeholder. The first paint then costs a
		// window, not a deck — a 522-slide deck took 14s to show slide 1 fully mounted. The
		// builder is told what the WHOLE deck needs, so no asset or policy decision is made from
		// the window alone. `attachVirtual` takes over the window once the document loads.
		let docHtml = html;
		let deck = null;
		if (virtual && sections.length > 0) {
			const at = anchor?.index ?? 0;
			const w = windowRange(at, at + 1, sections.length, MOUNT_OVERSCAN);
			// `data-lv` on the filmstrip marks the document virtual for its whole life.
			docHtml = virtualHtml(html, (i) => i >= w.lo && i <= w.hi).replace(/(<[a-z]+)((?:\s[^>]*)?\sclass="(?:[^"]*\s)?lattice(?:\s[^"]*)?")/i, '$1 data-lv=""$2');
			deck = { katex: hasKatex, mermaid: hasMermaid, dagre: hasDagre, blocked: web.blocked };
		}
		frame.srcdoc = buildSrcdoc({ html: sanitizeSlideHtml(docHtml), css, mode, geom, ...opts, ...(deck ? { deck } : {}) }).replace('<html ', `<html data-lattice-write="${st.writeId}" `);
	}
	st.frameSig = contentSig;
	st.restyleSig = restyleSig;
	st.lastSections = sections;
	return { state: st, count: sections.length, patched, restyled, anchor };
}

export default { renderDeck, patchSections, restyleDocument, syncVirtual, mountAround, attachVirtual };
