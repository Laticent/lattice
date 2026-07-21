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
	/** Flips at a split-drag's start/end. No longer freezes tracking (the host
	 *  follows its slot LIVE through the drag); kept only as the effect's drag-end
	 *  re-run trigger, for one final authoritative snap. */
	suspended: boolean;
}): void {
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
				//
				// `opacity:0`, NOT `visibility:hidden`, is what actually hides it. The live
				// engine iframe sets its OWN inline `visibility:visible` (single-slide-render.ts
				// — its about:blank white-flash gate), and a descendant's explicit
				// `visibility:visible` OVERRIDES an ancestor's `visibility:hidden` per CSS — so
				// hiding the host with visibility alone left the slide painting over the code
				// editor (a tap fell through the pointer-transparent host, so it "bled through").
				// `opacity` multiplies down the subtree and CANNOT be overridden by a child, and
				// (unlike `display:none`) it preserves layout, so the frame stays full-size and
				// warm — per-keystroke renders on the mobile edit pane keep hitting a real box,
				// exactly as before. `visibility:hidden` rides along but only does real work in
				// the PRE-load window (before the child asserts its own visibility, it inherits
				// hidden); once the iframe has loaded, opacity is the sole hide (a loaded frame
				// stays in the a11y tree + tab order regardless — see the doc's a11y follow-up).
				host.style.visibility = 'hidden';
				host.style.opacity = '0';
				// The controller — not React — owns pointer-events, so a parked (invisible) host
				// can NEVER capture a click. `opacity:0` does not disable hit-testing, and the
				// child iframe's own `visibility:visible` makes it a hit target through the
				// ancestor's `visibility:hidden`; a React style keyed on `presentOpen` left the
				// host `pointer-events:auto` in the withheld-lens Present state (`presentOpen`
				// true, `presentActive` false) → an invisible click-eater over the "unavailable"
				// card. Parked is always click-through.
				host.style.pointerEvents = 'none';
				return;
			}
			host.style.visibility = 'visible';
			host.style.opacity = '1';
			// Only the live Present slide accepts pointer input (poster/video taps); the editor
			// slot stays click-through so a swipe reaches the pane behind it (the z-15 host is
			// pointer-transparent by design).
			host.style.pointerEvents = presentActive ? 'auto' : 'none';
			host.style.top = `${r.top}px`;
			host.style.left = `${r.left}px`;
			host.style.width = `${r.width}px`;
			host.style.height = `${r.height}px`;
			assertNoTransformedAncestor(host);
		};
		// Coalesce observer-driven re-measures to ONE rAF so the controller can't
		// double-fit against scaleFrame's own ResizeObserver on the same host. The
		// host tracks its slot LIVE — including mid-drag. Freezing it during a split
		// drag (the old behavior) left this `position:fixed` host at its PRE-drag
		// geometry while the slot shrank underneath it, so the preview slide overhung
		// the neighboring editor pane for the whole gesture — the "bleed" (glaring on
		// a slow touch drag, a brief flash under a fast mouse). Repositioning is one
		// rect read + four style writes on ONE host per frame, so live tracking is
		// cheap; the matching outer scale (scaleFrame) is likewise left live during a
		// drag (StudioShell no longer suspends it). `suspended` remains only the
		// effect's drag-end re-run trigger below (a final authoritative snap).
		const schedule = () => {
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
