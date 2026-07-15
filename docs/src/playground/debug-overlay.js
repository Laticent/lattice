// debug-overlay.js — the layout DEBUG overlay for the live preview. Color-codes
// every box by its LAYOUT MODE (grid / flex / flow) and draws an inside-corner
// LABEL on each structural box (the slide, every grid/flex container, and their
// cells/tiles) reading a configurable set of "levers": identity · layout · size
// (default), plus optional class / box. A debugging aid, never exported.
//
// DRIVEN BY THE DECK. The engine stamps `data-debug` on each <section> from the
// deck's `debug:` front matter (or a per-slide `<!-- _debug -->`); this agent
// reads it. A viewer's toolbar/localStorage toggle can OVERRIDE per session via
// `opts.force` ('on' | 'off' | null=follow-the-deck). The engine strips
// `data-debug` from every EXPORT, so nothing here can reach a boardroom PDF.
// See engineering/decisions/2026-07-01-debug-bounding-boxes.md.
//
// ZERO LAYOUT IMPACT. Outlines use `outline` (painted, no layout box), never
// `border`. Labels live in ONE `pointer-events:none` overlay layer appended as a
// sibling of the deck content — OUTSIDE the measured tree — so they can never
// reflow a slide or perturb the Fit Spine's height math (#20). We deliberately do
// NOT use `position:relative` + `::after` on content boxes: that re-anchors
// absolutely-positioned descendants (badges, focus rings, pagination) and CSS
// `content:` cannot read a computed width/height anyway.
//
// RENDER-MODEL AGNOSTIC. Label POSITION comes from getBoundingClientRect (post
// every transform, so it lands right whether the filmstrip scales each <section>
// or the Studio scales the whole iframe); the SIZE lever reads offsetWidth/Height
// (the layout box, transform-invariant), so it reports the real intrinsic px on
// both paths without any scale arithmetic.

export const DEBUG_STYLE_ID = 'lattice-debug-style';
export const DEBUG_OVERLAY_ID = 'lattice-debug-overlay';
// The parent-hosted input capture surface (lives in the PARENT document, over the
// preview iframe — see applyDebug's hover-input block for why input can't sit inside
// a transform-scaled iframe on iOS).
export const DEBUG_CAPTURE_ID = 'lattice-debug-capture';

// What a label says. The default triad (identity · layout · size) answers "what is
// this box, how does it lay out, how big"; `verbose` adds the raw class list + box
// (padding/gap). These are the render order on the chip.
export const FACETS = ['identity', 'layout', 'size', 'class', 'box'];
const DEFAULT_FACETS = ['identity', 'layout', 'size'];
// The `debug:` VOCABULARY (front matter + per-slide `_debug`). ONE name per concept —
// no aliases, so there is nothing to second-guess. OFF is the default (absent or
// `off` → no overlay). Enable with an explicit REVEAL mode:
//   on-hover  → outlines always; a label appears when you hover (desktop) or press-and-hold (touch) a box
//   on-always → outlines + labels pinned on at once (the static map)
// Add `verbose` for the extra detail (class + box). There is deliberately NO bare
// `on` (it hid the mode).
const OFF_VALUES = new Set(['off']);
const ALWAYS_TOKENS = new Set(['on-always']);
const VERBOSE_TOKENS = new Set(['verbose']);

// Layout-mode → outline hue. Okabe-Ito CVD-safe blue/vermillion + a neutral gray
// for ordinary flow (deliberately low-emphasis so grid/flex containers pop). Every
// hue clears WCAG AA non-text contrast (>=3:1) over BOTH preview backgrounds
// (near-black #0c0c0c and light #e7e7ea) — verified in
// test/unit/playground/debug-overlay.test.js. The mode WORD also rides on the
// label, so the encoding is never color-only (CVD redundancy, #16-06 CVD doc).
export const LAYOUT_COLORS = Object.freeze({
	grid: '#0072b2', //   grid containers — blue
	flex: '#d55e00', //   flex containers — vermillion
	flow: '#6e6e6e', //   normal block/inline flow — neutral gray
});

