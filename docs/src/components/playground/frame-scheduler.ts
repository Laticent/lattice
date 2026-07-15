// Adaptive frame-aligned render scheduler for the Playground live preview — the
// "video-game render loop" applied to the filmstrip. This is a DELIBERATE, Playground
// -owned duplicate of the single-slide DeckPreview loop, NOT a shared kernel: the
// Playground is being decoupled from the Studio/Drawing-Board preview lineage so it can
// evolve on its own, and the owner accepted the duplication for that independence.
//
// It replaces a fixed trailing debounce. An edit marks the preview dirty and schedules
// ONE render on the next animation frame; a burst of keystrokes within a frame collapses
// into a single render of the latest state (coalescing, bounded by the frame rate rather
// than a fixed timer). ADAPTIVE: a cheap PATCH render (typing — the sig is unchanged, so
// renderDeck swaps only the changed <section> nodes, ~2ms) reschedules on the next frame
// for instant live feedback; a heavy WRITE render (a theme/mode/size change → a full
// srcdoc rewrite that reparses the ~560KB sheet) coalesces on a short trailing timer so a
// rapid sig-changing burst can't strobe the iframe. An in-flight guard applies
// backpressure (never overlap two renders on the one persistent iframe); a watchdog clears
// the guard if a render never settles (a hung engine/theme load) so edits can't wedge.
//
// See engineering/decisions/2026-07-15-playground-frame-loop-decouple.md and the
// single-slide sibling engineering/decisions/2026-07-15-frame-aligned-preview-render.md.

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
