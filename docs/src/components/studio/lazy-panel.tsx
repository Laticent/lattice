import * as React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PanelSheetInstantCtx } from '@/components/ui/panel';

// Load-on-open for the Studio's panels, with a shell that looks like the panel while its code
// arrives. See engineering/decisions/2026-09-26-studio-panel-lazy-loading.md.
//
// WHY NOT React.lazy. React.lazy suspends on its first render even when the module is already
// in memory, so a panel the idle warm-up has loaded would still flash its fallback for a frame.
// This keeps each panel's load state in a tiny store and reads it with useSyncExternalStore:
// once loaded, the panel renders on its first frame and the shell never appears.
//
// WHY NO RETRY. A failed `import()` is cached by the module map for the life of the document,
// so asking again re-throws without a request (#1242). A rejected panel stays rejected, and the
// shared ErrorBoundary shows its chunk-load card, whose one action is Reload.

type LoadState<C> = { status: 'idle' } | { status: 'pending' } | { status: 'fulfilled'; value: C } | { status: 'rejected'; reason: unknown };

export type LazyPanel<C extends React.ComponentType<never>> = {
	/** Shown in the "Loading …" status line and the error card. */
	readonly name: string;
	/** Start the load, or return the one already in flight. Never rejects: a failure is recorded in the state. */
	load(): Promise<void>;
	getState(): LoadState<C>;
	subscribe(listener: () => void): () => void;
};

