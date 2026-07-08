import * as React from 'react';
import { type RunOptions } from './index';
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
export declare function useWalkthrough<A>(rootRef: React.RefObject<HTMLElement | null>, configure: () => Omit<RunOptions<A>, 'root'> | null): WalkthroughControls;
