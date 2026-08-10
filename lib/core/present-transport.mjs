/**
 * lib/core/present-transport — the headless slide-transport kernel.
 *
 * The ONE source of truth for the maths every "Present" surface reimplemented:
 * the fit-scale factor, the slide index + bounded next/prev/go, and the rule for
 * each of the three input verbs — keymap (keyboard), swipe threshold (touch),
 * wheel gate (mouse + trackpad). Born from P3 of
 * `engineering/decisions/2026-07-07-html-lattice-player.md`, which found the
 * on-stage transport written THREE times with divergent constants —
 * `presenter-window.js` `buildStageDoc` (pad ×0.012, top-left), the export
 * player's `fit()` (hard-coded 1280×720, center origin), and
 * `drawing-board-practice.js` (pad ×0.04) — plus nav/bounds/keymap forked ~4×.
 *
 * Pure + DOM-FREE by construction (HARD RULE #1): every function takes plain
 * numbers/objects and returns plain values, so it (a) unit-tests without a
 * browser, (b) is imported directly by the docs-site transports, and (c) has its
 * SOURCE inlined verbatim into the self-contained export player's CSP-hashed
 * script (`.toString()`), which cannot `import`. Keep every export self-contained
 * — no module-scope references reachable only by closure — so the inlining holds.
 */

/**
 * The fit-scale factor for one slide on a stage: the largest uniform scale that
 * fits a `slideW×slideH` slide inside a `stageW×stageH` stage after reserving
 * `insetX`/`insetY` total chrome. `transform: scale(factor)` is applied by the
 * caller (origin is a caller concern — top-left for the docs stage, center for the
 * export player; the factor is identical either way).
 *
 * @param {{stageW:number, stageH:number, slideW:number, slideH:number, insetX?:number, insetY?:number}} o
 * @returns {number}
 */
export function fitScale({ stageW, stageH, slideW, slideH, insetX = 0, insetY = 0 }) {
	return Math.min((stageW - insetX) / slideW, (stageH - insetY) / slideH);
}

/**
 * TOTAL symmetric inset for the pad-based stages: `max(floor, min(W,H)·factor)`
 * doubled (a pad on each edge). Reproduces `buildStageDoc` (factor 0.012, floor 0)
 * and `drawing-board-practice` (factor 0.04, floor 14) exactly — feed the result to
 * {@link fitScale} as both `insetX` and `insetY`.
 *
 * @param {number} stageW @param {number} stageH
 * @param {{factor:number, floor?:number}} o
 * @returns {number}
 */
export function padInset(stageW, stageH, { factor, floor = 0 }) {
	return Math.max(floor, Math.min(stageW, stageH) * factor) * 2;
}

/**
 * The canonical NAVIGATION keymap — the keys every transport shares. UI-specific
 * keys (fullscreen `f`, notes `n`, presenter `s`, overview `g`, `Escape`) stay with
 * each consumer; this is only the move-through-the-deck set. `keyAction` returns
 * the action name or `undefined`.
 */
export const PRESENT_KEYMAP = {
	ArrowRight: 'next',
	' ': 'next',
	PageDown: 'next',
	ArrowLeft: 'prev',
	PageUp: 'prev',
	Home: 'first',
	End: 'last',
};

/**
 * @param {string} key @param {Record<string,string>} [map] @returns {string|undefined}
 * Own-property lookup only — a `key` of `toString`/`constructor`/… must return
 * undefined, never an inherited `Object.prototype` member (which a consumer would
 * then try to invoke as a transport method).
 */
