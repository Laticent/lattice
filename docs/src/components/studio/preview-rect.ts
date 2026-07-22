// Fixed chrome constants for the Studio preview box — the CSS-fixed dimensions of the topbar,
// pane padding, per-stop header/footer, the comfort-width cap, and the split's default preview
// share. Measured from the live app (docs at 2026-07-21); identical across breakpoints, so they
// live here as the shared contract. The pre-hydration shell's first-load COMPUTE fallback
// (studio.astro) uses these to derive the Nacre box's rect when there is NO persisted preview rect
// to replay; the shell's preferred rect-REPLAY path uses the persisted viewport fractions instead
// and does not touch these constants.
//
// (History: a `computePreviewRect(inputs) → rect` closed-form prototype ["option B"] lived here to
// derive the box without measuring; that helper function was removed, and its compute logic now
// lives inline in studio.astro's seed as the first-load fallback (the shipped path prefers
// rect-REPLAY of the app's own measured rect whenever a persisted rect exists). See
// `engineering/decisions/2026-07-21-studio-preview-reframe-in-place.md`.)

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
