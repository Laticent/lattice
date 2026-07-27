import * as React from 'react';

// The Studio adapts its layout across three first-class widths (CLAUDE.md Quality
// Bar): desktop (~1440), tablet (~820), mobile (~390). At desktop the Architect
// and Inspector are persistent grid columns; below 1100 they become slide-in
// sheets and the body drops a column; below 700 the body is a single swappable
// Edit/Preview pane. matchMedia drives the switch (the island is client:only, so
// `window` always exists at render; tests polyfill matchMedia → 'desktop').
export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

export function useBreakpoint(): Breakpoint {
	const read = React.useCallback((): Breakpoint => {
		if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
		if (window.matchMedia('(max-width: 699px)').matches) return 'mobile';
		if (window.matchMedia('(max-width: 1099px)').matches) return 'tablet';
		return 'desktop';
	}, []);

	const [bp, setBp] = React.useState<Breakpoint>(read);

	React.useEffect(() => {
		const mqMobile = window.matchMedia('(max-width: 699px)');
		const mqTablet = window.matchMedia('(max-width: 1099px)');
		const update = () => setBp(read());
		update();
		mqMobile.addEventListener('change', update);
		mqTablet.addEventListener('change', update);
		return () => {
			mqMobile.removeEventListener('change', update);
			mqTablet.removeEventListener('change', update);
		};
	}, [read]);

	return bp;
}

// A phone held in LANDSCAPE is the one viewport the width-based breakpoints can't
// serve: it's wide (~844–932px → the two-pane 'tablet' layout) but only ~360–430px
// TALL, so the editor|preview split is already cramped and the software keyboard
// buries the caret the moment you type (there's nowhere for it to go). This detects
// that state — landscape, short, touch — so the Studio can lock it to a full-bleed
// PREVIEW (no editor, so no keyboard). The `max-height: 500px` + `orientation:
// landscape` + `pointer: coarse` triad is the SAME signal the presenter view already
// uses for landscape phones (drawing-board.css `@media (orientation: landscape) and
// (max-height: 500px)`); `pointer: coarse` additionally excludes a short desktop
// window. A small tablet in landscape (iPad mini ~744px tall) clears max-height and
// keeps the full layout. Width-independent by design: the phone's landscape WIDTH
// varies (667–932px) but its landscape HEIGHT is reliably ≤ ~430px.
export function useLandscapePhone(): boolean {
	const query = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
	const read = React.useCallback((): boolean => {
		if (typeof window === 'undefined' || !window.matchMedia) return false;
		return window.matchMedia(query).matches;
	}, []);

	const [is, setIs] = React.useState<boolean>(read);

	React.useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mq = window.matchMedia(query);
		const update = () => setIs(mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	}, []);

	return is;
}

// The scope rail shows icon + caption at 72px, but at the NARROW end of desktop
// (1100–1160px) that column can't share the row with an open Architect + Inspector
// without breaking the split's zero-void invariant (#721: pair-space ≥ 2×minB =
// 560px). In that band the rail falls back to 48px icons (when shown) and folds away
// entirely when both panels are open — a display override, not a preference change.
// 1160 is the width at which the 72px rail + both panels first meets pair-space=560.
export function useNarrowDesktop(): boolean {
	const read = React.useCallback((): boolean => {
		if (typeof window === 'undefined' || !window.matchMedia) return false;
		return window.matchMedia('(min-width: 1100px) and (max-width: 1160px)').matches;
	}, []);

	const [narrow, setNarrow] = React.useState<boolean>(read);

	React.useEffect(() => {
		const mq = window.matchMedia('(min-width: 1100px) and (max-width: 1160px)');
		const update = () => setNarrow(mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	}, []);

	return narrow;
}
