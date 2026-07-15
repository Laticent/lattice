// Adaptive frame-aligned render scheduler — the "video-game render loop" shared by BOTH
// live-preview paths: the single-slide DeckPreview (Studio / landing / showcases) and the
// multi-slide Playground filmstrip. Extracted from the Playground copy and adopted by
// DeckPreview too, so the one state machine lives in ONE place — no drift between two
// copies (the risk the earlier deliberate duplication carried; the missing wall-clock
// backstop was exactly that drift, now impossible with a single kernel).
//
// It replaces a fixed trailing debounce. A change marks the preview dirty and schedules ONE
// render on the next animation frame; a burst within a frame collapses into a single render
// of the latest state (coalescing, bounded by the frame rate rather than a fixed timer).
// ADAPTIVE: a cheap render (a section/body patch, ~2ms) reschedules on the next frame for
// instant live feedback; a heavy render — a full srcdoc rewrite (theme/mode/size reparse)
// OR one that simply TOOK too long (a big-deck O(N) `__latticeFit` reflow, a fat/math slide)
// — coalesces on a short trailing timer so it can't strobe / storm. An in-flight guard
// applies backpressure (never overlap two renders on the one iframe); a watchdog clears the
// guard if a render never settles (a hung engine/theme load) so edits can't wedge.
//
// API: schedule() (frame-aligned, coalesced — the edit path); flush() (render NOW, still
// backpressured — a host's first paint / eager one-shot that must not wait for a frame);
// cancel() (drop a pending frame).
//
// See engineering/decisions/2026-07-15-frame-aligned-preview-render.md (single-slide) and
// 2026-07-15-playground-frame-loop-decouple.md (filmstrip + the shared-kernel convergence).

export type FrameSchedulerOptions = {
	/**
	 * Run one render of the LATEST state. Resolves to `{ heavy }` — true when the render
	 * was a full srcdoc write (so the NEXT render coalesces instead of firing next-frame).
	 * Returning nothing (or throwing) is treated as "not heavy"; the scheduler always
	 * clears its in-flight guard so a failed render can't wedge the loop.
	 */
	render: () => Promise<{ heavy: boolean } | undefined>;
	/** Trailing coalesce window (ms) after a heavy render. Default 120 (~the retired debounce). */
	heavyCoalesceMs?: number;
	/**
	 * Wall-clock backstop (ms): a render that TOOK longer than this is treated as heavy
	 * even if the host reported a cheap patch — so the NEXT render coalesces instead of
	 * firing next-frame. This is the safety valve the single-slide sibling added after its
	 * red-team pass (`DeckPreview.tsx` HEAVY_RENDER_MS): a filmstrip patch is NOT the ~2ms
	 * single-slide patch — `patchSections` ends every patch with an O(N-section) `__latticeFit`
	 * reflow ("a layout storm on large decks", deck-preview.js). Without this, a 50-slide deck
	 * would run that storm every frame while typing. Default 50 (matches the sibling).
	 */
	heavyRenderMs?: number;
	/** Backstop (ms) to clear a stuck in-flight guard if a render never settles. Default 4000. */
	watchdogMs?: number;
};

export type FrameScheduler = {
	/** Request a render of the latest state — call on every edit. Coalesces automatically. */
	schedule: () => void;
	/**
	 * Render NOW (not next-frame), still honoring the in-flight backpressure guard — for a
	 * host's first paint or an eager one-shot that must not wait for a frame. If a render is
	 * already in flight it marks dirty and defers (same as schedule), so it never overlaps.
	 */
	flush: () => void;
	/** Cancel a pending frame/timer (deck swap supersede, teardown). Does not abort an in-flight render. */
	cancel: () => void;
};

export function createFrameScheduler({ render, heavyCoalesceMs = 120, heavyRenderMs = 50, watchdogMs = 4000 }: FrameSchedulerOptions): FrameScheduler {
	let raf = 0;
	let timer = 0;
	let dirty = false; // a change is waiting for a paint
	let inFlight = false; // a render is resolving right now
	let lastHeavy = false; // was the last render a full write? → coalesce the next one

	const scheduleNext = () => {
		if (raf || timer) return; // one pending schedule at a time (dedup a burst → 1 render)
		if (lastHeavy) {
			timer = window.setTimeout(() => {
				timer = 0;
				commit();
			}, heavyCoalesceMs);
		} else {
			raf = requestAnimationFrame(() => {
				raf = 0;
				commit();
			});
		}
	};

	const commit = () => {
		// Backpressure: a render is still resolving → mark dirty and bail; its settle
		// reschedules, so the newest state paints the moment it finishes.
		if (inFlight) {
			dirty = true;
			return;
		}
		dirty = false;
		inFlight = true;
		let settled = false;
		const done = (heavy: boolean) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(watchdog);
			inFlight = false;
			lastHeavy = heavy;
			if (dirty) scheduleNext();
		};
		// If the render never settles (hung engine/theme load), unwedge on the backstop
		// keeping the prior regime as the guess for the next schedule.
		const watchdog = window.setTimeout(() => done(lastHeavy), watchdogMs);
		const t0 = performance.now();
		Promise.resolve(render())
			// Heavy if the host said so (a full write) OR the render simply TOOK too long —
			// the wall-clock backstop that catches a slow patch (the filmstrip's O(N) FIT
			// storm on a big deck) so the next render coalesces instead of firing next-frame.
			.then((r) => done(!!r?.heavy || performance.now() - t0 > heavyRenderMs))
			.catch(() => done(false));
	};

	return {
		schedule() {
			dirty = true;
			scheduleNext();
		},
		flush() {
			// Commit immediately (commit() itself is backpressured: if a render is in flight
			// it marks dirty and bails, and that render's settle reschedules).
			commit();
		},
		cancel() {
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
			if (timer) {
				window.clearTimeout(timer);
				timer = 0;
			}
			dirty = false;
		},
	};
}
