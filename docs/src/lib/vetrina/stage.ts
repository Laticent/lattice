// Vetrina — the STAGE: the parent-document theater layer. Everything a viewer SEES
// that isn't the host app itself: a fake cursor that glides between controls, the
// attention cues (anticipation streak + ping, click burst, the gesture vocabulary),
// a narration caption, and the "Live demo" chrome (Exit + take-over hint).
//
// FRAMEWORK-FREE and HOST-AGNOSTIC. A set of position:fixed, pointer-events:none nodes
// over the live app — never inside a preview iframe, never intercepting real input. The
// one exception is the Exit button, which opts back into pointer events.
//
// The cursor is THEATER: it only shows WHERE an action lands. The real state change is
// driven by the host's own setters (the runner's `act`), never by dispatching a synthetic
// event here — that split is what makes take-over unambiguous (I1/I2).
//
// PALETTE-BLIND: every color renders through a `var(--vt-*)` token with a sane default
// (no hex literals baked into a rule the host can't reach). A host themes by styling
// those tokens in CSS (light/dark rides its own cascade — the layer inherits from :root)
// or via the JS `Theme` convenience (theme.ts writes the tokens onto the layer).

import type { ResolvedTheme } from './theme';

export type Target = string | HTMLElement | (() => HTMLElement | null);

/** The cursor's body language — a curated alphabet, each carrying a distinct MEANING.
 *  Frozen at five; extending it is an allowlist edit gated in check-ownership. */
export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake';

export interface DragHandle {
	/** Release/settle the dragged item at `to` (call on `act` success). */
	drop(signal?: AbortSignal): Promise<void>;
	/** Snap the item back to `from` (call on `act` failure) — the honest "it didn't happen". */
	snapBack(signal?: AbortSignal): Promise<void>;
}

export interface Stage {
	/** Narration text in the dock (textContent only). '' reverts to the take-over hint — the
	 *  dock stays up so Exit is always reachable; the narration cross-fades on change. */
	say(text: string): void;
	/** Report beat progress (current of total). OPTIONAL — only the `caption:'progress'` style
	 *  renders it (a beat ring); every other style ignores it, and a raw Walkthrough that never
	 *  reports leaves the ring empty. The storyboard interpreter feeds it (taught beats only). */
	progress?(current: number, total: number): void;
	/** Anticipation cue toward a target, then an eased glide to it. Null target = no-op. */
	point(target: Target, signal?: AbortSignal): Promise<void>;
	/** Click burst at the cursor's current position (theater; pair with a real `act`). */
	press(signal?: AbortSignal): Promise<void>;
	/** Demonstrate a move (mechanic): glide pick-up → hold at `to`. The caller gates the drop
	 *  on the real `act` (drop on success, snapBack on failure) so the theater never lies. */
	drag(from: Target, to: Target, signal?: AbortSignal): Promise<DragHandle>;
	/** Body language (§6.1). `circle` needs a target; the rest play at the cursor or a target. */
	gesture(kind: Gesture, target?: Target, signal?: AbortSignal): Promise<void>;
	/** Opening flourish: the cursor materializes at center + waves hello (once per run). */
	intro(signal?: AbortSignal): Promise<void>;
	/** Resolve a Target to an element. Selectors are ROOT-scoped; pass a thunk for portals. */
	resolve(target: Target): HTMLElement | null;
	/** True when VESTIBULAR motion is suppressed (the 'legible' and 'still' tiers) — glides
	 *  teleport, sweeps/rings/orbit/wave-translate are skipped. Content cadence is unaffected. */
	readonly reduced: boolean;
	/** True ONLY in the 'still' tier — CONTENT cadence collapses too: the runner sets typed text
	 *  at once (no reveal) and settles run short. 'legible' keeps the reveal, so this stays false. */
	readonly still: boolean;
	/** Pacing multiplier from the theme's speed — storyboard settle + typing cadence scale by it. */
	readonly pace: number;
	/** True if the event target belongs to the stage's own chrome (the Exit button). */
	contains(node: EventTarget | null): boolean;
	/** Remove every node. Idempotent; all methods no-op afterward (I6 / interleave safety). */
	destroy(): void;
}

export interface StageOptions {
	/** The host app subtree; string Targets resolve within it (root-scoped — F/D2.1). */
	root: HTMLElement;
	/** Called when the viewer clicks the Exit button. */
	onExit: () => void;
	/** Where the overlay mounts (default: the root's document body). Injectable — no hardcode. */
	portalRoot?: HTMLElement;
	/** Stacking context for hosts that go higher than the default. */
	zIndex?: number;
	/** Resolved theme — token values + pace + pointer shape + silenced cues (from theme.ts). */
	theme?: ResolvedTheme;
}

// ── Abort plumbing ───────────────────────────────────────────────────────────

class AbortError extends Error {
	constructor() {
		super('vetrina aborted');
		this.name = 'AbortError';
	}
}
export function isAbortError(e: unknown): boolean {
	return e instanceof Error && e.name === 'AbortError';
}