/**
 * Does a deck's front matter turn debug on? Reads the leading `---`…`---` block for
 * a `debug:` key: absent or an off value → off; any other value (a reveal mode) → on.
 * Lets a surface seed its toggle's effective state without a render round-trip.
 */
export function deckDebugOn(source) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(source || ''));
	if (!m) return false;
	const line = /^\s*debug\s*:\s*(.*)$/m.exec(m[1]);
	if (!line) return false;
	const v = line[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
	return !OFF_VALUES.has(v);
}

/** getComputedStyle().display → one of grid | flex | flow. */
export function layoutMode(display) {
	const d = String(display || '');
	if (d === 'grid' || d === 'inline-grid') return 'grid';
	if (d === 'flex' || d === 'inline-flex') return 'flex';
	return 'flow';
}

/**
 * Resolve a section's `data-debug` value (+ a session override) to a config
 * `{ facets, reveal }`, or null when debug is off for this box.
 *   force==='off'          → always off.
 *   force==='on'           → on; use the deck's mode if it named one, else on-hover.
 *   force==null (follow)   → the deck's value decides (absent attr → off).
 * A `value` of null means the attribute is absent. Off is the default; the enable
 * modes are `on-hover` (default) and `on-always`, optionally `+ full`.
 */
export function resolveConfig(value, force) {
	if (force === 'off') return null;
	const has = value !== null && value !== undefined;
	const norm = has ? String(value).trim().toLowerCase() : null;
	if (force === 'on') return parseConfig(norm && !OFF_VALUES.has(norm) ? norm : '');
	// follow the deck: absent or an off value → off; anything else enables.
	if (!has || OFF_VALUES.has(norm)) return null;
	return parseConfig(norm);
}

// A reveal-mode value (+ optional `verbose`) → `{ facets, reveal }`. Empty or any
// unrecognized value defaults to `on-hover` with the standard triad, so a typo (or
// the removed bare `on`) still shows something useful — the lint gate flags it.
function parseConfig(norm) {
	const tokens = (norm || '').split(/[\s,]+/).filter(Boolean);
	const reveal = tokens.some((t) => ALWAYS_TOKENS.has(t)) ? 'always' : 'hover';
	const verbose = tokens.some((t) => VERBOSE_TOKENS.has(t));
	return { reveal, facets: verbose ? FACETS.slice() : DEFAULT_FACETS.slice() };
}

/**
 * The chip text for one box: the enabled facets, joined by ' · '. Pure over a
 * plain descriptor so it is fully unit-testable without a DOM.
 *   info = { identity, mode, gap, w, h, className, padding }
 */
export function facetLabel(info, facets) {
	const parts = [];
	for (const f of facets) {
		if (f === 'identity' && info.identity) parts.push(info.identity);
		else if (f === 'layout') parts.push(info.gap ? `${info.mode} gap:${info.gap}` : info.mode);
		else if (f === 'size') parts.push(`${info.w}×${info.h}`);
		else if (f === 'class' && info.className) parts.push(`.${info.className.trim().split(/\s+/).join('.')}`);
		else if (f === 'box' && (info.padding || info.gap)) parts.push(`pad:${info.padding || 0} gap:${info.gap || 0}`);
	}
	return parts.join(' · ');
}

