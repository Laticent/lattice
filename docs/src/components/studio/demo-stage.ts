// The DEMO STAGE — the parent-document theater layer for the Studio's self-driving
// walkthrough. It owns everything a viewer SEES that isn't the Studio itself: a
// fake cursor that glides between controls, the attention cues (anticipation
// streak + ping, click burst, region circle + glow), an opening flourish, a
// narration caption, and the "▶ Demo" chrome (Exit + "click to take over").
//
// WHY PARENT-HOSTED (same reasoning as video-overlay.js). The stage is a set of
// `position:fixed`, `pointer-events:none` nodes on <body>, OVER the live Studio —
// never inside the preview iframe (which strips injected nodes via HARD RULE #22)
// and never intercepting real input. The one exception is the Exit button, which
// opts back into pointer events so a viewer can leave deliberately.
//
// The cursor is THEATER: it only shows WHERE an action lands. The real state change
// is driven by the director through the Studio's own setters — never by dispatching
// a synthetic click here. That split is what makes "take over" unambiguous: while
// the demo runs, the ONLY real pointer/keydown events come from the viewer.
//
// The cue grammar (two primitives, learned in the first beats): a soft PING/STREAK
// leads the eye to where the cursor is headed; a sharp BURST confirms a click. Both
// are sized and paced to be followable — the same "let the eye keep up" call we made
// for the typing speed.

const ACCENT = 'var(--accent, #2b6ef2)';

/** Ease-in-out cubic — a natural cursor glide (fast middle, soft ends). */
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

/** Rejects with an AbortError the instant `signal` aborts — the take-over path. */
class AbortError extends Error {
	constructor() {
		super('demo aborted');
		this.name = 'AbortError';
	}
}
export function isAbortError(e: unknown): boolean {
	return e instanceof Error && e.name === 'AbortError';
}

/** A cancelable sleep — resolves after `ms`, or rejects if `signal` aborts first. */
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

export type DemoStage = {
	/** Resolve a selector to an element within the Studio (or null). */
	resolve: (selector: string) => HTMLElement | null;
	/** The opening flourish: the cursor materializes at center with an expanding
	 *  halo and a friendly wave, then it's ready to work. */
	intro: (signal?: AbortSignal) => Promise<void>;
	/** Fire the anticipation cue toward an element — a streak from the cursor plus a
	 *  ping ring where it lands — so the eye leads the glide. Non-blocking. */
	anticipate: (el: HTMLElement) => void;
	/** Glide the cursor to an element's center; resolves when it arrives. */
	moveToEl: (el: HTMLElement, signal?: AbortSignal) => Promise<void>;
	/** Play the click burst (ring + speed-ticks) at the cursor's current position. */
	press: (signal?: AbortSignal) => Promise<void>;
	/** Circle an element (a preview, say) with the cursor while its frame glows —
	 *  the "look what rendered" gesture. */
	circle: (el: HTMLElement, signal?: AbortSignal) => Promise<void>;
	/** Show a narration caption (persists until replaced or cleared). */
	say: (text: string) => void;
	/** True if an event target belongs to the stage (e.g. the Exit button) — so the
	 *  host's take-over listener ignores the viewer's own demo-chrome clicks. */
	contains: (target: EventTarget | null) => boolean;
	/** Whether reduced motion is in effect (director shortens its pacing). */
	reduced: boolean;
	/** Tear the stage down and remove every node. */
	destroy: () => void;
};

/**
 * Mount the demo stage over the Studio.
 * @param root  The Studio root element (selectors resolve within it).
 * @param onExit Called when the viewer clicks the Exit button.
 */
