// The seam between a screen and the Live session, so a new thing to follow is one hook call in the
// component that owns it and nothing is plumbed through the Studio's props.
//
//   useViewKey('section', tab)        the component SAYS where it is (the live session shows it to the others)
//   useAppliedKey('section', setTab)  the component is TOLD where the person it follows is
//
// This file is small and always loaded; the session code that talks to Tavola loads on demand and
// shares this one instance. The session decides WHEN a value may be applied (one typing gate for
// everything Follow does); a component only decides HOW. Design: engineering/decisions/2026-10-21-follow-over-tavola.md §6–§7.

import * as React from 'react';

/** The places a component can report and be moved to. The list of allowed VALUES is in follow-keys.ts. */
export type BusKey = 'inspector' | 'section';

type Sub = (key: BusKey, value: string | null) => void;
/** A value applied this recently is replayed to a component that mounts after it (a panel opened by the
 *  same Follow step that names its section). */
const REPLAY_MS = 3000;

const local = new Map<BusKey, string>();
const applied = new Map<BusKey, { value: string; at: number }>();
const localSubs = new Set<Sub>();
const applySubs = new Set<Sub>();

export const followBus = {
	/** A component reports where it is. `null` means it is not showing that thing. */
	setLocal(key: BusKey, value: string | null) {
		if ((local.get(key) ?? null) === value) return;
		if (value === null) local.delete(key);
		else local.set(key, value);
		for (const s of [...localSubs]) s(key, value);
	},
	getLocal: (key: BusKey): string | null => local.get(key) ?? null,
	allLocal: (): Array<[BusKey, string]> => [...local],
	onLocal(cb: Sub) {
		localSubs.add(cb);
		return () => void localSubs.delete(cb);
	},
	/** The session moves this screen to where the person it follows is. */
	apply(key: BusKey, value: string) {
		applied.set(key, { value, at: Date.now() });
		for (const s of [...applySubs]) s(key, value);
	},
	/** What the session last applied for `key`, so a change a person makes themselves can be told from it. */
	lastApplied: (key: BusKey): string | null => applied.get(key)?.value ?? null,
	onApply(cb: Sub) {
		applySubs.add(cb);
		return () => void applySubs.delete(cb);
	},
	freshApplied: (key: BusKey): string | null => {
		const a = applied.get(key);
		return a && Date.now() - a.at < REPLAY_MS ? a.value : null;
	},
	/** Forget everything (a session ended; tests). */
	reset() {
		local.clear();
		applied.clear();
	},
};

/** Say where this component is, for as long as it is mounted and `value` is not null/undefined. */
export function useViewKey(key: BusKey, value: string | null | undefined) {
	React.useEffect(() => {
		followBus.setLocal(key, value ?? null);
		return () => followBus.setLocal(key, null);
	}, [key, value]);
}

/** Be moved when the session applies a value for `key`. `handler` should be cheap and idempotent. */
export function useAppliedKey(key: BusKey, handler: (value: string) => void) {
	const ref = React.useRef(handler);
	ref.current = handler;
	React.useEffect(() => {
		const fresh = followBus.freshApplied(key);
		if (fresh !== null) ref.current(fresh);
		return followBus.onApply((k, v) => {
			if (k === key && v !== null) ref.current(v);
		});
	}, [key]);
}