// The static stylesheet: outline color keyed on the `data-dbg-layout` the agent
// stamps, plus the label-chip + hover-isolate rules. Outline-only (never border),
// `outline-offset:-1px` so a child's line never bleeds past its parent.
export function debugCss() {
	const outline = (mode) =>
		`.lattice [data-dbg-layout="${mode}"]{outline:1px solid ${LAYOUT_COLORS[mode]}!important;outline-offset:-1px!important;}`;
	return [
		'/* lattice layout debug */',
		outline('grid'),
		outline('flex'),
		outline('flow'),
		// The overlay layer: a non-interactive sibling of the deck content, anchored to
		// the DOCUMENT (position:absolute, not fixed). The preview iframe scrolls its own
		// document internally, and iOS Safari does NOT track `position:fixed` to an
		// iframe's internal scroll — a fixed layer would strand chips off their boxes
		// after a scroll. Absolute-to-document scrolls WITH the content, so chips (placed
		// at document coords: getBoundingClientRect + scroll offset) track reliably on
		// every engine. See engineering/decisions/2026-07-01-debug-bounding-boxes.md.
		`#${DEBUG_OVERLAY_ID}{position:absolute;top:0;left:0;pointer-events:none;z-index:2147483000;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;}`,
		`#${DEBUG_OVERLAY_ID} .dbg-chip{position:absolute;transform:translateY(0);background:rgba(12,15,22,.92);color:#fff;padding:1px 5px;border-radius:0 0 4px 0;border-left:3px solid #fff;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;}`,
		`#${DEBUG_OVERLAY_ID} .dbg-chip[data-dbg-layout="grid"]{border-left-color:${LAYOUT_COLORS.grid};}`,
		`#${DEBUG_OVERLAY_ID} .dbg-chip[data-dbg-layout="flex"]{border-left-color:${LAYOUT_COLORS.flex};}`,
		`#${DEBUG_OVERLAY_ID} .dbg-chip[data-dbg-layout="flow"]{border-left-color:${LAYOUT_COLORS.flow};}`,
		// Hover-isolate: when the pointer is over a labeled box, the agent adds
		// `.dbg-isolating` to the overlay and `.dbg-hot` to that box's chip. Everything
		// else dims so a dense grid stays readable. No pointer-events needed — the
		// agent hit-tests via elementFromPoint on the underlying document.
		`#${DEBUG_OVERLAY_ID}.dbg-isolating .dbg-chip{opacity:.18;}`,
		`#${DEBUG_OVERLAY_ID}.dbg-isolating .dbg-chip.dbg-hot{opacity:1;}`,
	].join('\n');
}

// Is this element worth a LABEL? The slide itself, any grid/flex CONTAINER, and a
// GRID CELL (a direct child of a grid — the tiles you size). Deliberately NOT the
// children of a flex row: those are usually leaf content (a heading, a badge, a
// line of prose), and labelling them turns a slide into a wall of chips. Everything
// is still OUTLINED by layout mode; only the structural boxes get a chip.
function isStructural(el, mode, parentMode) {
	if (el.tagName === 'SECTION') return true;
	if (mode === 'grid' || mode === 'flex') return true;
	return parentMode === 'grid';
}

// A short identity for a box: the slide number for a <section> (plus its component
// _class, if any), else the element's most specific class token, else its tag.
function identityOf(el, _win, sectionIndex) {
	if (el.tagName === 'SECTION') {
		const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
		// Skip the structural/mode classes the engine always adds; a leftover token is
		// the component the slide opted into via `_class`.
		const comp = cls.find((c) => !/^(form|dark|light|lattice)$/.test(c));
		return comp ? `slide ${sectionIndex + 1} · ${comp}` : `slide ${sectionIndex + 1}`;
	}
	const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
	return cls[0] || el.tagName.toLowerCase();
}

/**
 * Apply (or refresh) the debug overlay in `frame`'s document. Idempotent and safe
 * to call before the iframe has a document (no-op). `opts.force` is the session
 * override ('on' | 'off' | null). Returns nothing; call again to redraw.
 */
