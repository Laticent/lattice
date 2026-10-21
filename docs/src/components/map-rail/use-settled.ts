import * as React from 'react';

/**
 * `value`, once it has stopped changing for `ms`. A live tile re-renders its slide whenever its
 * input changes, and an author typing changes the deck on every keystroke, so a rail of eight
 * live tiles would render eight slides per key. The sketch tiles follow the source at once; the
 * pictures catch up when the typing pauses. The first value is returned immediately.
 *
 * Pass a memoized value: an object built on every render is a new value on every render and
 * never settles.
 */
export function useSettled<T>(value: T, ms = 350): T {
	const [settled, setSettled] = React.useState(value);
	React.useEffect(() => {
		if (Object.is(settled, value)) return;
		const t = window.setTimeout(() => setSettled(value), ms);
		return () => window.clearTimeout(t);
	}, [value, ms, settled]);
	return settled;
}