export function keyAction(key, map = PRESENT_KEYMAP) {
	return Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * A horizontal swipe → a nav action, or `null` when it isn't a decisive
 * horizontal gesture. Reproduces the `|dx|>45 && |dx|>|dy|·1.3` rule the docs
 * transports hand-rolled: the move must clear `threshold` px AND be `ratio`× more
 * horizontal than vertical (so a vertical scroll never turns the slide).
 *
 * @param {{dx:number, dy:number, threshold?:number, ratio?:number}} o
 * @returns {'next'|'prev'|null}
 */
export function swipeAction({ dx, dy, threshold = 45, ratio = 1.3 }) {
	if (Math.abs(dx) <= threshold || Math.abs(dx) <= Math.abs(dy) * ratio) return null;
	return dx < 0 ? 'next' : 'prev';
}

/**
 * A WHEEL gate → a nav action, or `null` when the scroll isn't a decisive flick.
 * The third input verb, alongside {@link keyAction} (keyboard) and
 * {@link swipeAction} (touch); every surface must accept all three, on every
 * device class, so a deck turns the same way whatever is in the reader's hand
 * (#1294).
 *
 * DOMINANT AXIS, deliberately: a tower mouse emits pure `deltaY`, a trackpad
 * two-finger flick emits mostly `deltaX`, and a tilt-wheel emits both. Reading
 * whichever axis moved further accepts all three; the horizontal-only rule the
 * Studio shell used to hand-roll silently ignored every mouse in the world.
 *
 * Returns a STATEFUL gate rather than a pure predicate because the cooldown is
 * the whole trick: one physical flick emits a burst of `wheel` events (trackpad
 * momentum fires dozens), so without a cooldown a single gesture skips half the
 * deck. The gate owns `last` so no caller has to re-derive it — that per-caller
 * re-derivation is exactly how Present (480ms/40px, dominant axis) and the shell
 * (400ms/30px, horizontal only) drifted apart in the first place.
 *
 * Self-contained (literal defaults, no module-scope reads) so the source still
 * inlines verbatim per this module's header contract.
 *
 * @param {{threshold?:number, cooldown?:number}} [o]
 * @returns {(dx:number, dy:number, now:number) => 'next'|'prev'|null}
 */
export function createWheelGate({ threshold = 40, cooldown = 480 } = {}) {
	let last = -Infinity;
	return (dx, dy, now) => {
		const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
		// A firm flick, not a reflexive scroll-to-read.
		if (Math.abs(d) < threshold) return null;
		if (now - last < cooldown) return null;
		last = now;
		return d > 0 ? 'next' : 'prev';
	};
}

/**
 * The multiplicative zoom factor one wheel notch or one drag-pixel earns.
 * Exponential, so zooming is scale-relative: the same flick doubles 1×→2× and
 * 2×→4×, which is what makes a zoom feel linear to the hand. `delta` is
 * screen-down-positive (a `wheel` event's `deltaY`, a drag's `dy`), so pushing
 * AWAY from you — scrolling up, dragging up — zooms IN, matching every map,
 * canvas and browser.
 *
 * `rate` is the one thing that differs between the two devices driving it: a
 * wheel notch is ~100 units and wants ~0.0015; a drag is one unit per pixel and
 * wants ~0.006. Caller picks; the curve is shared.
 *
 * @param {number} delta @param {{rate?:number}} [o] @returns {number}
 */
export function zoomStep(delta, { rate = 0.0015 } = {}) {
	return Math.exp(-delta * rate);
}

/**
 * The ZOOM/PAN gesture machine — the fourth input rule, and the one that tells the
 * other three when to stand down.
 *
 * WHY IT IS HERE. Every slide surface hand-rolled "first touch to last touch is a
 * swipe" and none of them ever counted the fingers, so a PINCH read as a 120px
 * horizontal flick and turned the deck instead of zooming (measured on the real
 * Studio: pinch on slide 3 landed on slide 4 at 1440 and 820). The wheel had the
 * mirror defect — a trackpad pinch reaches the page as `ctrl`+wheel, and no
 * surface read `ctrlKey`, so pinching a trackpad scrubbed the deck. Both are the
 * #1294 root cause again: an input rule owned per surface instead of by this
 * kernel. Putting the finger-count rule HERE is what stops a fourth surface from
 * reinventing it wrong.
 *
 * THE DISAMBIGUATION, in one line each:
 *   - a gesture that ever held 2+ pointers is a PINCH, never a swipe — even after
 *     one finger lifts, until every finger is up;
 *   - one pointer at fit scale is the caller's business (a swipe → {@link swipeAction});
 *   - one pointer while zoomed in PANS, because the reader is inspecting, not turning.
 *
 * COORDINATES are viewport-relative pixels — the zoom box's own top-left origin —
 * and `view` is that box's size. Content is assumed to FILL the box at `scale: 1`
 * (the preview already fit-scales the slide into it), so content size is
 * `view.w * scale` and the pan bounds fall out of that. Apply the result as
 * `translate(x, y) scale(scale)` with a top-left transform origin.
 *
 * DOM-free and self-contained (literal defaults, no module-scope reads), so it
 * still inlines verbatim into the presenter popup per this module's contract.
 *
 * @param {{min?:number, max?:number, onChange?:(s:{scale:number,x:number,y:number})=>void}} [o]
 */
export function createZoomGesture({ min = 1, max = 4, onChange } = {}) {
	let scale = 1;
	let x = 0;
	let y = 0;
	// Gesture bookkeeping, all reset only when the LAST pointer lifts.
	let span = 0; // pointer distance at the previous pinch sample
	let px = 0; // previous sample's anchor point
	let py = 0;
	let multi = false; // this gesture has held 2+ pointers at some moment
	let moved = false; // this gesture pinched or panned — so it was never a swipe

	const emit = () => {
		if (onChange) onChange({ scale, x, y });
	};
	// Keep the content covering the box: at `scale` the content is `view.w*scale`
	// wide, so x lives in [view.w - contentW, 0]. At fit scale that collapses to 0,
	// which is why a zoomed-out slide can never be dragged off-center.
	const bound = (view) => {
		const cw = view.w * scale;
		const ch = view.h * scale;
		x = cw <= view.w ? 0 : Math.max(view.w - cw, Math.min(0, x));
		y = ch <= view.h ? 0 : Math.max(view.h - ch, Math.min(0, y));
	};
	// Zoom to `next` while pinning the content point under (ax, ay) — the cursor,
	// the pinch midpoint — so the thing you aimed at stays where you aimed. Always
	// re-bounds (a clamped-out zoom still has to honor a pan applied alongside it);
	// never emits, so a caller that also translated emits ONCE for the whole gesture
	// sample rather than painting an intermediate frame.
	const about = (next, ax, ay, view) => {
		const s = Math.max(min, Math.min(max, next));
		if (s !== scale) {
			x = ax - ((ax - x) / scale) * s;
			y = ay - ((ay - y) / scale) * s;
			scale = s;
		}
		bound(view);
	};

	return {
		/** The transform to apply: `translate(x, y) scale(scale)`, origin top-left. */
		state: () => ({ scale, x, y }),
		/** True once the reader has zoomed past fit — the "one finger pans" mode. */
		zoomed: () => scale > 1,
		/**
		 * Pointers went down or changed. `points` is EVERY pointer currently down,
		 * as `[{x, y}, …]`; pass the whole list on every touchstart, because a second
		 * finger landing is what turns a swipe-in-progress into a pinch.
		 */
		down(points) {
			if (points.length > 1) {
				multi = true;
				const a = points[0];
				const b = points[1];
				span = Math.hypot(b.x - a.x, b.y - a.y);
				px = (a.x + b.x) / 2;
				py = (a.y + b.y) / 2;
			} else if (points.length === 1) {
				px = points[0].x;
				py = points[0].y;
			}
		},
		/**
		 * Pointers moved. Returns what the gesture IS, so the caller knows whether to
		 * `preventDefault` (a pinch or a pan owns the gesture; the page must not
		 * scroll or zoom under it) and whether a swipe is still on the table.
		 *
		 * @returns {'pinch'|'pan'|null}
		 */
		move(points, view) {
			if (points.length > 1) {
				multi = true;
				const a = points[0];
				const b = points[1];
				const dist = Math.hypot(b.x - a.x, b.y - a.y);
				const mx = (a.x + b.x) / 2;
				const my = (a.y + b.y) / 2;
				// A pinch that starts mid-gesture (a second finger joins a drag) has no
				// previous span to divide by — adopt this sample as the baseline instead
				// of dividing by zero and flinging the scale to Infinity.
				if (span > 0) {
					moved = true;
					// Pan by the midpoint's travel as well, so a two-finger drag moves the
					// slide while it scales — one gesture, both effects, as readers expect.
					x += mx - px;
					y += my - py;
					about(scale * (dist / span), mx, my, view);
					emit();
				}
				span = dist;
				px = mx;
				py = my;
				return 'pinch';
			}
			if (points.length === 1) {
				// A single finger only pans once zoomed in. At fit scale it is a swipe,
				// which is the caller's rule, not ours.
				if (scale <= 1) return null;
				moved = true;
				x += points[0].x - px;
				y += points[0].y - py;
				px = points[0].x;
				py = points[0].y;
				bound(view);
				emit();
				return 'pan';
			}
			return null;
		},
		/**
		 * A pointer lifted. `remaining` is how many are still down.
		 *
		 * `swipeBlocked` is the whole point: it stays true from the moment a second
		 * finger lands until the last one lifts, so the finger that ends a pinch can
		 * never be measured as a swipe. Reading it is what a surface must do BEFORE
		 * calling {@link swipeAction}.
		 *
		 * @returns {{swipeBlocked:boolean}}
		 */
		up(remaining) {
			const swipeBlocked = multi || moved;
			if (remaining > 0) {
				// One finger of a pinch left: re-baseline on it so the survivor pans
				// smoothly instead of jumping by the whole midpoint offset.
				span = 0;
			} else {
				span = 0;
				multi = false;
				moved = false;
			}
			return { swipeBlocked };
		},
		/** Re-baseline the single-pointer anchor — after `up`, for the surviving finger. */
		anchor(point) {
			px = point.x;
			py = point.y;
		},
		/** Zoom by a multiplicative `factor` about a point — the wheel and drag path. */
		by(factor, ax, ay, view) {
			about(scale * factor, ax, ay, view);
			emit();
		},
		/** Back to fit. Also what a slide change owes, so zoom never leaks across slides. */
		reset() {
			if (scale === 1 && x === 0 && y === 0) return;
			scale = 1;
			x = 0;
			y = 0;
			emit();
		},
	};
}

/**
 * The slide-index state machine: a current index and bounded `next`/`prev`/`go`/
 * `first`/`last`, each clamped to `[0, count-1]` and firing `onShow(index)` on any
 * move that lands (including a no-op clamp at an edge, so chrome stays in sync).
 * `count` may be a number or a `() => number` (the Studio lens / a live deck reshapes
 * the set). `start` is clamped on construction.
 *
 * @param {{count:number|(()=>number), start?:number, onShow?:(i:number)=>void}} o
 */
export function createTransport({ count, start = 0, onShow }) {
	const size = () => (typeof count === 'function' ? count() : count);
	const clamp = (x) => Math.max(0, Math.min(size() - 1, x));
	let i = clamp(start);
	const go = (x) => {
		i = clamp(x);
		if (onShow) onShow(i);
		return i;
	};
	return {
		get index() {
			return i;
		},
		go,
		next: () => go(i + 1),
		prev: () => go(i - 1),
		first: () => go(0),
		last: () => go(size() - 1),
	};
}