/** A cancelable sleep — resolves after `ms`, or rejects `AbortError` if `signal` aborts first. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new AbortError());
		const t = window.setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			window.clearTimeout(t);
			reject(new AbortError());
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

// ── Tokens: palette-blind defaults (the `--vt-*` contract, §9) ────────────────

const TOKEN_DEFAULTS: Record<string, string> = {
	'--vt-accent': '#2b6ef2',
	'--vt-cursor-fill': 'var(--vt-accent)',
	'--vt-cursor-stroke': '#ffffff',
	// The narration dock. `-bg` is deliberately translucent (+ a backdrop blur) so the deck
	// ghosts through instead of being hidden; `-radius` is the corner shape of the boxed
	// caption styles (bar/split/progress; raise to 999px for a stadium pill); `-hint` is the
	// dimmed "take over" fallback text.
	'--vt-caption-bg': 'rgba(12,14,20,.76)',
	'--vt-caption-ink': '#f4f6fb',
	'--vt-caption-hint': 'rgba(244,246,251,.62)',
	'--vt-caption-radius': '16px',
	// The `scrim` style's darkening color + the split/scrim corner Exit chip derive from this
	// (via color-mix alpha), so both are themeable. It pairs with `--vt-caption-ink`: scrim ink
	// is near-white by default, so a host that darkens the ink should lighten this to match.
	'--vt-caption-scrim': '#06090f',
	'--vt-ring-halo': 'rgba(255,255,255,.92)',
	'--vt-glow-halo': 'rgba(255,255,255,.85)',
	'--vt-tick-halo': 'rgba(255,255,255,.70)',
	'--vt-exit-bg': 'rgba(255,255,255,.14)',
	'--vt-exit-ink': '#ffffff',
};
const A = 'var(--vt-accent)';
// Cue rings pair the accent with a white co-stroke + accent bloom so they read on ANY
// ground (a same-hue accent washes out otherwise). The co-stroke is a token so a host
// can retune the legibility floor — its default is the mode-agnostic white.
const RING_SHADOW = '0 0 0 1.5px var(--vt-ring-halo), 0 0 22px 2px var(--vt-accent)';
const BAR_SHADOW = '0 0 8px var(--vt-accent), 0 0 0 1px var(--vt-tick-halo)';

function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
function reducedMotion(): boolean {
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}

// ── The stage ─────────────────────────────────────────────────────────────────

function cursorInner(pointer: 'arrow' | 'ring' | 'dot'): string {
	const fill = 'var(--vt-cursor-fill)';
	const stroke = 'var(--vt-cursor-stroke)';
	if (pointer === 'ring')
		return `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8" fill="none" stroke="${fill}" stroke-width="3.5"/><circle cx="13" cy="13" r="8" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
	if (pointer === 'dot')
		return `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
	return (
		'<svg width="28" height="28" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
		`<path d="M5 3 L5 20 L9.5 15.8 L12.4 22.5 L15.4 21.2 L12.5 14.6 L18.6 14.4 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/></svg>`
	);
}

// Inject the `--vt-*` defaults ONCE per document, in a low cascade layer on `:root`.
// Un-layered host CSS (the normal `:root { --vt-accent }` in §9) beats any layered rule,
// so the host's own theming — including its light/dark cascade — wins for free, and the
// stage inherits the resolved token. Id-guarded (idempotent across runs / re-mounts).
// Assumes `@layer` (all 2022+ browsers — the docs-site/Studio target); a host that instead
// declares its OWN --vt-* inside a NAMED @layer is off the §9 contract (which is un-layered
// :root) and would be out-prioritized by this default — pass a JS `theme` for that case.
function ensureDefaultTokens(doc: Document): void {
	if (doc.getElementById('vetrina-token-defaults')) return;
	const style = doc.createElement('style');
	style.id = 'vetrina-token-defaults';
	const decls = Object.entries(TOKEN_DEFAULTS)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');
	style.textContent = `@layer vetrina-defaults{:root{${decls}}}`;
	doc.head.appendChild(style);
}

// ── The narration DOCK, four curated styles (theme.caption; §redesign 2026-07-06) ─────
// The dock carries the narration (the a11y live spine) + Exit (the always-reachable escape).
// The STYLES trade off how much chrome sits over the deck; every one keeps Exit an icon
// button INSIDE `.vetrina-caption` (so the take-over guard's `layer.contains` still reads it
// as chrome, and the exemplar contract holds), and keeps the narration a single live region.
//   bar      one full-width bar; narration spans the width, Exit is a trailing ✕ (the default —
//            legible over ANY ground, which raw/generic hosts need).
//   split    a clean text-only caption + a separate ✕ chip in the far corner.
//   scrim    no box — a film-subtitle over a soft bottom gradient (most premium; assumes busy/
//            dark content behind, which is why the Studio demo opts in).
//   progress the bar, with a beat-progress ring in place of the live dot (fed by stage.progress).
const HINT = 'click anywhere to take over';
const EXIT_ICON =
	'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
	'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

type CaptionStyle = 'bar' | 'split' | 'scrim' | 'progress';
interface BuiltDock {
	dock: HTMLElement;
	narration: HTMLElement;
	setNarration: (text: string) => void;
	setProgress: (current: number, total: number) => void;
}

function buildDock(doc: Document, caption: CaptionStyle, placement: 'top' | 'bottom', onExit: () => void): BuiltDock {
	const top = placement === 'top';
	const glass =
		'background:var(--vt-caption-bg);color:var(--vt-caption-ink);box-shadow:0 10px 34px rgba(0,0,0,.40);' +
		'backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);';

	// The narration — the say() text and the accessible spine (the only live region, so the
	// dot/ring/Exit stay out of the announced text). Idle shows the dimmed take-over hint.
	const narration = doc.createElement('span');
	narration.className = 'vetrina-narration';
	narration.setAttribute('role', 'status');
	narration.setAttribute('aria-live', 'polite');
	narration.setAttribute('aria-atomic', 'true');
	const setNarration = (text: string): void => {
		narration.textContent = text || HINT;
		narration.style.color = text ? 'var(--vt-caption-ink)' : 'var(--vt-caption-hint)';
	};

	// Exit — the always-reachable escape, an icon button in every style (aria-label carries the
	// name; the ✕ glyph is aria-hidden). pointer-events opts back in over the inert layer.
	const exit = doc.createElement('button');
	exit.type = 'button';
	exit.className = 'vetrina-exit';
	exit.innerHTML = EXIT_ICON;
	exit.setAttribute('aria-label', 'Exit the demo');
	exit.addEventListener('click', (e) => {
		e.stopPropagation();
		onExit();
	});
	const exitCircle = (px: number, bg = 'var(--vt-exit-bg)') =>
		`flex:none;pointer-events:auto;cursor:pointer;border:0;display:grid;place-items:center;width:${px}px;height:${px}px;` +
		`border-radius:50%;color:var(--vt-exit-ink);background:${bg};`;

	const dock = doc.createElement('div');
	dock.className = 'vetrina-caption';
	let setProgress: (c: number, t: number) => void = () => {};

	if (caption === 'split' || caption === 'scrim') {
		// A full-area, transparent container: the caption sits at the placement edge, Exit rides
		// the opposite corner. The container carries `.vetrina-caption` so Exit stays inside it.
		dock.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none;opacity:0;transition:opacity .3s ease;';
		// The corner chip's backing derives from the scrim token (themeable), darkened enough to
		// read over arbitrary host content in the far corner.
		exit.style.cssText = exitCircle(32, 'color-mix(in srgb, var(--vt-caption-scrim) 58%, transparent)') + `position:absolute;right:12px;${top ? 'bottom:12px' : 'top:12px'};backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);`;

		if (caption === 'split') {
			const cap = doc.createElement('div');
			// The bottom offset clears a host's bottom chrome (e.g. the Studio's ~70px pane/slide
			// bar) so the caption floats ABOVE it rather than colliding — real-surface tuned.
			cap.style.cssText =
				`position:absolute;left:50%;transform:translateX(-50%);${top ? 'top:14px' : 'bottom:78px'};` +
				`max-width:min(84%,560px);padding:9px 18px;border-radius:var(--vt-caption-radius);${glass}`;
			narration.style.cssText = 'display:block;min-width:0;line-height:1.4;text-align:center;font-size:13.5px;transition:opacity .18s ease;';
			cap.appendChild(narration);
			dock.append(cap, exit);
		} else {
			// scrim — a soft gradient lifts the content into shadow; the subtitle rides it. The
			// gradient goes edge-to-edge, but the SUBTITLE sits ~78px in so it clears a host's
			// bottom chrome AND lands on the gradient's dark band (legible over light content too).
			// The dark band reaches up UNDER the subtitle (dark by ~66%), so near-white text is
			// crisp even over a light host (the Studio's letterboxed light preview). Paired with a
			// tight text-shadow so the glyph edges read regardless of what's behind.
			const S = 'var(--vt-caption-scrim)';
			const stops = `transparent 0%, color-mix(in srgb, ${S} 45%, transparent) 30%, color-mix(in srgb, ${S} 82%, transparent) 62%, color-mix(in srgb, ${S} 90%, transparent)`;
			const grad = `linear-gradient(${top ? '0deg' : '180deg'}, ${stops})`;
			// The gradient is a SEPARATE, purely-decorative sibling — aria-hidden is safe HERE
			// because the narration is NOT inside it (an aria-hidden ancestor would drop the
			// role=status live region out of the a11y tree — the exact scrim a11y bug we hit).
			const scrim = doc.createElement('div');
			scrim.setAttribute('aria-hidden', 'true');
			scrim.style.cssText = `position:absolute;left:0;right:0;${top ? 'top:0' : 'bottom:0'};height:230px;background:${grad};`;
			// The narration overlaps the gradient but is a DIRECT child of the dock, so it stays in
			// the a11y tree and is announced. It sits ~78px in (clears host bottom chrome) on the
			// gradient's dark band. Best for SHORT beats — a long multi-line block rides up into the
			// lighter gradient, so scrim is the Studio's MOBILE choice (dark preview) not desktop.
			narration.style.cssText =
				`position:absolute;left:50%;transform:translateX(-50%);${top ? 'top:78px' : 'bottom:78px'};` +
				'width:min(340px,86%);line-height:1.4;text-align:center;font-size:15px;font-weight:600;' +
				'text-shadow:0 1px 2px rgba(0,0,0,.85),0 2px 18px rgba(0,0,0,.7);transition:opacity .18s ease;';
			dock.append(scrim, narration, exit);
		}
	} else {
		// bar / progress — one boxed dock at the placement edge (the bottom offset clears a host's
		// bottom chrome, e.g. the Studio pane bar). `bar` spans the width with a leading pulse dot;
		// `progress` is centered with a beat-progress ring.
		const edge = top ? 'top:14px' : 'bottom:78px';
		if (caption === 'progress') {
			dock.style.cssText =
				`position:absolute;left:50%;transform:translateX(-50%);${edge};z-index:10;max-width:min(90%,380px);` +
				`display:flex;align-items:center;gap:11px;padding:8px 9px 8px 11px;border-radius:var(--vt-caption-radius);${glass}` +
				'pointer-events:none;opacity:0;transition:opacity .3s ease;';
			const ring = doc.createElement('span');
			ring.setAttribute('aria-hidden', 'true');
			ring.style.cssText = 'flex:none;position:relative;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--vt-accent) 0%, rgba(255,255,255,.18) 0);';
			const hole = doc.createElement('span');
			hole.style.cssText = 'width:16px;height:16px;border-radius:50%;background:var(--vt-caption-bg);display:grid;place-items:center;';
			const label = doc.createElement('b');
			label.style.cssText = 'font:800 8px/1 system-ui,sans-serif;color:var(--vt-caption-ink);letter-spacing:.02em;';
			hole.appendChild(label);
			ring.appendChild(hole);
			narration.style.cssText = 'flex:1 1 auto;min-width:0;line-height:1.35;text-align:center;font-size:13.5px;transition:opacity .18s ease;';
			dock.append(ring, narration, exit);
			exit.style.cssText += exitCircle(26);
			setProgress = (c, t) => {
				if (!(t > 0)) return;
				const pct = Math.max(0, Math.min(100, Math.round((c / t) * 100)));
				ring.style.background = `conic-gradient(var(--vt-accent) ${pct}%, rgba(255,255,255,.18) 0)`;
				label.textContent = `${c}/${t}`;
			};
		} else {
			// Responsive: near-full-width on a phone, a centered pill capped at 680px on a wide
			// screen (so a desktop host doesn't get a bar stretched across 1400px). One dock, both.
			dock.style.cssText =
				`position:absolute;left:50%;transform:translateX(-50%);${edge};z-index:10;width:calc(100vw - 24px);max-width:680px;` +
				`display:flex;align-items:center;gap:11px;padding:9px 9px 9px 15px;border-radius:var(--vt-caption-radius);${glass}` +
				'pointer-events:none;opacity:0;transition:opacity .3s ease;';
			const dot = doc.createElement('span');
			dot.setAttribute('aria-hidden', 'true');
			dot.style.cssText = `flex:none;width:9px;height:9px;border-radius:50%;background:${A};box-shadow:0 0 0 0 ${A};animation:vetrinaPulse 1.8s ease-out infinite;`;
			narration.style.cssText = 'flex:1 1 auto;min-width:0;line-height:1.35;text-align:left;font-size:13.5px;transition:opacity .18s ease;';
			dock.append(dot, narration, exit);
			exit.style.cssText += exitCircle(27);
		}
	}

	setNarration(''); // start on the hint
	return { dock, narration, setNarration, setProgress };
}

export function createStage(opts: StageOptions): Stage {
	const { root, onExit } = opts;
	const doc = root.ownerDocument ?? document;
	const portal = opts.portalRoot ?? doc.body;
	// Motion policy resolves to one of three tiers, which feed TWO independent flags:
	//   `reduced` — suppress VESTIBULAR motion (glides, expanding rings, orbit, translate/rotate
	//               wave, drag sweeps). True for BOTH 'legible' and 'still'.
	//   `still`   — collapse CONTENT cadence too (typing → instant, caption fades → instant,
	//               reading settles → short). True ONLY for 'still'.
	// A reduced-motion DEVICE ('system') lands on 'legible', never 'still': it loses the sweeps
	// but keeps the typing reveal + cross-fades + full reading time, so the demo stays watchable
	// (WCAG 2.3.3 / Apple HIG target vestibular motion, not content cadence).
	const motionPref = opts.theme?.motion ?? 'system';
	const motionMode: 'full' | 'legible' | 'still' = motionPref === 'system' ? (reducedMotion() ? 'legible' : 'full') : motionPref;
	const reduced = motionMode !== 'full';
	const still = motionMode === 'still';
	const pace = opts.theme?.pace ?? 1;
	const silenced = opts.theme?.silenced ?? new Set<string>();
	const placement = opts.theme?.placement ?? 'bottom';
	const caption = opts.theme?.caption ?? 'bar';
	let destroyed = false;

	// Token DEFAULTS live in a LOW cascade layer on `:root` (injected once), NOT inline on
	// the stage — so a host's own un-layered `:root { --vt-accent }` / `:root[data-theme=dark]`
	// cascade OVERRIDES them (CSS-first, §9) and the layer inherits the resolved value.
	// Inline defaults would beat the host's :root cascade (inline > any selector), silently
	// breaking pure-CSS theming — the exact bug the exemplar battery caught.
	ensureDefaultTokens(doc);

	// Layer host — one fixed, full-viewport, click-through container.
	const layer = doc.createElement('div');
	layer.className = 'vetrina-stage';
	// The layer is NOT aria-hidden: the Exit button must reach the a11y tree — it's the only
	// escape from the demo for an assistive-tech user, and the narration caption is a live
	// region. The purely decorative nodes (cursor, effect rings) are aria-hidden individually.
	// JS Theme convenience: an EXPLICIT per-run override, written inline (so it wins over the
	// default layer). The Studio's `accent: 'var(--accent,…)'` idiom keeps host-cascade-driven
	// values through the var() indirection — host CSS still leads when the JS value references it.
	if (opts.theme) for (const [k, v] of Object.entries(opts.theme.tokens)) layer.style.setProperty(k, v);
	layer.style.cssText +=
		`position:fixed;inset:0;z-index:${opts.zIndex ?? 2147482000};pointer-events:none;` +
		'font:500 14px system-ui,-apple-system,sans-serif;';

	const cursor = doc.createElement('div');
	cursor.className = 'vetrina-cursor';
	cursor.setAttribute('aria-hidden', 'true');
	cursor.style.cssText =
		'position:absolute;top:0;left:0;z-index:8;width:28px;height:28px;' +
		'transform:translate(-50%,-50%);will-change:transform,left,top;transition:opacity .25s ease;opacity:0;';
	cursor.innerHTML = cursorInner(opts.theme?.pointer ?? 'arrow');

	// ── The narration DOCK — one of four curated styles (theme.caption; §redesign 2026-07-06).
	// buildDock owns the per-style structure; the `dock` + `narration` it returns stay stable so
	// say() / the fade-in / contains() are style-agnostic. Exit is always an icon button inside
	// `.vetrina-caption`, so the take-over guard still reads it as chrome (layer.contains).
	const { dock, narration, setNarration, setProgress } = buildDock(doc, caption, placement, onExit);

	// One-time keyframes for the live-dot pulse (idempotent — id-guarded).
	if (!doc.getElementById('vetrina-keyframes')) {
		const style = doc.createElement('style');
		style.id = 'vetrina-keyframes';
		style.textContent =
			'@keyframes vetrinaPulse{0%{box-shadow:0 0 0 0 var(--vt-accent)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}';
		doc.head.appendChild(style);
	}

	layer.append(dock, cursor);
	portal.appendChild(layer);

	let cx = window.innerWidth / 2;
	let cy = window.innerHeight * 0.42;
	const place = (x: number, y: number) => {
		cx = x;
		cy = y;
		cursor.style.left = `${x}px`;
		cursor.style.top = `${y}px`;
	};
	place(cx, cy);

	function spawnFx(x: number, y: number, css: string, frames: Keyframe[], timing: KeyframeAnimationOptions, life: number, z = 4): void {
		if (destroyed) return;
		const el = doc.createElement('div');
		el.setAttribute('aria-hidden', 'true');
		el.style.cssText = `position:absolute;left:${x}px;top:${y}px;z-index:${z};transform:translate(-50%,-50%);pointer-events:none;${css}`;
		layer.appendChild(el);
		el.animate(frames, timing);
		window.setTimeout(() => el.remove(), life);
	}

	const aimAt = (r: DOMRect) => ({ x: r.left + Math.min(r.width * 0.5, 22), y: r.top + Math.min(r.height * 0.5, 18) });

	requestAnimationFrame(() => {
		if (destroyed) return;
		dock.style.opacity = '1';
		cursor.style.opacity = '1';
	});

	// A rAF-driven tween of the cursor between two points, racing the signal.
	function tween(tx: number, ty: number, dur: number, signal?: AbortSignal): Promise<void> {
		const fromX = cx;
		const fromY = cy;
		const start = performance.now();
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(new AbortError());
			signal?.addEventListener('abort', onAbort, { once: true });
			const tick = (now: number) => {
				if (destroyed || signal?.aborted) return;
				const t = Math.min(1, (now - start) / dur);
				const e = easeInOut(t);
				place(fromX + (tx - fromX) * e, fromY + (ty - fromY) * e);
				if (t < 1) requestAnimationFrame(tick);
				else {
					signal?.removeEventListener('abort', onAbort);
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});
	}

	// The anticipation cue — a streak from the cursor toward the target + two ping rings
	// where it lands, so the eye leads the glide. Non-blocking.
	function anticipate(el: HTMLElement): void {
		if (reduced || destroyed) return;
		const { x: tx, y: ty } = aimAt(el.getBoundingClientRect());
		const ang = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
		const dist = Math.hypot(tx - cx, ty - cy);
		spawnFx(
			cx,
			cy,
			`height:5px;border-radius:5px;width:${Math.min(dist, 220)}px;transform-origin:left center;background:linear-gradient(90deg,transparent 4%,${A});box-shadow:0 0 12px ${A};`,
			[
				{ transform: `translate(0,-50%) rotate(${ang}deg) scaleX(0)`, opacity: 0 },
				{ transform: `translate(0,-50%) rotate(${ang}deg) scaleX(1)`, opacity: 1, offset: 0.55 },
				{ transform: `translate(0,-50%) rotate(${ang}deg) scaleX(1)`, opacity: 0 },
			],
			{ duration: 720, easing: 'cubic-bezier(.2,.7,.3,1)' },
			760,
		);
		for (let k = 0; k < 2; k++)
			spawnFx(
				tx,
				ty,
				`width:44px;height:44px;border-radius:50%;border:2.5px solid ${A};box-shadow:${RING_SHADOW};opacity:0;`,
				[
					{ transform: 'translate(-50%,-50%) scale(.35)', opacity: 0.8 },
					{ transform: 'translate(-50%,-50%) scale(2.0)', opacity: 0 },
				],
				{ duration: 1350, delay: k * 300, easing: 'ease-out' },
				1750 + k * 320,
			);
	}

	async function moveToEl(el: HTMLElement, signal?: AbortSignal): Promise<void> {
		// Re-read the rect at glide time (D4.1): the host may have scrolled/reflowed since.
		const { x: tx, y: ty } = aimAt(el.getBoundingClientRect());
		if (reduced) {
			place(tx, ty);
			return wait(160, signal);
		}
		const dur = Math.max(300, Math.min(820, Math.hypot(tx - cx, ty - cy))) * pace;
		return tween(tx, ty, dur, signal);
	}

	async function press(signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		if (silenced.has('press')) return wait(reduced ? 80 : 300 * pace, signal);
		cursor.animate(
			[
				{ transform: 'translate(-50%,-50%) scale(1)' },
				{ transform: 'translate(-50%,-50%) scale(0.78)' },
				{ transform: 'translate(-50%,-50%) scale(1)' },
			],
			{ duration: 420, easing: 'ease-out' },
		);
		// The in-place cursor scale pulse above is the tap's non-vestibular feedback and always
		// plays. The expanding click ring + 10 radiating spark bars ARE vestibular (an outward
		// sweep), so the 'legible'/'still' tiers suppress them — same contract intro() honors for
		// its opening rings. The cursor pulse alone still marks where the tap landed.
		if (!reduced) {
			spawnFx(
				cx,
				cy,
				`width:44px;height:44px;border-radius:50%;border:3.5px solid ${A};box-shadow:${RING_SHADOW};`,
				[
					{ transform: 'translate(-50%,-50%) scale(.25)', opacity: 1 },
					{ transform: 'translate(-50%,-50%) scale(2.7)', opacity: 0 },
				],
				{ duration: 950, easing: 'cubic-bezier(.2,.7,.3,1)' },
				1000,
			);
			for (let i = 0; i < 10; i++) {
				const a = (i / 10) * Math.PI * 2;
				spawnFx(
					cx,
					cy,
					`width:15px;height:3.5px;border-radius:3px;background:${A};box-shadow:${BAR_SHADOW};transform-origin:center;`,
					[
						{ transform: `translate(-50%,-50%) rotate(${a}rad) translateX(10px)`, opacity: 1 },
						{ transform: `translate(-50%,-50%) rotate(${a}rad) translateX(44px)`, opacity: 0 },
					],
					{ duration: 820, easing: 'ease-out' },
					860,
				);
			}
		}
		return wait(reduced ? 80 : 480, signal);
	}

	async function drag(from: Target, to: Target, signal?: AbortSignal): Promise<DragHandle> {
		const fromEl = resolve(from);
		const toEl = resolve(to);
		// Pick up: glide to `from` + a grab pulse.
		if (fromEl) {
			await moveToEl(fromEl, signal);
			if (!reduced)
				spawnFx(
					cx,
					cy,
					`width:30px;height:30px;border-radius:50%;border:2.5px solid ${A};box-shadow:${RING_SHADOW};`,
					[
						{ transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
						{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 1 },
					],
					{ duration: 360, easing: 'ease-out' },
					400,
				);
			await wait(reduced ? 60 : 240, signal);
		}
		// A carried chip rides with the cursor (reads as "holding", not a plain move).
		const carried = doc.createElement('div');
		carried.style.cssText =
			`position:absolute;left:${cx}px;top:${cy}px;z-index:7;width:14px;height:14px;border-radius:4px;background:${A};` +
			'box-shadow:0 4px 10px rgba(0,0,0,.3),0 0 0 2px var(--vt-cursor-stroke);transform:translate(-50%,-50%);pointer-events:none;opacity:.92;';
		layer.appendChild(carried);
		let carrying = true;
		const followLoop = () => {
			if (!carrying || destroyed) return;
			carried.style.left = `${cx}px`;
			carried.style.top = `${cy}px`;
			requestAnimationFrame(followLoop);
		};
		requestAnimationFrame(followLoop);
		// Glide to `to` — re-read the rect at glide time + scroll it into view (D4.1), since the
		// reorder reflow hasn't happened yet (that waits on the gated drop).
		if (toEl) {
			toEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
			const r = toEl.getBoundingClientRect();
			const tx = r.left + Math.min(r.width * 0.5, 22);
			const ty = r.top + Math.min(r.height * 0.5, 18);
			if (reduced) place(tx, ty);
			else await tween(tx, ty, Math.max(300, Math.min(820, Math.hypot(tx - cx, ty - cy))), signal);
		}
		const stopCarry = () => {
			carrying = false;
			carried.remove();
		};
		return {
			async drop(sig?: AbortSignal) {
				if (destroyed) return;
				if (!reduced)
					spawnFx(
						cx,
						cy,
						`width:36px;height:36px;border-radius:50%;border:3px solid ${A};box-shadow:${RING_SHADOW};`,
						[
							{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
							{ transform: 'translate(-50%,-50%) scale(2)', opacity: 0 },
						],
						{ duration: 600, easing: 'ease-out' },
						650,
					);
				stopCarry();
				await wait(reduced ? 40 : 240, sig ?? signal);
			},
			async snapBack(sig?: AbortSignal) {
				// Glide back to `from` + a shake — the honest "the move didn't happen".
				if (fromEl && !reduced) {
					const r = fromEl.getBoundingClientRect();
					await tween(r.left + Math.min(r.width * 0.5, 22), r.top + Math.min(r.height * 0.5, 18), 360, sig ?? signal).catch(() => {});
				}
				stopCarry();
				await shake(sig ?? signal).catch(() => {});
			},
		};
	}

	// A small SVG glyph that blooms at a point — used by check / cross.
	function glyphBloom(x: number, y: number, path: string): void {
		spawnFx(
			x,
			y,
			`width:52px;height:52px;`,
			[
				{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
				{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.35 },
				{ transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.8 },
				{ transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0 },
			],
			{ duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)' },
			1200,
		);
		// The glyph itself, layered over the bloom node's box via innerHTML on a sibling.
		const g = doc.createElement('div');
		g.style.cssText = `position:absolute;left:${x}px;top:${y}px;z-index:6;transform:translate(-50%,-50%);pointer-events:none;`;
		g.innerHTML =
			`<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="${path}" stroke="${A}" stroke-width="3" ` +
			'stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px var(--vt-accent))"/></svg>';
		layer.appendChild(g);
		g.animate(
			[
				{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
				{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
				{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 },
				{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
			],
			{ duration: 1200, easing: 'ease-out' },
		);
		window.setTimeout(() => g.remove(), 1250);
	}

	async function circleGesture(el: HTMLElement, signal?: AbortSignal): Promise<void> {
		const r = el.getBoundingClientRect();
		const mx = r.left + r.width / 2;
		const my = r.top + r.height / 2;
		const glow = doc.createElement('div');
		glow.style.cssText =
			`position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:3;` +
			`border-radius:14px;border:3px solid ${A};box-shadow:0 0 0 1.5px var(--vt-glow-halo),0 0 36px 2px ${A};opacity:0;pointer-events:none;`;
		layer.appendChild(glow);
		glow.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.22 }, { opacity: 0.85, offset: 0.75 }, { opacity: 0 }], {
			duration: 1600,
			easing: 'ease-in-out',
		});
		window.setTimeout(() => glow.remove(), 1700);
		if (reduced) return wait(500, signal);
		const rx = Math.min(r.width * 0.42, 260);
		const ry = Math.min(r.height * 0.42, 180);
		const a0 = Math.atan2(cy - my, cx - mx);
		const dur = 1400;
		const start = performance.now();
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(new AbortError());
			signal?.addEventListener('abort', onAbort, { once: true });
			const tick = (now: number) => {
				if (destroyed || signal?.aborted) return;
				const t = Math.min(1, (now - start) / dur);
				const a = a0 + easeInOut(t) * Math.PI * 2 * 1.25;
				place(mx + rx * Math.cos(a), my + ry * Math.sin(a));
				if (t < 1) requestAnimationFrame(tick);
				else {
					signal?.removeEventListener('abort', onAbort);
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});
	}

	async function shake(signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		if (reduced) return wait(120, signal);
		cursor.animate(
			[
				{ transform: 'translate(-50%,-50%) translateX(0)' },
				{ transform: 'translate(-50%,-50%) translateX(-9px)' },
				{ transform: 'translate(-50%,-50%) translateX(9px)' },
				{ transform: 'translate(-50%,-50%) translateX(-6px)' },
				{ transform: 'translate(-50%,-50%) translateX(6px)' },
				{ transform: 'translate(-50%,-50%) translateX(0)' },
			],
			{ duration: 560, easing: 'ease-in-out' },
		);
		return wait(600, signal);
	}

	async function wave(signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		if (still) return wait(200, signal);
		if (reduced) {
			// Motion-safe hello: a gentle in-place scale pulse — no translateX, no rotate, so it
			// reads as a friendly greeting without the vestibular sweep of the full hand-wave.
			cursor.animate(
				[
					{ transform: 'translate(-50%,-50%) scale(1)' },
					{ transform: 'translate(-50%,-50%) scale(1.18)' },
					{ transform: 'translate(-50%,-50%) scale(1)' },
				],
				{ duration: 700, easing: 'ease-in-out' },
			);
			return wait(780, signal);
		}
		cursor.animate(
			[
				{ transform: 'translate(-50%,-50%) translateX(0) rotate(0deg)' },
				{ transform: 'translate(-50%,-50%) translateX(-11px) rotate(-15deg)' },
				{ transform: 'translate(-50%,-50%) translateX(11px) rotate(13deg)' },
				{ transform: 'translate(-50%,-50%) translateX(-7px) rotate(-9deg)' },
				{ transform: 'translate(-50%,-50%) translateX(0) rotate(0deg)' },
			],
			{ duration: 1000, easing: 'ease-in-out' },
		);
		return wait(1100, signal);
	}

	async function intro(signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		if (silenced.has('intro')) {
			cursor.style.opacity = '1';
			return wait(200, signal);
		}
		place(window.innerWidth / 2, window.innerHeight * 0.46);
		if (still) {
			cursor.style.opacity = '1';
			return wait(300, signal);
		}
		if (reduced) {
			// Legible: the cursor materializes with an opacity/scale fade-in (motion-safe — no
			// translate, no expanding rings) and gives the in-place greeting, so the run still
			// opens with a "hello" the viewer registers, minus the vestibular ring sweep.
			cursor.animate(
				[
					{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' },
					{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
				],
				{ duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)' },
			);
			cursor.style.opacity = '1';
			await wait(560, signal);
			await wave(signal);
			return;
		}
		for (let k = 0; k < 3; k++)
			spawnFx(
				cx,
				cy,
				`width:64px;height:64px;border-radius:50%;border:3px solid ${A};box-shadow:${RING_SHADOW};opacity:0;`,
				[
					{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.7 },
					{ transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 },
				],
				{ duration: 1650, delay: k * 300, easing: 'ease-out' },
				2000 + k * 320,
			);
		cursor.animate(
			[
				{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' },
				{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
			],
			{ duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' },
		);
		await wait(760, signal);
		await wave(signal);
	}

	async function gesture(kind: Gesture, target?: Target, signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		const el = target != null ? resolve(target) : null;
		switch (kind) {
			case 'wave':
				return wave(signal);
			case 'circle':
				if (!el || silenced.has('circle')) return; // circle needs a target; null-resolve/silenced = no-op
				return circleGesture(el, signal);
			case 'shake':
				return shake(signal);
			case 'check': {
				const p = el ? centerOf(el) : { x: cx, y: cy };
				glyphBloom(p.x, p.y, 'M5 13 l4 4 l10 -11');
				// The dwell is READING time (register the confirm), not motion — only 'still'
				// shortens it. 'legible' keeps the full 700ms, same as the storyboard settle: a
				// reduced-motion viewer needs MORE time to read, not less.
				return wait(still ? 120 : 700, signal);
			}
			case 'cross': {
				const p = el ? centerOf(el) : { x: cx, y: cy };
				glyphBloom(p.x, p.y, 'M6 6 l12 12 M18 6 l-12 12');
				// Reading time, not motion (see 'check') — only 'still' shortens the confirm dwell.
				return wait(still ? 120 : 700, signal);
			}
		}
	}

	function centerOf(el: HTMLElement): { x: number; y: number } {
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}

	function resolve(target: Target): HTMLElement | null {
		if (destroyed) return null;
		if (typeof target === 'string') return root.querySelector<HTMLElement>(target); // ROOT-scoped
		if (typeof target === 'function') return target(); // the portal escape hatch
		return target;
	}

	async function point(target: Target, signal?: AbortSignal): Promise<void> {
		if (destroyed) return;
		const el = resolve(target);
		if (!el) return; // null-resolve = no-op (no wait, no throw)
		if (!silenced.has('anticipate')) anticipate(el);
		await wait(reduced ? 0 : 480 * pace, signal); // the register beat — let the eye lead
		await moveToEl(el, signal);
	}

	// Update the narration with a gentle cross-fade (the DOCK itself stays up — Exit must never
	// blink out). '' reverts to the take-over hint, so the dock is never empty.
	let sayTimer = 0;
	function say(text: string): void {
		if (destroyed) return;
		// Only 'still' snaps the caption in place. Under 'legible' the 140ms opacity cross-fade
		// stays — it is the motion-SAFE swap (Apple HIG cross-fades in place of a slide), not a
		// vestibular trigger, and it keeps the narration readable rather than flickering.
		if (still) {
			setNarration(text);
			return;
		}
		narration.style.opacity = '0';
		window.clearTimeout(sayTimer);
		sayTimer = window.setTimeout(() => {
			if (destroyed) return;
			setNarration(text);
			narration.style.opacity = '1';
		}, 140);
	}

	return {
		say,
		progress: (current, total) => {
			if (!destroyed) setProgress(current, total);
		},
		point,
		press,
		drag,
		gesture,
		intro,
		resolve,
		reduced,
		still,
		pace,
		contains: (node) => node instanceof Node && layer.contains(node),
		destroy: () => {
			destroyed = true;
			layer.remove();
		},
	};
}
