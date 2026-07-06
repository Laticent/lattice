// Vetrina — the React adapter. The framework-free core (run()) has no notion of a
// component lifecycle; this thin hook binds a run to one. It is the ONLY file in the
// library allowed a non-DOM import (react, a PEER dependency — enforced by the
// import-boundary gate + excluded from the zero-dep standalone typecheck). Everything
// framework-specific lives here; nothing React leaks into the core.

import * as React from 'react';
import { type RunHandle, type RunOptions, run, type StopReason } from './index';

/** Lifecycle controls for a component-bound walkthrough. */
export interface WalkthroughControls {
	/** True while a run is live (drives a "demo running" UI state). */
	active: boolean;
	/** Start a run (single-flight — a no-op while one is active, or if the root isn't mounted). */
	start(): void;
	/** Stop the active run (routes through the same teardown as every terminal path). */
	stop(): void;
}

/**
 * Drive a Vetrina walkthrough from a React component.
 *
 * `configure` is called at `start()` time (not render time), so it closes over the FRESHEST
 * state and setters, and returns the `run()` options MINUS `root` — which the hook supplies
 * from `rootRef`. Return `null` to abort a start (e.g. state isn't ready). The host's own
 * `onStop` still fires (after Vetrina's teardown, I7); the hook resets its `active` flag and
 * handle around it, and tears any live run down on unmount.
 *
 * ```tsx
 * const rootRef = React.useRef<HTMLDivElement>(null);
 * const demo = useWalkthrough(rootRef, () => ({ actions, play, type, onStop: restore }));
 * // <div ref={rootRef}>…</div>  <button onClick={demo.start} disabled={demo.active}>Watch</button>
 * ```
 */
export function useWalkthrough<A>(
	rootRef: React.RefObject<HTMLElement | null>,
	configure: () => Omit<RunOptions<A>, 'root'> | null,
): WalkthroughControls {
	const [active, setActive] = React.useState(false);
	const handleRef = React.useRef<RunHandle | null>(null);
	// Keep `configure` in a ref so start()/stop() stay referentially stable (no re-subscribe
	// churn) while always invoking the latest closure.
	const configureRef = React.useRef(configure);
	configureRef.current = configure;

	const stop = React.useCallback(() => {
		handleRef.current?.stop();
	}, []);

	const start = React.useCallback(() => {
		if (handleRef.current?.active) return; // single-flight (mirrors run()'s own guard)
		const root = rootRef.current;
		if (!root) return; // not mounted yet
		const opts = configureRef.current();
		if (!opts) return; // host declined to start
		const hostOnStop = opts.onStop;
		setActive(true);
		handleRef.current = run<A>({
			...opts,
			root,
			onStop: (reason: StopReason) => {
				// Reset the hook's own state, THEN let the host restore (both run after teardown).
				handleRef.current = null;
				setActive(false);
				hostOnStop?.(reason);
			},
		});
	}, [rootRef]);

	// Safety net: tear a live run down if the component unmounts mid-walkthrough.
	React.useEffect(() => () => handleRef.current?.stop(), []);

	return { active, start, stop };
}
