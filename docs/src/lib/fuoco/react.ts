// React adapter for the focus hub: `useFocus(hub, select)` re-renders a component only when
// the value its selector picks out changes. A rail that selects the focused slide does not
// re-render when the caret moves along a line; that re-render, across the whole Studio
// shell and every rail button, was most of an arrow key's cost before Fuoco (decision note
// §4).
//
// Built on `useSyncExternalStore`, so a render always reads the hub's current focus and
// cannot tear. The subscription defaults to the `sync` lane: React batches the updates of one
// event itself, and a navigation must show in the same commit as the input that made it.
// (The `frame` lane is for DOM work outside React, like an editor's scroll.)

import * as React from 'react';
import type { Focus, FocusHub, Lane } from './hub.js';

export function useFocus<T>(hub: FocusHub, select: (f: Focus) => T, opts: { lane?: Lane; equals?: (a: T, b: T) => boolean } = {}): T {
	const lane = opts.lane ?? 'sync';
	// The selector and comparison usually close over props: read the latest ones per call, so a
	// new function identity each render never re-subscribes.
	const selectRef = React.useRef(select);
	selectRef.current = select;
	const equalsRef = React.useRef(opts.equals ?? Object.is);
	equalsRef.current = opts.equals ?? Object.is;
	const last = React.useRef<{ value: T } | null>(null);
	const getSnapshot = React.useCallback(() => {
		const value = selectRef.current(hub.get());
		if (last.current && equalsRef.current(last.current.value, value)) return last.current.value;
		last.current = { value };
		return value;
	}, [hub]);
	const subscribe = React.useCallback(
		(onChange: () => void) => hub.subscribe((f) => selectRef.current(f), onChange, { lane, equals: (a, b) => equalsRef.current(a as T, b as T) }),
		[hub, lane],
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The hub a subtree talks to. The Studio provides one per mounted shell. */
export const FocusHubContext = React.createContext<FocusHub | null>(null);

export function useFocusHub(): FocusHub {
	const hub = React.useContext(FocusHubContext);
	if (!hub) throw new Error('useFocusHub: no FocusHubContext provider above this component');
	return hub;
}
