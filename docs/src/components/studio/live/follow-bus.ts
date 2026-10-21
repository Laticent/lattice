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

/**
 * The settings rows a person can be seen to be in, and whose changes can be named: each is the slug of a row label
 * written in the code (never text a person typed). `follow-keys.test.ts` re-reads the Studio source and fails
 * when a row is added without joining this list, so a new row either rings for a follower or is left out on purpose.
 */
export const FOCUS_ROWS = [
	'accent', 'acronyms', 'across', 'ai-writes-in', 'auto-glossary', 'backdrop',
	'backdrop-mask', 'backdrop-strength', 'bar-placement', 'brand-bar', 'canvas', 'card-lift',
	'card-rail', 'card-rail-placement', 'card-rows', 'card-tags', 'chart-finish', 'claim',
	'clean-slide', 'color-mode', 'compact', 'corners', 'debug-overlay', 'deck-name',
	'default-slide-class', 'delivery', 'down', 'eyebrow', 'finish', 'fit',
	'footer', 'header', 'heading-rule', 'headline', 'headline-alignment', 'hide-footer',
	'hide-header', 'hide-page-number', 'hide-rail', 'image-card', 'in-the-exported-player', 'inline-pills-and-marks',
	'inline-validation', 'language', 'lexicon', 'logo', 'logo-on', 'logo-style',
	'meta-line', 'mode', 'motion-speed', 'motion-style', 'new-slide-on', 'pace',
	'page-numbers', 'play', 'preset', 'remove-reader-view', 'rename', 'section-rail',
	'shape', 'show-on', 'size', 'slide-splitting', 'speed', 'stamp-shape',
	'structural-trim', 'style', 'theme', 'this-slide', 'tone-shape', 'treatment',
	'type-scale', 'venue',
] as const;
const ROW_SET: ReadonlySet<string> = new Set(FOCUS_ROWS);
/** The row id for a label, or null when the label is not one of the listed rows (a dynamic or user-named one). */
export const rowIdOf = (label: string): string | null => {
	const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	return ROW_SET.has(id) ? id : null;
};
/** "card-rail-placement" as words: "Card rail placement". */
export const rowName = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

/** Where a Present is, as the presenter sees it. */
export type PresentPlace = { idx: number; page: number; lens: string; hash?: string };
/** What a screen reports, by key. */
export type LocalValues = {
	inspector: string;
	section: string;
	present: PresentPlace;
	/** The settings row with focus. A place, never a value: what is typed or picked there stays private. */
	focus: string;
	/** The workspace settings sheet ("Setup") is open, and its tab. Shown to others, never applied (it holds a person's own keys and data). */
	shown: 'setup';
	setupTab: string;
	/** The last settings row this person changed, with a counter so each change is seen. Row name only, never the value. */
	changed: { what: string; n: number };
};
/** What the session tells a screen, by key. A `present` also names who it follows; `null` means "stop". */
export type AppliedValues = { inspector: string; section: string; present: PresentPlace & { by: string } };
/** What the person followed shows right now, for a screen that wants to mark it (the ghost ring). */
export type Leader = { name: string; focus: string | null };
export type BusKey = keyof LocalValues;
/** The keys a screen can be told to move for (the rest are only ever shown). */
export type ApplyKey = keyof AppliedValues;

type LocalSub = <K extends BusKey>(key: K, value: LocalValues[K] | null) => void;
type ApplySub = <K extends ApplyKey>(key: K, value: AppliedValues[K] | null) => void;
/** A value applied this recently is replayed to a component that mounts after it (a panel opened by the
 *  same Follow step that names its section). */
const REPLAY_MS = 3000;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const local = new Map<BusKey, unknown>();
const applied = new Map<ApplyKey, { value: unknown; at: number }>();
const localSubs = new Set<LocalSub>();
const applySubs = new Set<ApplySub>();

let leader: Leader | null = null;
const leaderSubs = new Set<() => void>();

export const followBus = {
	/** The session tells screens where the person it follows is looking (not an instruction to move). */
	setLeader(next: Leader | null) {
		if (same(leader, next)) return;
		leader = next;
		for (const s of [...leaderSubs]) s();
	},
	getLeader: (): Leader | null => leader,
	onLeader(cb: () => void) {
		leaderSubs.add(cb);
		return () => void leaderSubs.delete(cb);
	},
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
	apply<K extends ApplyKey>(key: K, value: AppliedValues[K] | null) {
		applied.set(key, { value, at: Date.now() });
		for (const s of [...applySubs]) s(key, value);
	},
	/** What the session last applied for `key`, so a change a person makes themselves can be told from it. */
	lastApplied: <K extends ApplyKey>(key: K): AppliedValues[K] | null => (applied.get(key)?.value as AppliedValues[K] | undefined) ?? null,
	onApply(cb: ApplySub) {
		applySubs.add(cb);
		return () => void applySubs.delete(cb);
	},
	freshApplied: <K extends ApplyKey>(key: K): AppliedValues[K] | null => {
		const a = applied.get(key);
		return a && Date.now() - a.at < REPLAY_MS ? ((a.value as AppliedValues[K] | null) ?? null) : null;
	},
	/** Forget everything (a session ended; tests). */
	reset() {
		local.clear();
		applied.clear();
		leader = null;
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
export function useAppliedKey<K extends ApplyKey>(key: K, handler: (value: AppliedValues[K] | null) => void) {
	const ref = React.useRef(handler);
	ref.current = handler;
	React.useEffect(() => {
		const fresh = followBus.freshApplied(key);
		if (fresh !== null) ref.current(fresh);
		return followBus.onApply((k, v) => {
			if ((k as ApplyKey) === key) ref.current(v as AppliedValues[K] | null);
		});
	}, [key]);
}

/** What the person this browser follows is looking at, or null when it follows no one. */
export function useLeader(): Leader | null {
	return React.useSyncExternalStore(followBus.onLeader, followBus.getLeader, () => null);
}

/**
 * A settings row's part in Follow: `props` go on its root (they say which row has focus), and `ghost` is the name of
 * the person we follow while they are in this row, else null. Only a listed row takes part (`FOCUS_ROWS`).
 */
export function useFollowRow(label: string) {
	const id = rowIdOf(label);
	const leader = useLeader();
	const props = React.useMemo(
		() =>
			id
				? {
						onFocusCapture: () => followBus.setLocal('focus', id),
						onBlurCapture: (e: React.FocusEvent<HTMLElement>) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node | null)) followBus.setLocal('focus', null);
						},
					}
				: {},
		[id],
	);
	return { props, ghost: id && leader?.focus === id ? leader.name : null };
}