export function applyDebug(frame, opts = {}) {
	let doc;
	let win;
	try {
		doc = frame?.contentDocument;
		win = frame?.contentWindow;
	} catch {
		doc = null; // cross-origin (shouldn't happen for srcdoc) — bail quietly
	}
	if (!doc?.querySelector) return;
	const force = opts.force === undefined ? null : opts.force;

	// Tear down any prior pass first — a redraw always rebuilds from scratch, so it
	// holds no stale per-node state (survives patchSections' node swaps for free).
	teardown(doc, win, frame);

	const sections = Array.from(doc.querySelectorAll('.lattice > section'));
	const enabled = sections
		.map((sec, i) => ({ sec, i, cfg: resolveConfig(sec.getAttribute('data-debug'), force) }))
		.filter((s) => s.cfg);
	if (!enabled.length) return;

	injectStyle(doc);
	const overlay = doc.createElement('div');
	overlay.id = DEBUG_OVERLAY_ID;
	(doc.body || doc.documentElement).appendChild(overlay);

	const getStyle = (el) => (win?.getComputedStyle ? win.getComputedStyle(el) : {});
	for (const { sec, i, cfg } of enabled) {
		// Walk the section + descendants; stamp the layout mode (drives the outline
		// color) and label the structural boxes.
		const els = [sec, ...sec.querySelectorAll('*')];
		for (const el of els) {
			if (!el.getAttribute) continue;
			const cs = getStyle(el);
			const mode = layoutMode(cs.display);
			if (el.setAttribute) el.setAttribute('data-dbg-layout', mode);
			// The walk is in document order, so a parent is stamped before its children.
			const parentMode = el.parentElement?.getAttribute?.('data-dbg-layout') || null;
			if (!isStructural(el, mode, parentMode)) continue;
			const gap = pxInt(cs.gap || cs.gridGap || cs.columnGap);
			const info = {
				identity: identityOf(el, win, i),
				mode,
				gap,
				w: el.offsetWidth || 0,
				h: el.offsetHeight || 0,
				className: el.tagName === 'SECTION' ? '' : el.getAttribute('class') || '',
				padding: shortPadding(cs),
			};
			// One label string — the CONFIGURED facet set. `verbose` is what adds detail
			// (class + box); a plain hover chip stays short so it doesn't truncate or bury
			// the content it's labelling. (Previously hover ballooned to every facet and
			// ellipsis-truncated — worse than the lean line it replaced.)
			const text = facetLabel(info, cfg.facets);
			if (!text) continue;
			overlay.appendChild(makeChip(doc, el, mode, cfg.reveal, text));
		}
	}
	// Initial paint at rest (no box hovered): hover-mode chips hide, always-mode show.
	doc.__dbgHot = null;
	renderChips(doc, win);

	// Redraw on relayout (async Mermaid/KaTeX, resize) and a couple of backstop
	// timers — the same belt-and-braces the FIT agent uses. Store the observer so the
	// next applyDebug / teardown disconnects it.
	const redraw = () => {
		renderChips(doc, win);
		doc.__dbgCapturePlace?.(); // keep the parent capture surface aligned as the iframe grows/moves
	};
	if (win?.ResizeObserver) {
		const ro = new win.ResizeObserver(redraw);
		ro.observe(doc.documentElement);
		doc.__dbgRO = ro;
	}
	if (win?.addEventListener) {
		// The iframe document scrolls internally, so a scroll must re-pin every chip to
		// its box (getBoundingClientRect moves). The overlay is document-anchored, so the
		// chip's document coords already scroll with it — this redraw just keeps async
		// growth / off-screen culling correct.
		win.addEventListener('resize', redraw);
		win.addEventListener('scroll', redraw, { passive: true });
		doc.__dbgResize = redraw;
	}

	// HOVER mode owns input via a PARENT-HOSTED CAPTURE SURFACE — a transparent layer in
	// the PARENT document, positioned over the preview iframe. The touch lands HERE, in
	// the parent page (where iOS delivers it reliably), NOT inside the iframe: iOS Safari
	// will not hand a touch INTO a CSS-transform-scaled iframe (the preview is scaled to
	// ~0.28), which is why press-and-hold worked in the barely-scaled Present view but
	// died in the small preview. We map the parent-viewport point into the iframe's own
	// coordinates (undo the element scale) and hit-test with the IFRAME's elementsFromPoint;
	// the chips still live inside the iframe. Same idea as the chart-interact hit-surface
	// (chart-interact.js). Touch is PRESS-AND-HOLD to peek; mouse is live
	// hover. `always` mode needs no input.
	const pdoc = (() => { try { return frame?.ownerDocument || null; } catch { return null; } })();
	if (enabled.some((s) => s.cfg.reveal === 'hover') && pdoc?.body && frame.getBoundingClientRect) {
		const pwin = pdoc.defaultView;
		const setHot = (x, y) => {
			const hit = hitFromPoint(doc, overlay, x, y);
			if (hit !== doc.__dbgHot) {
				doc.__dbgHot = hit;
				renderChips(doc, win);
			}
		};
		const clearHot = () => {
			if (doc.__dbgHot) {
				doc.__dbgHot = null;
				renderChips(doc, win);
			}
		};
		// A parent-viewport point → the iframe's INTERNAL coordinate (undo the element's
		// transform scale). offsetWidth is the un-transformed layout width; the rect width
		// is the visible (scaled) width, so their ratio is the scale.
		const toIframe = (px, py) => {
			const r = frame.getBoundingClientRect();
			const sw = r.width / (frame.offsetWidth || r.width || 1) || 1;
			const sh = r.height / (frame.offsetHeight || r.height || 1) || 1;
			const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
			return { x: (px - r.left) / sw, y: (py - r.top) / sh, inside };
		};
		// The capture surface: transparent, over the iframe, in the parent doc. `touch-
		// action:none` so a hold is crisp (debug owns the surface); recreated on every
		// applyDebug, so it self-heals if the host re-renders the iframe.
		const cap = pdoc.createElement('div');
		cap.id = DEBUG_CAPTURE_ID;
		cap.style.cssText = 'position:fixed;background:transparent;pointer-events:auto;touch-action:none;z-index:2147483001;';
		const place = () => {
			const r = frame.getBoundingClientRect();
			cap.style.left = `${r.left}px`;
			cap.style.top = `${r.top}px`;
			cap.style.width = `${r.width}px`;
			cap.style.height = `${r.height}px`;
			cap.style.display = r.width > 0 && r.height > 0 ? 'block' : 'none'; // hide over a collapsed pane
		};
		// TOUCH — press-and-hold. touchstart reveals the box under the finger; a move past
		// the threshold is a pan, so drop the peek and stand down; lift/cancel hides.
		let touch = null;
		let lastTouch = 0;
		const onTouchStart = (e) => {
			lastTouch = Date.now();
			const t = e.touches?.[0];
			if (!t) return;
			touch = { x: t.clientX, y: t.clientY, scrolling: false };
			const m = toIframe(t.clientX, t.clientY);
			setHot(m.x, m.y);
		};
		const onTouchMove = (e) => {
			lastTouch = Date.now();
			const t = e.touches?.[0];
			if (!t || !touch) return;
			if (!touch.scrolling && (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10)) {
				touch.scrolling = true; // a pan — drop the peek
				clearHot();
			} else if (!touch.scrolling) {
				const m = toIframe(t.clientX, t.clientY);
				setHot(m.x, m.y); // still holding: track onto a neighbor
			}
		};
		const onTouchEnd = () => {
			lastTouch = Date.now();
			touch = null;
			clearHot(); // lift → hide (the peek persists only while pressed)
		};
		// MOUSE — live hover. Skip the synthetic mouse events iOS emits after a touch.
		const onMove = (e) => {
			if (Date.now() - lastTouch < 700) return;
			const m = toIframe(e.clientX, e.clientY);
			if (m.inside) setHot(m.x, m.y);
			else clearHot();
		};
		const onLeave = () => clearHot();
		cap.addEventListener('mousemove', onMove);
		cap.addEventListener('mouseleave', onLeave);
		cap.addEventListener('touchstart', onTouchStart, { passive: true });
		cap.addEventListener('touchmove', onTouchMove, { passive: true });
		cap.addEventListener('touchend', onTouchEnd);
		cap.addEventListener('touchcancel', onTouchEnd);
		pdoc.body.appendChild(cap);
		place();
		if (pwin) {
			pwin.addEventListener('scroll', place, { passive: true, capture: true });
			pwin.addEventListener('resize', place);
		}
		// Record on the PARENT doc (it outlives an iframe reload, so teardown can always
		// reach the prior surface + its window listeners). __dbgListeners mirrors the
		// handlers for the unit tests + teardown symmetry.
		pdoc.__latticeDbgCapture = { cap, place, pwin };
		doc.__dbgCapturePlace = place; // let the redraw timers keep it aligned
		doc.__dbgListeners = { onMove, onLeave, onTouchStart, onTouchMove, onTouchEnd };
	}
	if (win?.setTimeout) {
		for (const t of [80, 320, 1200]) win.setTimeout(redraw, t);
	}
}

