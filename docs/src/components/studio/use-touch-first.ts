import * as React from 'react';

/** A touch-first screen (no hover, a coarse pointer): an iPad or a phone with no mouse or trackpad.
 *  The CSS twin of this query is the skeleton's `TOUCH_FIRST` class (StudioChromeSkeleton). It lives here, not in
 *  lib/use-breakpoint.ts, because every route loads that module and only the Studio needs this one. */
export const TOUCH_FIRST_QUERY = '(hover: none) and (pointer: coarse)';

const read = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(TOUCH_FIRST_QUERY).matches;

/** Whether the screen is touch-first, kept current. False where there is no `matchMedia` (SSR, jsdom). */
export function useTouchFirst(): boolean {
	const [is, setIs] = React.useState<boolean>(read);

	React.useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mq = window.matchMedia(TOUCH_FIRST_QUERY);
		const update = () => setIs(mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	}, []);

	return is;
}
