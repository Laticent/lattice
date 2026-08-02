// Fixed chrome constants for the Studio preview box — the CSS-fixed dimensions of the topbar,
// pane padding, per-stop header/footer, and the split's default preview share. Measured from the live app (docs at 2026-07-21); identical across breakpoints, so they
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

/**
 * Where the app persists its measured preview box (as viewport FRACTIONS) for the
 * pre-paint shell to replay. One declaration, read by the writer (StudioShell) and
 * the reader (studio.astro's seed, via define:vars).
 *
 * VERSIONED, and the version is load-bearing. A stored rect is a measurement taken
 * under the geometry rules in force at the time, and replaying one taken under
 * DIFFERENT rules paints a skeleton the hydrated app then corrects — which is the
 * jump this whole replay path exists to remove. Retiring the 760px comfort cap
 * (#1283) is exactly such a rule change: every returning user on a monitor wider
 * than ~1500px had a capped rect stored, so the shell would have painted a 760px
 * box and the app would have snapped it to as much as 1342px on first hydration.
 *
 * Bump the suffix whenever a change moves the box for the SAME inputs. A stale rect
 * under a new key is simply absent, and absent means the compute fallback runs —
 * correct by construction, at the cost of one un-replayed load.
 */
export const PREVIEW_RECT_KEY = 'lattice-studio-preview-rect-v2';

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
	// (`cap: 760` — the old comfort width cap — is RETIRED. The app no longer caps the
	//  preview box at all: the splitter grows and shrinks the slide continuously and the
	//  letterbox math bounds it (#1283). Keeping the constant here would have re-created
	//  the exact drift this file exists to prevent — the shell computing a <=760px box
	//  that the hydrated app then widens, which reads as the placeholder painting and the
	//  split line jumping straight after.)
	defaultPreviewFrac: 0.54, // editor|preview split — preview's share (ResizablePanel defaultSize 54)
} as const;