function injectStyle(doc) {
	if (doc.getElementById(DEBUG_STYLE_ID)) return;
	const style = doc.createElement('style');
	style.id = DEBUG_STYLE_ID;
	style.textContent = debugCss();
	(doc.head || doc.documentElement).appendChild(style);
}

function makeChip(doc, el, mode, reveal, text) {
	const chip = doc.createElement('div');
	chip.className = 'dbg-chip';
	chip.setAttribute('data-dbg-layout', mode);
	chip.__dbgEl = el;
	chip.__dbgReveal = reveal;
	// One label — the configured facet set (short by default; `verbose` adds detail).
	// Rest and hot are the same string, so a revealed chip never balloons/truncates.
	chip.__dbgRest = text;
	chip.__dbgFull = text;
	chip.textContent = text; // trusted first-party text, never innerHTML — #22
	return chip;
}

// The nearest chip-owning box at a viewport point → or null. The overlay + chips are
// pointer-events:none, so elementsFromPoint already omits them and returns the deck
// content; we walk up from the first hit to the nearest box that owns a chip. (Same
// hit-test model as chart-interact's elementFromPoint.)
function hitFromPoint(doc, overlay, x, y) {
	if (!doc.elementsFromPoint) return null;
	const owned = new Set(Array.from(overlay.children).map((c) => c.__dbgEl));
	for (const start of doc.elementsFromPoint(x, y)) {
		if (start.id === DEBUG_OVERLAY_ID) continue;
		for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
			if (n.id === DEBUG_OVERLAY_ID) break;
			if (owned.has(n)) return n;
		}
	}
	return null;
}

