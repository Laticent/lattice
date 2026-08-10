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
