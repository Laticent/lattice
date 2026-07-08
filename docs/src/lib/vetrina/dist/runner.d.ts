import { type Stage, type Target } from './stage';
import { type Theme } from './theme';
/** How typed text LANDS in the host (native editor inserts). Omit if a host never types. */
export interface TypeOps {
    set(text: string): void;
    append(text: string): void;
    /** Optional live read of the current document - lets a composed segment diff against
     *  the real text rather than a tracked baseline. Falls back to the run-scoped tracker. */
    read?(): string;
}
/** Per-`type` options (distinct from `TypeOps`). */
export interface TypeOpts {
    cadence?: number;
    /** Set the whole text at once with NO keystroke animation (the instant-beat path). */
    instant?: boolean;
}
export type StopReason = 'complete' | 'takeover' | 'exit' | 'error';
/** Cooperative hand-off: suspend take-over for THIS beat, wait for the user's real action. */
export interface AwaitUserOpts {
    /** The expected gesture (e.g. a click on #next). A non-match is still a take-over. */
    match: (e: Event) => boolean;
    /** Without a timeout a wrong-input user can hang - supply one. */
    timeout?: number;
    /** What a timeout does (default 'abort'). */
    onTimeout?: 'abort' | 'resume';
}
/** The context a Walkthrough drives. `A` is the host's action bag - the engine names nothing in it. */
export interface RunContext<A> {
    stage: Stage;
    /** Abort-guarded proxy of the host actions: every call is a no-op once the run aborts (I8). */
    actions: A;
    signal: AbortSignal;
    /** Type toward a target at a human cadence. Requires `TypeOps` on the run (throws otherwise). */
    type(target: Target, text: string, opts?: TypeOpts): Promise<void>;
    /** Cooperative hand-off. Resolves with the user's real event, or per `onTimeout`. */
    awaitUser(opts: AwaitUserOpts): Promise<Event>;
}
export type Walkthrough<A> = (ctx: RunContext<A>) => Promise<void>;
export interface RunHandle {
    readonly active: boolean;
    /** Host-initiated exit; routes through the same teardown as every other terminal path. */
    stop(): void;
}
export interface RunOptions<A> {
    /** The host app subtree the walkthrough drives (string Targets resolve within it). */
    root: HTMLElement;
    /** The host's own state setters (bound to real state). */
    actions: A;
    /** The walkthrough - usually `scene(...).build()` or `storyboard(seed, [...])`. */
    play: Walkthrough<A>;
    /** How text lands, if this host types. */
    type?: TypeOps;
    /** Theming — CSS-first --vt-* tokens, or this JS convenience (accent/speed/pointer/cues) (§9). */
    theme?: Theme;
    /** Called AFTER teardown (I7) - the host restores whatever it wants. */
    onStop?: (reason: StopReason) => void;
    /** Play the opening flourish (materialize + wave) once at the start. Default true. */
    intro?: boolean;
    /** Take-over scope + key policy. */
    takeover?: {
        /** 'window' (default - a full-page demo) or 'root' (an embedded consumer). */
        scope?: 'root' | 'window';
        /** Don't abort a tutorial on a lone Shift/Ctrl/Alt/Meta or an IME composition key. */
        ignoreModifierKeys?: boolean;
    };
    /** Where the overlay mounts (default: the root's document body). */
    portalRoot?: HTMLElement;
    /** Stacking context for hosts that go higher than the default. */
    zIndex?: number;
}
/** Wrap the host actions so every method is a no-op once `signal` aborts (I8). Pure — unit-tested. */
export declare function guardedActions<A>(actions: A, signal: AbortSignal): A;
export declare function run<A>(opts: RunOptions<A>): RunHandle;