// Draw every chip for the current hover state (doc.__dbgHot). The hovered box and
// its container ancestors form the "chain": those chips reveal, enriched to full
// detail. In `hover` mode everything OUTSIDE the chain hides (outlines only at
// rest); in `always` mode it stays visible but dims while a box is isolated.
// Positions come from getBoundingClientRect (viewport, transform-safe) PLUS the
// document scroll offset — the overlay is position:absolute anchored to the document,
// so chips must sit at DOCUMENT coordinates to scroll with their boxes (this is what
// survives iOS, where a fixed layer would not track the iframe's internal scroll).
// Then the visible chips are de-overlapped.
function renderChips(doc, win) {
	const overlay = doc.getElementById?.(DEBUG_OVERLAY_ID);
	if (!overlay) return;
	const chips = Array.from(overlay.children);
	const owned = new Map(chips.map((c) => [c.__dbgEl, c]));
	const chain = new Set();
	for (let n = doc.__dbgHot || null; n; n = n.parentElement) if (owned.has(n)) chain.add(n);
	const winH = win?.innerHeight || 1e9;
	const sx = win?.scrollX || win?.pageXOffset || 0;
	const sy = win?.scrollY || win?.pageYOffset || 0;
	for (const chip of chips) {
		const el = chip.__dbgEl;
		const hot = chain.has(el);
		const wantText = hot ? chip.__dbgFull : chip.__dbgRest;
		if (chip.textContent !== wantText) chip.textContent = wantText;
		chip.classList.toggle('dbg-hot', hot);
		let onscreen = false;
		if (el?.getBoundingClientRect) {
			const r = el.getBoundingClientRect();
			chip.style.left = `${Math.max(0, r.left + sx)}px`;
			chip.style.top = `${Math.max(0, r.top + sy)}px`;
			onscreen = r.bottom > 0 && r.top < winH;
		}
		// hover-mode chips only show while in the chain; always-mode chips always show.
		const show = onscreen && (chip.__dbgReveal !== 'hover' || hot);
		chip.style.visibility = show ? 'visible' : 'hidden';
	}
	overlay.classList.toggle('dbg-isolating', chain.size > 0);
	deoverlap(overlay);
}

