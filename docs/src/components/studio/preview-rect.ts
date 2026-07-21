// PROTOTYPE (option B) — compute the preview box rect as a PURE FUNCTION of known inputs,
// instead of measuring the flex layout. The app currently sizes its preview box via
// `width: min(100%, 100cqh × ratio, 760px)` against a `container-type:size` holder and then
// MEASURES the result to place the hoisted host; the pre-hydration shell can't measure, so
// it replays the last measurement. If the rect is instead a closed-form function of
// (viewport, split, deck ratio, stop, breakpoint) + fixed chrome constants, the app, the
// instant shell, and the engine host can all share ONE source of truth — no measurement, no
// `100cqh` 0-collapse race, and the shell computes the exact box on the FIRST load with no
// persisted rect. Constants are measured from the live app (docs at 2026-07-21); they are
// CSS-fixed (identical across breakpoints), so they belong here as the shared contract.

export const PREVIEW_CHROME = {
	topbarH: 54, // the studio topbar (StudioShell `header` h-[54px])
	mobileBarH: 53, // mobile only: the pane-toggle bar below the topbar (pane starts at 107)
	padDesktop: 20, // holder `sm:p-5` (viewport >= 640px)
	padMobile: 16, // holder `p-4` (viewport < 640px)
	// Chrome ABOVE/BELOW the holder inside the preview pane, per stop (CSS-fixed):
	//  read/chromeless — no preview header, a 49px read affordance below.
	//  write/build     — 47px preview header, 81.6px slide-navigator below.
	headerRead: 0,
	headerWrite: 47,
	footerRead: 49,
	footerWrite: 81.6,
	cap: 760, // the comfort width cap; LIFTED at the chromeless (read/cinema) stop
	defaultPreviewFrac: 0.54, // editor|preview split — preview's share (ResizablePanel defaultSize 54)
} as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export type PreviewRectInputs = {
	vw: number;
	vh: number;
	breakpoint: Breakpoint;
	/** Read stop or landscape phone — the full-bleed, chromeless preview (no header/nav, cap lifted). */
	chromeless: boolean;
	/** Preview's share of the editor|preview split (0..1). Ignored at read/mobile (full width). */
	previewFrac?: number;
	/** Deck aspect [w,h] — the author-chosen size. */
	ratio: [number, number];
};

export type Rect = { x: number; y: number; w: number; h: number };

// Compute the preview box rect in viewport coordinates. Models the read (full-bleed), write
// (editor|preview split), and mobile (single pane) states. NOT modeled: the build stop's side
// panels (settings/assistant reduce the pane width) and the landscape-phone cinema padding —
// callers fall back to measurement/replay there.
export function computePreviewRect(i: PreviewRectInputs): Rect {
	const C = PREVIEW_CHROME;
	const mobile = i.breakpoint === 'mobile';
	const pad = i.vw < 640 ? C.padMobile : C.padDesktop;
	const paneTop = C.topbarH + (mobile ? C.mobileBarH : 0);
	const headerH = i.chromeless ? C.headerRead : C.headerWrite;
	const footerH = i.chromeless ? C.footerRead : C.footerWrite;
	const cap = i.chromeless ? Number.POSITIVE_INFINITY : C.cap;

	// Preview pane geometry. Full-width at read/mobile; the split's right pane otherwise.
	let paneX: number;
	let paneW: number;
	if (i.chromeless || mobile) {
		paneX = 0;
		paneW = i.vw;
	} else {
		const f = i.previewFrac ?? C.defaultPreviewFrac;
		paneW = i.vw * f;
		paneX = i.vw - paneW;
	}
	const paneH = i.vh - paneTop;

	// Fit the deck-ratio box inside the padded holder, centered.
	const ratio = i.ratio[0] / i.ratio[1];
	const contentW = paneW - 2 * pad;
	const contentH = paneH - headerH - footerH - 2 * pad;
	const w = Math.max(0, Math.min(contentW, contentH * ratio, cap));
	const h = w / ratio;
	const x = paneX + pad + (contentW - w) / 2;
	const y = paneTop + headerH + pad + (contentH - h) / 2;
	return { x, y, w, h };
}