export function lazyPanel<C extends React.ComponentType<never>>(name: string, loader: () => Promise<C>): LazyPanel<C> {
	let state: LoadState<C> = { status: 'idle' };
	let inflight: Promise<void> | null = null;
	const listeners = new Set<() => void>();
	const set = (next: LoadState<C>) => {
		state = next;
		for (const l of listeners) l();
	};
	return {
		name,
		load() {
			if (!inflight) {
				set({ status: 'pending' });
				inflight = loader().then(
					(value) => set({ status: 'fulfilled', value }),
					(reason) => set({ status: 'rejected', reason }),
				);
			}
			return inflight;
		},
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

function useLazyPanel<C extends React.ComponentType<never>>(panel: LazyPanel<C>): LoadState<C> {
	const state = React.useSyncExternalStore(panel.subscribe, panel.getState, panel.getState);
	React.useEffect(() => {
		void panel.load();
	}, [panel]);
	return state;
}

/**
 * True from the first time `on` is true, for the rest of the component's life. Gates a lazy
 * panel's mount (`open || everOpened`): a never-opened panel costs nothing, and an opened one
 * stays mounted, so its state and its close animation survive the next close.
 */
export function useLatch(on: boolean): boolean {
	const [ever, setEver] = React.useState(on);
	if (on && !ever) setEver(true);
	return ever || on;
}

/** How long `PanelSheet`'s enter animation runs (`ui/sheet.tsx`: `data-[state=open]:duration-500`). */
export const SHEET_ENTER_MS = 500;
/** How long its exit animation runs (`data-[state=closed]:duration-300`). */
export const SHEET_EXIT_MS = 300;

function Rethrow({ error }: { error: unknown }): never {
	throw error;
}

/**
 * Render a lazy panel, or its shell while the panel's code loads.
 *
 * `shell(body)` draws the panel's real frame; `body` replaces the shell's placeholder blocks
 * (it carries the error card when the load failed). `sheet` panels hold the shell until its
 * slide-in has finished, then mount the real sheet in place with its enter animation off, so a
 * cold open slides in once. Mount this only once the panel has been opened (`open || everOpened`).
 */
export function PanelLoader<C extends React.ComponentType<never>>({
	panel,
	shell,
	sheet = false,
	open = true,
	children,
}: {
	panel: LazyPanel<C>;
	shell: (body?: React.ReactNode) => React.ReactNode;
	sheet?: boolean;
	open?: boolean;
	children: (Panel: C) => React.ReactNode;
}) {
	const state = useLazyPanel(panel);
	const ready = state.status === 'fulfilled';
	// Decided once, at mount: a panel already loaded goes straight to live and never shows its shell.
	const [live, setLive] = React.useState(ready);
	const [instant, setInstant] = React.useState(false);
	// When the shell's current motion ends: its slide-in, or its close if it was dismissed while
	// loading. Restarted on every open and close, so a reopen or an Escape mid-load is timed from
	// its own motion, not from the first one.
	const motionEnds = React.useRef<number | null>(null);
	if (!live && motionEnds.current === null) motionEnds.current = performance.now() + (open ? SHEET_ENTER_MS : 0);
	const wasOpen = React.useRef(open);

	// Declared BEFORE the swap effect on purpose: effects run in order, so the swap reads the
	// motion this open or close just started.
	React.useEffect(() => {
		if (wasOpen.current === open) return;
		wasOpen.current = open;
		if (!live) motionEnds.current = performance.now() + (open ? SHEET_ENTER_MS : SHEET_EXIT_MS);
		// The instant swap is for the open the shell started. The next open animates normally.
		if (!open) setInstant(false);
	}, [open, live]);

	React.useEffect(() => {
		if (live || !ready) return;
		if (!sheet) {
			setLive(true);
			return;
		}
		// Swap once the shell has stopped moving. Open: the real sheet takes its place with the
		// enter animation off. Closed: the real sheet mounts closed, so there is nothing to animate.
		const swap = () => {
			setInstant(open);
			setLive(true);
		};
		const wait = (motionEnds.current ?? 0) - performance.now();
		if (wait <= 0) {
			swap();
			return;
		}
		const t = window.setTimeout(swap, wait);
		return () => window.clearTimeout(t);
	}, [live, ready, sheet, open]);

	if (state.status === 'rejected') {
		return shell(
			<ErrorBoundary label={panel.name}>
				<Rethrow error={state.reason} />
			</ErrorBoundary>,
		);
	}
	if (!live || !ready) return shell();
	const body = children(state.value);
	return sheet ? <PanelSheetInstantCtx.Provider value={instant}>{body}</PanelSheetInstantCtx.Provider> : body;
}

/**
 * Load the panels in the background once the Studio is idle, so a panel opened later renders on
 * its first frame. It is also what keeps a never-opened panel working offline and across a
 * deploy: the service worker caches `/_astro/` chunks only once they have been fetched
 * (`docs/public/sw.js`), and a deploy removes the old hashes a stale tab still references.
 *
 * ONE wait for idle, then back to back. The first load waits for the Studio to settle, so the
 * warm-up never competes with startup. After that, each panel starts as soon as the one before
 * it has loaded, with only a short yield between them. An earlier cut waited 1.5 s between
 * panels on Safari (no requestIdleCallback), which left a ~9 s window in which a tab put in the
 * background and restored after a deploy could not open a panel it had never opened.
 *
 * NOT skipped under Save-Data. Before these panels were split out, every visitor downloaded all
 * of them at startup, Save-Data or not. Skipping the warm-up would not save those users bytes
 * they used to spend; it would only take away offline and after-deploy use of the panels.
 * Returns a cancel function.
 */
export function warmPanels(panels: ReadonlyArray<LazyPanel<React.ComponentType<never>>>): () => void {
	let cancelled = false;
	let handle: number | undefined;
	// Safari has no requestIdleCallback. The two handle spaces are separate, so remember which one
	// issued the handle: clearing the wrong one could cancel an unrelated timer with the same id.
	const hasIdle = typeof window.requestIdleCallback === 'function';
	const schedule = (fn: () => void, first: boolean) => {
		if (hasIdle) handle = window.requestIdleCallback(fn, { timeout: first ? 3000 : 500 });
		else handle = window.setTimeout(fn, first ? 1000 : 50);
	};
	const queue = [...panels];
	const next = () => {
		if (cancelled) return;
		const p = queue.shift();
		if (!p) return;
		void p.load().then(() => schedule(next, false));
	};
	schedule(next, true);
	return () => {
		cancelled = true;
		if (handle === undefined) return;
		if (hasIdle) window.cancelIdleCallback(handle);
		else window.clearTimeout(handle);
	};
}
