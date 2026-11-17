// THE IN-DOCUMENT CHART REVEAL — a chart's detail card on a surface whose slides live in the same
// document as the reader (the exported HTML player). The model (./model.mjs) says which mark is
// under a point and what its card holds; Cenno (@laticent/cenno) places the card. This file is the
// interaction between them (the card's contents and styled body come from ./detail.mjs):
//
//   mouse or pen   hovering a mark opens its card next to the pointer; moving to another mark
//                  switches it; slipping into the gap between marks keeps it (the hold zone); leaving
//                  closes it after a short grace, so crossing a hairline never flickers it.
//   touch          a tap on a mark pins its card; a tap on the same mark, elsewhere, or a swipe closes
//                  it. A gesture that ever held two fingers (a pinch) is never a tap: the host says
//                  so through `pinching()`, the player's own guard, so the rule is not written twice.
//   keyboard       digits 1-9 open mark n of the slide on stage, 0 or Escape closes. Each chart with
//                  details is one Tab stop; inside it, the arrow keys walk its marks (and do not turn
//                  the slide), Home and End jump, Escape closes, and leaving the chart closes.
//   screen reader  the card is a polite live region, so what opens is announced.
//
// Hit testing is measured in SCREEN pixels: the near-miss reach (22 px on touch, 6 px for a mouse) is
// divided by the pinch scale, so zooming in never makes a mark harder to hit
// (engineering/decisions/2026-11-16-cenno-popover-library.md §7a). The card itself keeps its size on
// screen under a pinch (Cenno's `pinch: 'steady'`).
//
// The host supplies `createCenno` (Cenno's factory: this file lives in the shipped lib/ and imports no
// package `npm i @laticent/lattice` does not install, so whoever bundles it hands Cenno in), `root` (the element whose pointer events to read), `section()` (the slide on
// stage, or null when the reveal should do nothing), `pinching()`, and optionally `reduced` and
// `enabled`, and `chromeAttrs`: the host's own chrome attributes on the slide's ancestors, left off the
// copy the card's description is styled through. Touch and mouse are told apart per event (`pointerType`), never by a device guess.
// `onSlide()` closes the card when the host changes slide; `setEnabled(false)` closes it
// and stops reacting until enabled again.

import { cardFor, renderDeckDetail } from './detail.mjs';
import * as M from './model.mjs';

// Form fields keep their own keys: a digit typed into a field is text, not a chart command.
const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const HOLD_SLIDE_PX = 10;
const TAP_SLOP = 10;
const CLEAR_GRACE_MS = 70;

/** The deck-skinned card class and its lean modifier; the host styles both. */
export const CARD_CLASS = 'lattice-chart-card';

