import type { RunContext } from './runner';
import { type Target } from './stage';
export interface WaitForOpts {
    timeout?: number;
    interval?: number;
}
/**
 * Resolve when `probe` yields an element (a Target) or returns true (a predicate). Abort-aware;
 * returns `void` on timeout. The real recurring need `awaitUser` doesn't cover: wait for THIS.
 */
export declare function waitFor<A>(ctx: RunContext<A>, probe: Target | (() => boolean), opts?: WaitForOpts): Promise<HTMLElement | undefined>;
export interface HoldUntilOpts {
    /** How long to wait before giving up and ADVANCING with a warning (default 15000ms). */
    timeout?: number;
    interval?: number;
}
/**
 * The advance gate behind the descriptor layer's `Step.until` — NOT part of the public surface
 * (the only public poll-wait is `waitFor`; a descriptor author reaches `until`, a raw author reaches
 * `waitFor`). Resolve when `pred` becomes true. On timeout it **advances with a `console.warn`** —
 * never silently (the author gets a signal) and never fatally (a backgrounded tab or a slow app must
 * not self-destruct the demo). Throw-safe (a throwing `pred` = "not ready yet"), and if the predicate
 * kept throwing the warning names the last error, so a genuinely broken predicate is diagnosed rather
 * than misattributed to app readiness. Abort-aware (a take-over rejects mid-poll).
 */
export declare function holdUntil<A>(ctx: RunContext<A>, pred: () => boolean, opts?: HoldUntilOpts): Promise<void>;
export interface LoopOpts {
    until?: () => boolean;
    times?: number;
    signal?: AbortSignal;
}
/** Run `body` repeatedly until `until()` is true or `times` is reached. Abort-aware (kiosk/kata). */
export declare function loop(body: (i: number) => Promise<void>, opts?: LoopOpts): Promise<void>;
export interface RetryOpts {
    times?: number;
    signal?: AbortSignal;
    delay?: number;
}
/** Run `body`, retrying on throw up to `times` (default 3). Abort-aware; re-throws the last error. */
export declare function retry(body: (attempt: number) => Promise<void>, opts?: RetryOpts): Promise<void>;
