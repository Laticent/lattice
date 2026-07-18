import * as React from 'react';

// The software-keyboard geometry, read from `window.visualViewport` — the ONE source of
// truth iOS Safari exposes for "how much of the layout viewport the keyboard now covers"
// (neither `100dvh` nor a `position:fixed;bottom:0` element tracks the keyboard on iOS —
// that is exactly why the Compose grammar bar was hidden under the keyboard while typing).
//
// It publishes two CSS custom properties on the document root:
//   --cs-vv-top    = visualViewport.offsetTop   (layout px the visual viewport is scrolled down)
//   --cs-vv-height = visualViewport.height       (visible height above the keyboard)
// A pinned rail positions its BOTTOM edge with
//   top: calc(var(--cs-vv-top) + var(--cs-vv-height) - <railHeight>)
// which lands flush with the visual-viewport bottom — the keyboard's top edge when a
// keyboard is up, the screen bottom when it is down — as an ABSOLUTE layout-px coordinate,
// so it is invariant to whether iOS resolves `position:fixed` against the layout or the
// visual viewport (the reference-frame ambiguity that makes `bottom:0 + translateY` double-
// count the keyboard on some iOS builds).
//
// UNVERIFIED (HARD RULE #23 — emulation is not verification): the exact pin behavior across
// the keyboard-open animation, momentum/rubber-band overscroll, and Stage Manager / Split
// View can only be confirmed on real iOS hardware. When `visualViewport` is absent the vars
// fall back (via their CSS defaults) to a rail docked at the bottom — never worse than the
// always-visible bottom bar this replaces.
export function useVisualViewport(enabled: boolean): { inset: number; supported: boolean } {
	const [inset, setInset] = React.useState(0);
	const supported = typeof window !== 'undefined' && !!window.visualViewport;

	React.useEffect(() => {
		if (!enabled) return;
		const vv = typeof window !== 'undefined' ? window.visualViewport : null;
		const root = document.documentElement;
		if (!vv) {
			// No visualViewport → clear any stale vars so the rail's CSS defaults dock it.
			root.style.removeProperty('--cs-vv-top');
			root.style.removeProperty('--cs-vv-height');
			return;
		}
		let raf = 0;
		const measure = () => {
			raf = 0;
			// offsetTop moves as the page scrolls under the keyboard; height shrinks when the
			// keyboard is up. inset = the covered height (0 when down / hardware keyboard).
			const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			root.style.setProperty('--cs-vv-top', `${vv.offsetTop}px`);
			root.style.setProperty('--cs-vv-height', `${vv.height}px`);
			// The covered (keyboard) height, so the writing surface can reserve scroll room
			// BELOW the caret equal to keyboard + rail — iOS's native per-keystroke caret
			// scroll targets the visual-viewport bottom, which is where the rail sits.
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
			root.style.removeProperty('--cs-vv-top');
			root.style.removeProperty('--cs-vv-height');
			root.style.removeProperty('--cs-kb-inset');
			setInset(0);
		};
	}, [enabled]);

	return { inset, supported };
}

// True when the Compose surface should present its grammar registers as a KEYBOARD-RIDING
// bottom rail rather than the desktop/tablet left gutter. Scoped to the MOBILE shell only
// (<=699px — the `useBreakpoint` 'mobile' cutoff, so the rail and the single-pane shell
// switch on ONE authority, retiring the old 640-vs-699 CSS/JS mismatch). Deliberately NOT
// extended to tablet: there the registers live in a LEFT gutter that the software keyboard
// never occludes, so moving them to a bottom rail would INTRODUCE the occlusion this fixes —
// tablet keeps its working side-rail until a real device shows it needs the rail (HARD RULE
// #23). Width-only (not pointer) so it tracks the shell, and a desktop-width coarse iPad Pro
// keeps the left gutter rather than getting a fixed rail over the three-column layout.
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
