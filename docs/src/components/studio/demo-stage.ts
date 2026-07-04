// The DEMO STAGE — the parent-document theater layer for the Studio's self-driving
// walkthrough. It owns everything a viewer SEES that isn't the Studio itself: a
// fake cursor that glides between controls, a click ripple, a narration caption,
// and the "▶ Demo" chrome (an Exit button + a "click anywhere to take over" hint).
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
	/** Glide the cursor to an element's center; resolves when it arrives. */
	moveToEl: (el: HTMLElement, signal?: AbortSignal) => Promise<void>;
	/** Play a click ripple at the cursor's current position. */
	press: (signal?: AbortSignal) => Promise<void>;
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
		'position:absolute;top:0;left:0;width:26px;height:26px;' +
		'transform:translate(-50%,-50%);will-change:transform,left,top;' +
		'transition:opacity .25s ease;opacity:0;';
	cursor.innerHTML =
		'<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
		'<path d="M5 3 L5 20 L9.5 15.8 L12.4 22.5 L15.4 21.2 L12.5 14.6 L18.6 14.4 Z" ' +
		'fill="var(--accent, #2b6ef2)" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>' +
		'</svg>';
	// A pulse ring for the click ripple, riding under the cursor tip.
	const ripple = document.createElement('div');
	ripple.className = 'studio-demo-ripple';
	ripple.style.cssText =
		'position:absolute;top:0;left:0;width:16px;height:16px;border-radius:50%;' +
		'transform:translate(-50%,-50%) scale(0.2);opacity:0;' +
		'border:2px solid var(--accent, #2b6ef2);pointer-events:none;';

	// Caption bar — bottom-center narration, dark scrim so it reads in light AND dark.
	const caption = document.createElement('div');
	caption.className = 'studio-demo-caption';
	caption.style.cssText =
		'position:absolute;left:50%;bottom:76px;transform:translateX(-50%);' +
		'max-width:min(640px,86vw);padding:11px 20px;border-radius:999px;' +
		'background:rgba(12,14,20,.86);color:#f4f6fb;line-height:1.45;text-align:center;' +
		'box-shadow:0 10px 34px rgba(0,0,0,.42);opacity:0;transition:opacity .3s ease;' +
		'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

	// Chrome — a "▶ Demo" badge + Exit button + take-over hint, top-center.
	const chrome = document.createElement('div');
	chrome.className = 'studio-demo-chrome';
	chrome.style.cssText =
		'position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
		'display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;' +
		'border-radius:999px;background:rgba(12,14,20,.86);color:#f4f6fb;' +
		'box-shadow:0 8px 26px rgba(0,0,0,.4);pointer-events:none;opacity:0;' +
		'transition:opacity .3s ease;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
	const badge = document.createElement('span');
	badge.textContent = 'Demo';
	badge.style.cssText =
		'display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:13px;';
	badge.insertAdjacentHTML(
		'afterbegin',
		'<span style="width:8px;height:8px;border-radius:50%;background:var(--accent,#2b6ef2);' +
			'box-shadow:0 0 0 0 var(--accent,#2b6ef2);animation:studioDemoPulse 1.8s ease-out infinite"></span>',
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

	layer.append(caption, chrome, ripple, cursor);
	document.body.appendChild(layer);

	// Track the cursor's logical position (viewport coords) between glides.
	let cx = window.innerWidth / 2;
	let cy = window.innerHeight * 0.42;
	const place = (x: number, y: number) => {
		cx = x;
		cy = y;
		cursor.style.left = `${x}px`;
		cursor.style.top = `${y}px`;
		ripple.style.left = `${x}px`;
		ripple.style.top = `${y}px`;
	};
	place(cx, cy);
	// Reveal the chrome + cursor on the next frame (so the fade-in plays).
	requestAnimationFrame(() => {
		chrome.style.opacity = '1';
		cursor.style.opacity = '1';
	});

	async function moveToEl(el: HTMLElement, signal?: AbortSignal): Promise<void> {
		const r = el.getBoundingClientRect();
		// Aim a touch inside the top-left quadrant of the target — where a real
		// pointer tip lands on a control, not dead-center on large panes.
		const tx = r.left + Math.min(r.width * 0.5, 22);
		const ty = r.top + Math.min(r.height * 0.5, 18);
		if (reduced) {
			place(tx, ty);
			return wait(160, signal);
		}
		const fromX = cx;
		const fromY = cy;
		const dist = Math.hypot(tx - fromX, ty - fromY);
		// Duration scales with distance, clamped — a near hop is quick, a cross-screen
		// sweep is deliberate but never sluggish.
		const dur = Math.max(260, Math.min(720, dist * 0.9));
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
		// A quick cursor "dip" + an expanding ripple ring — reads as a click.
		cursor.animate(
			[
				{ transform: 'translate(-50%,-50%) scale(1)' },
				{ transform: 'translate(-50%,-50%) scale(0.82)' },
				{ transform: 'translate(-50%,-50%) scale(1)' },
			],
			{ duration: 260, easing: 'ease-out' },
		);
		ripple.animate(
			[
				{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0.9 },
				{ transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 },
			],
			{ duration: 420, easing: 'ease-out' },
		);
		return wait(reduced ? 80 : 300, signal);
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
		moveToEl,
		press,
		say,
		contains: (target) => target instanceof Node && layer.contains(target),
		reduced,
		destroy: () => layer.remove(),
	};
}
