import * as React from 'react';

// Positioning controller for the ONE hoisted DeckPreview host — the preview the editor
// pane AND Present now SHARE (2026-07-19 reshape: kill Present's second iframe, so
// opening Present is a PATCH/no-op instead of a cold srcdoc WRITE).
//
// HARD CONSTRAINT: relocating an <iframe> in the DOM RELOADS it. So the host node NEVER
// moves in the tree — it stays a `position:fixed` sibling of the studio root and is
// repositioned to overlay whichever SLOT is active (the editor pane's slot, or Present's
// slide-row slot) by writing top/left/width/height. "Portal by positioning", never by
// reparenting. This relies on Crux A — no `transform`/`filter`/`will-change`/`contain`
// on any ancestor of the host, so `position:fixed` fills the true viewport (a dev-only
// assertion below guards that over time).

type SlotRef = React.RefObject<HTMLElement | null>;

export function useSharedPreviewSlot({
	hostRef,
	editorSlotRef,
	presentSlotRef,
	rootRef,
	presentActive,
	editorVisible,
	suspended,
}: {
	/** The hoisted `position:fixed` host div wrapping the shared DeckPreview. */
	hostRef: React.RefObject<HTMLDivElement | null>;
	/** The editor pane's empty sizing slot. */
	editorSlotRef: SlotRef;
	/** Present's empty slide-row slot (mounted only while Present is open). */
	presentSlotRef: SlotRef;
	/** The studio root — observed so any layout reflow re-measures the active slot. */
	rootRef: React.RefObject<HTMLElement | null>;
	/** Present is open AND its current lens/slide is showable (else the host hides and
	 *  Present renders its own "unavailable" card in the slot). */
	presentActive: boolean;
	/** The editor pane's slot is on-screen (false in Fabricate and on the mobile edit
	 *  pane, where the preview stays mounted+warm but parked hidden). */
	editorVisible: boolean;
	/** True during a split-divider drag — hold re-measures (the same window
	 *  `suspendScaleObservers` freezes scaleFrame), then snap once on drag-end. */
	suspended: boolean;
}): void {
	const suspendedRef = React.useRef(suspended);
	suspendedRef.current = suspended;

	// Re-run on every switch of the active slot (Present open/close, editor-visibility
	// flip) and at drag-end. useLayoutEffect + a synchronous first measure so a switch
	// repositions the host BEFORE paint — never a frame where the preview sits over the
	// slot it just left.
	// biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the boolean inputs are the switch signal, `suspended` re-runs to snap on drag-end.
	React.useLayoutEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const slotFor = () => (presentActive ? presentSlotRef.current : editorVisible ? editorSlotRef.current : null);
		const visible = presentActive || editorVisible;

		let raf = 0;
		const measure = () => {
			raf = 0;
			const slot = slotFor();
			const r = slot?.getBoundingClientRect();
			if (!visible || !r || r.width <= 0 || r.height <= 0) {
				// Explicit-visibility model (do NOT rely on DOM occlusion): a parked slot
				// (Fabricate / mobile edit pane / collapsed preview) hides the host outright.
				host.style.visibility = 'hidden';
				return;
			}
			host.style.visibility = 'visible';
			host.style.top = `${r.top}px`;
			host.style.left = `${r.left}px`;
			host.style.width = `${r.width}px`;
			host.style.height = `${r.height}px`;
			assertNoTransformedAncestor(host);
		};
		// Coalesce observer-driven re-measures to ONE rAF so the controller can't
		// double-fit against scaleFrame's own ResizeObserver on the same host.
		const schedule = () => {
			if (suspendedRef.current) return; // held during a split drag; the effect re-runs at drag-end
			if (!raf) raf = requestAnimationFrame(measure);
		};

		measure(); // synchronous first placement on a slot switch (pre-paint)

		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
		if (ro) {
			const slot = slotFor();
			if (slot) ro.observe(slot);
			if (rootRef.current) ro.observe(rootRef.current);
		}
		window.addEventListener('resize', schedule);
		// Capture-phase scroll so a scroll in ANY nested scroller (not just the window)
		// re-measures — the slot's viewport rect moves with it.
		window.addEventListener('scroll', schedule, true);
		return () => {
			if (raf) cancelAnimationFrame(raf);
			ro?.disconnect();
			window.removeEventListener('resize', schedule);
			window.removeEventListener('scroll', schedule, true);
		};
	}, [presentActive, editorVisible, suspended, hostRef, editorSlotRef, presentSlotRef, rootRef]);
}

// Dev-only guard for Crux A. `position:fixed` fills the true viewport ONLY while no
// ancestor establishes a containing block for fixed descendants (a `transform`,
// `filter`, `perspective`, `will-change` of one of those, or `contain`). Walk the host's
// parent chain and warn if one appears, so a future CSS change on a studio wrapper can't
// silently break the shared-preview positioning. Compiled out of production builds.
function assertNoTransformedAncestor(host: HTMLElement): void {
	if (!import.meta.env?.DEV) return;
	for (let el = host.parentElement; el && el !== document.documentElement; el = el.parentElement) {
		const cs = getComputedStyle(el);
		if (
			cs.transform !== 'none' ||
			cs.filter !== 'none' ||
			cs.perspective !== 'none' ||
			/transform|filter|perspective/.test(cs.willChange) ||
			(cs.contain !== 'none' && /paint|layout|strict|content/.test(cs.contain))
		) {
			console.warn('[shared-preview] a transformed/contained ancestor breaks position:fixed placement (Crux A):', el, cs.transform, cs.contain);
			return;
		}
	}
}