export function createChartReveal({ createCenno, doc = document, root, section, pinching = () => false, reduced = false, enabled = true, chromeAttrs = [] } = {}) {
	const win = doc.defaultView;
	const cenno = createCenno({ document: doc });
	let on = enabled;
	let card = null;
	let open = null; // { svg, sec, i }
	let clearTimer = 0;
	let down = null; // a touch press: { x, y, id }
	let pointAnchor = false; // the open card points at a pointer position, not an element
	const marked = new Set(); // chart roots we made focusable
	const labeled = new Set(); // ...and the ones whose aria-label is ours, not the kernel's

	const pinchScale = () => win.visualViewport?.scale || 1;
	const reach = (touch) => (touch ? 22 : 6) / pinchScale();

	function cancelClear() {
		if (clearTimer) win.clearTimeout(clearTimer);
		clearTimer = 0;
	}

	function close() {
		cancelClear();
		if (open) M.unemphasize(open.svg);
		open = null;
		card?.close();
		card = null;
	}

	function detailsOf(sec) {
		return sec?.querySelector(M.DETAILS_SEL) || null;
	}

	/** The card's parts for mark i of `svg` on slide `sec`. */
	function partsFor(sec, svg, i) {
		const c = cardFor(sec, svg, detailsOf(sec), i, doc);
		let lead = null;
		if (c.dot) {
			lead = doc.createElement('span');
			lead.className = `${CARD_CLASS}-dot`;
			lead.style.background = c.dot;
		}
		// The description AND the meta line are author content: each is drawn through renderDeckDetail
		// (styles stripped, a shadow root, paint containment), never straight into the card. Drawing the
		// meta line raw let an author `style` cover the whole player with a link (HARD RULE #22).
		const contained = (frag) => {
			if (!frag) return null;
			const host = doc.createElement('div');
			renderDeckDetail(host, frag, sec, { drop: chromeAttrs });
			return host;
		};
		return { parts: { lead, title: c.label, value: c.value || null, body: contained(c.body), footer: contained(c.meta) }, lean: c.lean };
	}

	/**
	 * Open (or switch) the card to mark i. `anchor` is a point for a pointer, or the mark element
	 * for the keyboard. `hover` cards let the pointer pass through, so the card never sits between
	 * the pointer and the marks it is reading.
	 */
	function reveal(sec, svg, i, anchor, hover) {
		cancelClear();
		if (!M.revealable(svg, i, detailsOf(sec)?.querySelectorAll(M.TPL_SEL).length || 0)) return;
		if (open && open.svg === svg && open.i === i) return;
		if (open && open.svg !== svg) M.unemphasize(open.svg);
		open = { svg, sec, i };
		pointAnchor = !('nodeType' in anchor);
		M.emphasize(svg, i, { lift: true, reduced });
		const { parts, lean } = partsFor(sec, svg, i);
		const opts = {
			side: 'bottom',
			align: 'start',
			gap: 'nodeType' in anchor ? 10 : 14,
			pad: 8,
			role: 'status',
			live: true,
			inert: hover,
			className: `${CARD_CLASS}${lean ? ` ${CARD_CLASS}--lean` : ''}`,
		};
		if (card) {
			card.element.className = `cenno ${opts.className}`;
			if (hover) card.element.setAttribute('data-cenno-inert', '');
			else card.element.removeAttribute('data-cenno-inert');
			card.set(parts);
			card.move(anchor, opts);
		} else {
			card = cenno.open(anchor, parts, opts);
		}
	}

	/** The chart and mark under a pointer event on slide `sec`, or null. */
	function hitAt(sec, e, touch) {
		const target = e.target;
		if (!sec?.contains(target)) return null;
		const svg = M.chartOf(target);
		if (!svg || !sec.contains(svg) || !detailsOf(sec)) return null;
		const i = M.markAt(svg, target, e.clientX, e.clientY, reach(touch));
		return i >= 0 ? { svg, i } : null;
	}

	// ── mouse and pen: hover ───────────────────────────────────────────────────────────────────────
	function onMove(e) {
		if (!on || e.pointerType === 'touch' || modalOpen()) return;
		const sec = section();
		const hit = hitAt(sec, e, false);
		if (hit) {
			reveal(sec, hit.svg, hit.i, { x: e.clientX, y: e.clientY }, true);
			return;
		}
		if (!open) return;
		if (M.inHoldZone(open.svg, open.i, e.clientX, e.clientY, HOLD_SLIDE_PX * M.sectionScale(open.sec))) {
			cancelClear();
			return;
		}
		// A momentary step off a mark (a boundary, the gap between bars) must not flicker the card.
		if (!clearTimer) clearTimer = win.setTimeout(close, CLEAR_GRACE_MS);
	}
	function onLeave(e) {
		if (e.pointerType !== 'touch' && open && !card?.element.contains(e.relatedTarget)) close();
	}

	// ── touch: tap to pin ──────────────────────────────────────────────────────────────────────────
	function onDown(e) {
		if (!on || e.pointerType !== 'touch' || !e.isPrimary || modalOpen()) return;
		down = { x: e.clientX, y: e.clientY, id: e.pointerId };
	}
	function onUp(e) {
		if (!on || e.pointerType !== 'touch' || !down || e.pointerId !== down.id) return;
		const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
		down = null;
		if (moved || pinching()) {
			// A swipe turns the slide (the host's); a pinch is never a tap.
			if (moved) close();
			return;
		}
		const sec = section();
		const hit = hitAt(sec, e, true);
		if (!hit || (open && open.svg === hit.svg && open.i === hit.i)) {
			close();
			return;
		}
		reveal(sec, hit.svg, hit.i, { x: e.clientX, y: e.clientY }, false);
	}
	// A tap outside the stage (the bar, the notes) closes a pinned card too.
	function onOutside(e) {
		if (!open || e.pointerType !== 'touch') return;
		if (root.contains(e.target) || card?.element.contains(e.target)) return;
		close();
	}

	// ── keyboard ───────────────────────────────────────────────────────────────────────────────────
	function chartsOn(sec) {
		if (!sec || !detailsOf(sec)) return [];
		return [...sec.querySelectorAll(M.CHART_SVG_SEL)].filter((svg) => M.markCount(svg) > 0 && svg.getBoundingClientRect().width > 0);
	}
	function firstMark(svg, i) {
		return M.marksFor(svg, i)[0] || svg;
	}
	// An open dialog on top (the collage lightbox is a modal <dialog>) owns the keyboard and the pointer:
	// its digits jump photos, its Escape closes it. The reveal stands aside rather than answer the same
	// key. ANY open <dialog> counts, not only `:modal` ones: the player's dialogs are all of that kind, and
	// the test does not then hang on an engine's support for the `:modal` selector.
	const modalOpen = () => !!doc.querySelector('dialog[open]');
	function onKey(e) {
		if (!on || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || modalOpen()) return;
		const t = e.target;
		if (t && (t.isContentEditable || FIELDS.has(t.tagName))) return;
		const sec = section();
		// Inside a focused chart, the arrow keys walk its marks rather than turning the slide.
		const svg = t?.matches?.('[data-chart-reveal]') ? t : null;
		if (svg && sec?.contains(svg)) {
			const ids = [...new Set(M.markEls(svg).map(M.markIndex).filter((n) => n >= 0))].sort((a, b) => a - b);
			const at = open && open.svg === svg ? ids.indexOf(open.i) : -1;
			let next = null;
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[at < 0 ? 0 : Math.min(ids.length - 1, at + 1)];
			else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = ids[at < 0 ? ids.length - 1 : Math.max(0, at - 1)];
			else if (e.key === 'Home') next = ids[0];
			else if (e.key === 'End') next = ids[ids.length - 1];
			if (next != null) {
				reveal(sec, svg, next, firstMark(svg, next), false);
				e.preventDefault();
				e.stopPropagation();
				return;
			}
		}
		if (e.key === 'Escape' || e.key === '0') {
			if (!open) return;
			close();
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (e.key >= '1' && e.key <= '9') {
			const target = svg && sec?.contains(svg) ? svg : chartsOn(sec)[0];
			const i = Number(e.key) - 1;
			if (!target || !M.revealable(target, i)) return; // a digit naming no mark is not swallowed
			reveal(sec, target, i, firstMark(target, i), false);
			e.preventDefault();
			e.stopPropagation();
		}
	}
	function onFocusOut(e) {
		const svg = e.target;
		if (!svg?.matches?.('[data-chart-reveal]')) return;
		if (open && open.svg === svg && !svg.contains(e.relatedTarget)) close();
	}

	/** Make each chart with details on `sec` one Tab stop, named so a reader knows what it holds. */
	function markCharts(sec) {
		for (const svg of chartsOn(sec)) {
			if (marked.has(svg)) continue;
			marked.add(svg);
			svg.setAttribute('data-chart-reveal', '');
			svg.setAttribute('tabindex', '0');
			// The chart keeps the name and description its kernel gave it; the keys it now answers are added.
			svg.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape');
			if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-labelledby')) {
				const n = M.markCount(svg);
				svg.setAttribute('aria-label', `Chart with ${n} data point${n === 1 ? '' : 's'}. Use the arrow keys to read each one.`);
				labeled.add(svg);
			}
		}
	}
	function unmarkCharts() {
		for (const svg of marked) {
			svg.removeAttribute('data-chart-reveal');
			svg.removeAttribute('tabindex');
			svg.removeAttribute('aria-keyshortcuts');
			if (labeled.has(svg)) svg.removeAttribute('aria-label');
		}
		marked.clear();
		labeled.clear();
	}

	const opt = { passive: true };
	root.addEventListener('pointermove', onMove, opt);
	root.addEventListener('pointerleave', onLeave, opt);
	root.addEventListener('pointerdown', onDown, opt);
	root.addEventListener('pointerup', onUp, opt);
	root.addEventListener('focusout', onFocusOut);
	doc.addEventListener('pointerdown', onOutside, { capture: true, passive: true });
	doc.addEventListener('keydown', onKey, true);
	// A point anchor does not move with the page: a resize or a rotation drops the card.
	const onResize = () => {
		if (card && pointAnchor) close();
	};
	win.addEventListener('resize', onResize);
	if (on) markCharts(section());

	return {
		/** The host changed slide (or view): close the card and make the new slide's charts reachable. */
		onSlide() {
			close();
			// Only the slide on stage carries Tab stops: a chart left focusable on a slide that is not on
			// stage (Read · Slides shows them all, and the reveal answers only in Present) would promise
			// arrow keys that do nothing.
			unmarkCharts();
			if (on) markCharts(section());
		},
		close,
		get enabled() {
			return on;
		},
		setEnabled(v) {
			on = !!v;
			close();
			unmarkCharts();
			if (on) markCharts(section());
		},
		/** The open mark, for tests and hosts: `{ i }` or null. */
		get open() {
			return open ? { i: open.i } : null;
		},
		destroy() {
			close();
			unmarkCharts();
			root.removeEventListener('pointermove', onMove, opt);
			root.removeEventListener('pointerleave', onLeave, opt);
			root.removeEventListener('pointerdown', onDown, opt);
			root.removeEventListener('pointerup', onUp, opt);
			root.removeEventListener('focusout', onFocusOut);
			doc.removeEventListener('pointerdown', onOutside, { capture: true });
			doc.removeEventListener('keydown', onKey, true);
			win.removeEventListener('resize', onResize);
			cenno.destroy();
		},
	};
}
