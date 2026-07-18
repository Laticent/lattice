import * as React from 'react';

// The software-keyboard geometry, read from `window.visualViewport` — the ONE source of
// truth iOS Safari exposes for "how much of the layout viewport the keyboard now covers"
// (neither `100dvh` nor a `position:fixed;bottom:0` element tracks the keyboard on iOS).
//
// It publishes ONE CSS custom property on the document root and returns the same value:
//   --cs-kb-inset = the height the keyboard covers (0 when down / hardware keyboard)
// The writing surface reserves that much scroll room below the caret (padding-bottom), and
// `inset > 0` drives the mobile TYPING MODE (the top chrome collapses while the keyboard is up).
//
// (Slice 1 also positioned a keyboard-riding register RAIL off `--cs-vv-top`/`--cs-vv-height`;
// slice 4 retired that rail — formatting now lives on each slide's divider bar, so there is no
// bottom bar for the keyboard to occlude — and with it those two vars. Only the keyboard inset
// survives, for the caret reserve + typing-mode collapse.)
//
// UNVERIFIED (HARD RULE #23 — emulation is not verification): the exact inset behavior across
// the keyboard-open animation and momentum/rubber-band overscroll can only be confirmed on real
// iOS hardware. When `visualViewport` is absent the inset is 0 (typing mode simply never engages).
export function useVisualViewport(enabled: boolean): { inset: number; supported: boolean } {
	const [inset, setInset] = React.useState(0);
	const supported = typeof window !== 'undefined' && !!window.visualViewport;

	React.useEffect(() => {
		if (!enabled) return;
		const vv = typeof window !== 'undefined' ? window.visualViewport : null;
		const root = document.documentElement;
		if (!vv) return;
		let raf = 0;
		const measure = () => {
			raf = 0;
			// offsetTop moves as the page scrolls under the keyboard; height shrinks when the
			// keyboard is up. inset = the covered height (0 when down / hardware keyboard).
			const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			// The covered (keyboard) height, so the writing surface can reserve scroll room
			// BELOW the caret and the typing-mode chrome collapse can trigger.
			root.style.setProperty('--cs-kb-inset', `${covered}px`);
			setInset(covered);
		};
		const onGeom = () => {
			if (!raf) raf = requestAnimationFrame(measure);
		};
		// BOTH events: `resize` fires when the keyboard shows/hides; `scroll` fires when the
		// page scrolls under the keyboard (offsetTop drift), which `resize` alone misses.
		vv.addEventListener('resize', onGeom);
		vv.addEventListener('scroll', onGeom);
		measure();
		return () => {
			vv.removeEventListener('resize', onGeom);
			vv.removeEventListener('scroll', onGeom);
			if (raf) cancelAnimationFrame(raf);
			root.style.removeProperty('--cs-kb-inset');
			setInset(0);
		};
	}, [enabled]);

	return { inset, supported };
}

// True on the MOBILE shell (<=699px — the `useBreakpoint` 'mobile' cutoff, so the shell and
// the keyboard-driven TYPING MODE switch on ONE authority, retiring the old 640-vs-699 CSS/JS
// mismatch). It gates the mobile-only chrome behavior: `useVisualViewport` runs (so desktop pays
// nothing), and when the keyboard is up the top chrome collapses. Width-only (not pointer) so a
// desktop-width coarse iPad Pro keeps the desktop layout. (Named for slice 1's keyboard-riding
// register rail, since retired — formatting now lives on the slide divider; the name is kept to
// avoid churn across its call sites, but it means simply "the mobile shell.")
export function useRailLayout(): boolean {
	const query = '(max-width: 699px)';
	const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
	const [coarse, setCoarse] = React.useState<boolean>(get);
	React.useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const mq = window.matchMedia(query);
		const onChange = () => setCoarse(mq.matches);
		onChange();
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);
	return coarse;
}