// A container and its first cell share a top-left corner, so their chips would
// stack. Cascade any collider straight down until it clears the chips already
// placed above it — so every label stays readable. O(n²) over a small n.
function deoverlap(overlay) {
	const chips = Array.from(overlay.children).filter((c) => c.style.visibility !== 'hidden');
	chips.sort((a, b) => (num(a.style.top) - num(b.style.top)) || (num(a.style.left) - num(b.style.left)));
	const placed = [];
	for (const chip of chips) {
		const left = num(chip.style.left);
		const w = chip.offsetWidth || 130;
		const h = chip.offsetHeight || 16;
		let top = num(chip.style.top);
		let guard = 0;
		while (guard++ < 60 && placed.some((p) => left < p.right && left + w > p.left && top < p.bottom && top + h > p.top)) {
			top = placed.find((p) => left < p.right && left + w > p.left && top < p.bottom && top + h > p.top).bottom + 1;
		}
		chip.style.top = `${top}px`;
		placed.push({ left, right: left + w, top, bottom: top + h });
	}
}

const num = (v) => Number.parseFloat(v) || 0;

function teardown(doc, win, frame) {
	const style = doc.getElementById?.(DEBUG_STYLE_ID);
	if (style) style.remove();
	const overlay = doc.getElementById?.(DEBUG_OVERLAY_ID);
	if (overlay) overlay.remove();
	if (doc.__dbgRO) {
		doc.__dbgRO.disconnect();
		doc.__dbgRO = null;
	}
	if (win && doc.__dbgResize) {
		win.removeEventListener('resize', doc.__dbgResize);
		win.removeEventListener('scroll', doc.__dbgResize);
	}
	// Remove the parent-hosted capture surface + its window listeners. It's recorded on
	// the PARENT document (which outlives an iframe reload), so it's reachable even when
	// `doc` is a fresh post-reload document that never saw the prior surface.
	let pdoc = null;
	try { pdoc = frame?.ownerDocument || null; } catch { pdoc = null; }
	const cap = pdoc?.__latticeDbgCapture;
	if (cap) {
		if (cap.pwin) {
			cap.pwin.removeEventListener('scroll', cap.place, { capture: true });
			cap.pwin.removeEventListener('resize', cap.place);
		}
		cap.cap?.remove();
		pdoc.__latticeDbgCapture = null;
	}
	// Belt-and-braces: sweep any stray surface left by ID (e.g. a doc swap mid-flight).
	const stray = pdoc?.getElementById?.(DEBUG_CAPTURE_ID);
	if (stray && stray !== cap?.cap) stray.remove();
	doc.__dbgListeners = doc.__dbgResize = doc.__dbgHot = doc.__dbgCapturePlace = null;
	// Drop the per-element stamps so a toggled-off pass leaves the DOM pristine.
	if (doc.querySelectorAll) {
		for (const el of Array.from(doc.querySelectorAll('[data-dbg-layout]'))) el.removeAttribute('data-dbg-layout');
	}
}

const pxInt = (v) => {
	const n = Number.parseFloat(v);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function shortPadding(cs) {
	const t = pxInt(cs.paddingTop);
	const r = pxInt(cs.paddingRight);
	const b = pxInt(cs.paddingBottom);
	const l = pxInt(cs.paddingLeft);
	if (!t && !r && !b && !l) return 0;
	return t === r && r === b && b === l ? String(t) : `${t} ${r} ${b} ${l}`;
}

export default { applyDebug, debugCss, resolveConfig, facetLabel, layoutMode, FACETS, LAYOUT_COLORS };
