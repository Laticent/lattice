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

/** Where a Present is, as the presenter sees it. */
export type PresentPlace = { idx: number; page: number; lens: string; hash?: string };
/** What a screen reports, by key. */
export type LocalValues = { inspector: string; section: string; present: PresentPlace };
/** What the session tells a screen, by key. A `present` also names who it follows; `null` means "stop". */
export type AppliedValues = { inspector: string; section: string; present: PresentPlace & { by: string } };
export type BusKey = keyof LocalValues;

type LocalSub = <K extends BusKey>(key: K, value: LocalValues[K] | null) => void;
type ApplySub = <K extends BusKey>(key: K, value: AppliedValues[K] | null) => void;
/** A value applied this recently is replayed to a component that mounts after it (a panel opened by the
 *  same Follow step that names its section). */
const REPLAY_MS = 3000;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const local = new Map<BusKey, unknown>();
const applied = new Map<BusKey, { value: unknown; at: number }>();
const localSubs = new Set<LocalSub>();
const applySubs = new Set<ApplySub>();

export const followBus = {
	/** A component reports where it is. `null` means it is not showing that thing. */
	setLocal<K extends BusKey>(key: K, value: LocalValues[K] | null) {
		if (same(local.get(key) ?? null, value)) return;
		if (value === null) local.delete(key);
		else local.set(key, value);
		for (const s of [...localSubs]) s(key, value);
	},
	getLocal: <K extends BusKey>(key: K): LocalValues[K] | null => (local.get(key) as LocalValues[K] | undefined) ?? null,
	onLocal(cb: LocalSub) {
		localSubs.add(cb);
		return () => void localSubs.delete(cb);
	},
	/** The session moves this screen to where the person it follows is (`null`: back out of it). */
	apply<K extends BusKey>(key: K, value: AppliedValues[K] | null) {
		applied.set(key, { value, at: Date.now() });
		for (const s of [...applySubs]) s(key, value);
	},
	/** What the session last applied for `key`, so a change a person makes themselves can be told from it. */
	lastApplied: <K extends BusKey>(key: K): AppliedValues[K] | null => (applied.get(key)?.value as AppliedValues[K] | undefined) ?? null,
	onApply(cb: ApplySub) {
		applySubs.add(cb);
		return () => void applySubs.delete(cb);
	},
	freshApplied: <K extends BusKey>(key: K): AppliedValues[K] | null => {
		const a = applied.get(key);
		return a && Date.now() - a.at < REPLAY_MS ? ((a.value as AppliedValues[K] | null) ?? null) : null;
	},
	/** Forget everything (a session ended; tests). */
	reset() {
		local.clear();
		applied.clear();
	},
};

/** Say where this component is, for as long as it is mounted and `value` is not null/undefined. */
export function useViewKey<K extends BusKey>(key: K, value: LocalValues[K] | null | undefined) {
	// An object value is compared by content, so a new object each render does not re-report.
	const stable = JSON.stringify(value ?? null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stable` stands for `value`.
	React.useEffect(() => {
		followBus.setLocal(key, value ?? null);
		return () => followBus.setLocal(key, null);
	}, [key, stable]);
}

/** Be moved when the session applies a value for `key`. `handler` should be cheap and idempotent. */
export function useAppliedKey<K extends BusKey>(key: K, handler: (value: AppliedValues[K] | null) => void) {
	const ref = React.useRef(handler);
	ref.current = handler;
	React.useEffect(() => {
		const fresh = followBus.freshApplied(key);
		if (fresh !== null) ref.current(fresh);
		return followBus.onApply((k, v) => {
			if ((k as BusKey) === key) ref.current(v as AppliedValues[K] | null);
		});
	}, [key]);
}