export function createDemoStage(root: HTMLElement, onExit: () => void): DemoStage {
	const reduced = reducedMotion();

	// Layer host — one fixed, full-viewport, click-through container.
	const layer = document.createElement('div');
	layer.className = 'studio-demo-stage';
	layer.setAttribute('aria-hidden', 'true');
	layer.style.cssText =
		'position:fixed;inset:0;z-index:2147482000;pointer-events:none;' +
		'font:500 14px system-ui,-apple-system,sans-serif;';

	// The cursor — an accent-tinted arrow with a soft ring, centered on its hotspot.
	const cursor = document.createElement('div');
	cursor.className = 'studio-demo-cursor';
	cursor.style.cssText =
		'position:absolute;top:0;left:0;z-index:8;width:28px;height:28px;' +
		'transform:translate(-50%,-50%);will-change:transform,left,top;' +
		'transition:opacity .25s ease;opacity:0;';
	cursor.innerHTML =
		'<svg width="28" height="28" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
		'<path d="M5 3 L5 20 L9.5 15.8 L12.4 22.5 L15.4 21.2 L12.5 14.6 L18.6 14.4 Z" ' +
		`fill="${ACCENT}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>` +
		'</svg>';

	// Caption bar — bottom-center narration, dark scrim so it reads in light AND dark.
	const caption = document.createElement('div');
	caption.className = 'studio-demo-caption';
	caption.style.cssText =
		'position:absolute;left:50%;bottom:76px;z-index:9;transform:translateX(-50%);' +
		'max-width:min(640px,86vw);padding:11px 20px;border-radius:999px;' +
		'background:rgba(12,14,20,.86);color:#f4f6fb;line-height:1.45;text-align:center;' +
		'box-shadow:0 10px 34px rgba(0,0,0,.42);opacity:0;transition:opacity .3s ease;' +
		'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

	// Chrome — a "▶ Demo" badge + Exit button + take-over hint, top-center.
	const chrome = document.createElement('div');
	chrome.className = 'studio-demo-chrome';
	chrome.style.cssText =
		'position:absolute;top:14px;left:50%;z-index:10;transform:translateX(-50%);' +
		'display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;' +
		'border-radius:999px;background:rgba(12,14,20,.86);color:#f4f6fb;' +
		'box-shadow:0 8px 26px rgba(0,0,0,.4);pointer-events:none;opacity:0;' +
		'transition:opacity .3s ease;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
	const badge = document.createElement('span');
	badge.textContent = 'Demo';
	badge.style.cssText = 'display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:13px;';
	badge.insertAdjacentHTML(
		'afterbegin',
		`<span style="width:8px;height:8px;border-radius:50%;background:${ACCENT};` +
			`box-shadow:0 0 0 0 ${ACCENT};animation:studioDemoPulse 1.8s ease-out infinite"></span>`,
	);
	const hint = document.createElement('span');
	hint.textContent = 'click anywhere to take over';
	hint.style.cssText = 'font-size:12px;color:rgba(244,246,251,.6);';
	const exit = document.createElement('button');
	exit.type = 'button';
	exit.textContent = 'Exit';
	exit.setAttribute('aria-label', 'Exit the demo');
	exit.style.cssText =
		'pointer-events:auto;cursor:pointer;border:0;border-radius:999px;padding:5px 13px;' +
		'font:600 12px system-ui,sans-serif;background:rgba(255,255,255,.14);color:#fff;';
	exit.addEventListener('click', (e) => {
		e.stopPropagation();
		onExit();
	});
	chrome.append(badge, hint, exit);

	layer.append(caption, chrome, cursor);
	document.body.appendChild(layer);

	// Track the cursor's logical position (viewport coords) between glides.
	let cx = window.innerWidth / 2;
	let cy = window.innerHeight * 0.42;
	const place = (x: number, y: number) => {
		cx = x;
		cy = y;
		cursor.style.left = `${x}px`;
		cursor.style.top = `${y}px`;
	};
	place(cx, cy);

	// Spawn a transient effect node (rings, streaks, ticks, glow) under the cursor.
	function spawnFx(x: number, y: number, css: string, frames: Keyframe[], timing: KeyframeAnimationOptions, life: number, z = 4): void {
		const el = document.createElement('div');
		el.style.cssText = `position:absolute;left:${x}px;top:${y}px;z-index:${z};transform:translate(-50%,-50%);pointer-events:none;${css}`;
		layer.appendChild(el);
		el.animate(frames, timing);
		window.setTimeout(() => el.remove(), life);
	}

	// The point on an element a real pointer tip would land — top-left quadrant of a
	// small control, roughly center of a big pane.
	const aimAt = (r: DOMRect) => ({
		x: r.left + Math.min(r.width * 0.5, 22),
		y: r.top + Math.min(r.height * 0.5, 18),
	});

	// Reveal the chrome + cursor on the next frame (so the fade-in plays).
	requestAnimationFrame(() => {
		chrome.style.opacity = '1';
		cursor.style.opacity = '1';
	});

	async function intro(signal?: AbortSignal): Promise<void> {
		place(window.innerWidth / 2, window.innerHeight * 0.46);
		if (reduced) return wait(300, signal);
		// Expanding halo rings at center — "the demo is beginning, watch here".
		for (let k = 0; k < 3; k++) {
			spawnFx(
				cx,
				cy,
				`width:64px;height:64px;border-radius:50%;border:2.5px solid ${ACCENT};opacity:0;`,
				[
					{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.6 },
					{ transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 },
				],
				{ duration: 1500, delay: k * 260, easing: 'ease-out' },
				1800 + k * 280,
			);
		}
		// The cursor materializes: fade + scale in.
		cursor.animate(
			[
				{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' },
				{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
			],
			{ duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' },
		);
		await wait(760, signal);
		// A friendly wave — a small sweep + tilt, like a greeting.
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
		await wait(1100, signal);
	}

	function anticipate(el: HTMLElement): void {
		if (reduced) return;
		const { x: tx, y: ty } = aimAt(el.getBoundingClientRect());
		const ang = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
		const dist = Math.hypot(tx - cx, ty - cy);
		// Streak: a line darts from the cursor toward the target along the path.
		spawnFx(
			cx,
			cy,
			`height:4px;border-radius:4px;width:${Math.min(dist, 150)}px;transform-origin:left center;background:linear-gradient(90deg,transparent,${ACCENT});`,
			[
				{ opacity: 0, transform: `translate(0,-50%) rotate(${ang}deg) scaleX(.6)` },
				{ opacity: 0.95, offset: 0.35, transform: `translate(${(tx - cx) * 0.18}px,${(ty - cy) * 0.18 - 2}px) rotate(${ang}deg) scaleX(1)` },
				{ opacity: 0, transform: `translate(${(tx - cx) * 0.62}px,${(ty - cy) * 0.62 - 2}px) rotate(${ang}deg) scaleX(1.1)` },
			],
			{ duration: 760, easing: 'ease-out' },
			820,
		);
		// Two soft ping rings bloom where the cursor is headed.
		for (let k = 0; k < 2; k++) {
			spawnFx(
				tx,
				ty,
				`width:40px;height:40px;border-radius:50%;border:2.5px solid ${ACCENT};opacity:0;`,
				[
					{ transform: 'translate(-50%,-50%) scale(.35)', opacity: 0.7 },
					{ transform: 'translate(-50%,-50%) scale(2.0)', opacity: 0 },
				],
				{ duration: 1050, delay: k * 240, easing: 'ease-out' },
				1350 + k * 260,
			);
		}
	}

	async function moveToEl(el: HTMLElement, signal?: AbortSignal): Promise<void> {
		const { x: tx, y: ty } = aimAt(el.getBoundingClientRect());
		if (reduced) {
			place(tx, ty);
			return wait(160, signal);
		}
		const fromX = cx;
		const fromY = cy;
		const dist = Math.hypot(tx - fromX, ty - fromY);
		// Duration scales with distance, clamped — a near hop is quick, a cross-screen
		// sweep is deliberate but never sluggish.
		const dur = Math.max(300, Math.min(820, dist));
		const start = performance.now();
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(new AbortError());
			signal?.addEventListener('abort', onAbort, { once: true });
			const tick = (now: number) => {
				if (signal?.aborted) return;
				const t = Math.min(1, (now - start) / dur);
				const e = easeInOut(t);
				place(fromX + (tx - fromX) * e, fromY + (ty - fromY) * e);
				if (t < 1) {
					requestAnimationFrame(tick);
				} else {
					signal?.removeEventListener('abort', onAbort);
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});
	}

	async function press(signal?: AbortSignal): Promise<void> {
		// A cursor dip + a big, slow radial burst — ring plus ten speed-ticks.
		cursor.animate(
			[
				{ transform: 'translate(-50%,-50%) scale(1)' },
				{ transform: 'translate(-50%,-50%) scale(0.78)' },
				{ transform: 'translate(-50%,-50%) scale(1)' },
			],
			{ duration: 420, easing: 'ease-out' },
		);
		spawnFx(
			cx,
			cy,
			`width:40px;height:40px;border-radius:50%;border:3px solid ${ACCENT};`,
			[
				{ transform: 'translate(-50%,-50%) scale(.25)', opacity: 1 },
				{ transform: 'translate(-50%,-50%) scale(2.7)', opacity: 0 },
			],
			{ duration: 720, easing: 'cubic-bezier(.2,.7,.3,1)' },
			760,
		);
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * Math.PI * 2;
			spawnFx(
				cx,
				cy,
				`width:14px;height:3px;border-radius:3px;background:${ACCENT};transform-origin:center;`,
				[
					{ transform: `translate(-50%,-50%) rotate(${a}rad) translateX(10px)`, opacity: 1 },
					{ transform: `translate(-50%,-50%) rotate(${a}rad) translateX(40px)`, opacity: 0 },
				],
				{ duration: 600, easing: 'ease-out' },
				640,
			);
		}
		return wait(reduced ? 80 : 520, signal);
	}

	async function circle(el: HTMLElement, signal?: AbortSignal): Promise<void> {
		const r = el.getBoundingClientRect();
		const mx = r.left + r.width / 2;
		const my = r.top + r.height / 2;
		// Frame glow — a pulsing accent outline around the region.
		const glow = document.createElement('div');
		glow.style.cssText =
			`position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:3;` +
			`border-radius:14px;border:2.5px solid ${ACCENT};box-shadow:0 0 34px ${ACCENT};opacity:0;pointer-events:none;`;
		layer.appendChild(glow);
		glow.animate(
			[{ opacity: 0 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0.85, offset: 0.78 }, { opacity: 0 }],
			{ duration: 2200, easing: 'ease-in-out' },
		);
		window.setTimeout(() => glow.remove(), 2300);
		if (reduced) return wait(700, signal);
		// The cursor traces an ellipse around the region (~1.25 loops).
		const rx = Math.min(r.width * 0.42, 260);
		const ry = Math.min(r.height * 0.42, 180);
		const a0 = Math.atan2(cy - my, cx - mx);
		const dur = 1900;
		const start = performance.now();
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(new AbortError());
			signal?.addEventListener('abort', onAbort, { once: true });
			const tick = (now: number) => {
				if (signal?.aborted) return;
				const t = Math.min(1, (now - start) / dur);
				const a = a0 + easeInOut(t) * Math.PI * 2 * 1.25;
				place(mx + rx * Math.cos(a), my + ry * Math.sin(a));
				if (t < 1) {
					requestAnimationFrame(tick);
				} else {
					signal?.removeEventListener('abort', onAbort);
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});
	}

	function say(text: string): void {
		if (!text) {
			caption.style.opacity = '0';
			return;
		}
		caption.textContent = text;
		caption.style.opacity = '1';
	}

	return {
		resolve: (selector) => root.querySelector<HTMLElement>(selector),
		intro,
		anticipate,
		moveToEl,
		press,
		circle,
		say,
		contains: (target) => target instanceof Node && layer.contains(target),
		reduced,
		destroy: () => layer.remove(),
	};
}
