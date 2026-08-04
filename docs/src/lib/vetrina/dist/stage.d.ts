import type { ResolvedTheme } from './theme';
/** A live source of a rectangle in VIEWPORT coordinates — everything the stage needs to
 *  aim at something. Every `HTMLElement` already satisfies it structurally, so this is a
 *  WIDENING of `Target`, not a new dialect: existing element and thunk targets are unchanged.
 *
 *  It exists so a HOST can hand the stage a target the stage itself cannot reach with a
 *  selector — a region inside an iframe, a canvas hit box, a virtualized row — WITHOUT the
 *  library learning anything about that host. The stage never inspects a `RectSource`; it
 *  only asks it, repeatedly, where it currently is. */
export interface RectSource {
    /** Current position + size in the STAGE's viewport coordinates. Called repeatedly (per
     *  animation frame while a cue is live), so keep it cheap and keep it live. */
    getBoundingClientRect(): DOMRect;
    /** Optional; the stage calls it before a drag glide exactly as it does on an element. */
    scrollIntoView?(arg?: boolean | ScrollIntoViewOptions): void;
}
export type Target = string | RectSource | (() => RectSource | null);
/** Narrow a resolved target to a real element, or null. Duck-typed rather than
 *  `instanceof HTMLElement`: the stage is framework-free and may be handed a node from
 *  another document or realm (a portal, a same-origin frame), where `instanceof` fails. */
export declare function asElement(src: RectSource | null | undefined): HTMLElement | null;
/** The cursor's body language — a curated alphabet, each carrying a distinct MEANING.
 *  Frozen at five; extending it is an allowlist edit gated in check-ownership. */
export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake';
export interface DragHandle {
    /** Release/settle the dragged item at `to` (call on `act` success). */
    drop(signal?: AbortSignal): Promise<void>;
    /** Snap the item back to `from` (call on `act` failure) — the honest "it didn't happen". */
    snapBack(signal?: AbortSignal): Promise<void>;
}
export interface Stage {
    /** Narration text in the dock (textContent only). '' reverts to the take-over hint — the
     *  dock stays up so Exit is always reachable; the narration cross-fades on change. */
    say(text: string): void;
    /** Report beat progress (current of total). OPTIONAL — only the `caption:'progress'` style
     *  renders it (a beat ring); every other style ignores it, and a raw Walkthrough that never
     *  reports leaves the ring empty. The storyboard interpreter feeds it (taught beats only). */
    progress?(current: number, total: number): void;
    /** Anticipation cue toward a target, then an eased glide to it. Null target = no-op. */
    point(target: Target, signal?: AbortSignal): Promise<void>;
    /** Click burst at the cursor's current position (theater; pair with a real `act`). */
    press(signal?: AbortSignal): Promise<void>;
    /** Demonstrate a move (mechanic): glide pick-up → hold at `to`. The caller gates the drop
     *  on the real `act` (drop on success, snapBack on failure) so the theater never lies. */
    drag(from: Target, to: Target, signal?: AbortSignal): Promise<DragHandle>;
    /** Body language (§6.1). `circle` needs a target; the rest play at the cursor or a target. */
    gesture(kind: Gesture, target?: Target, signal?: AbortSignal): Promise<void>;
    /** Opening flourish: the cursor materializes at center + waves hello (once per run). */
    intro(signal?: AbortSignal): Promise<void>;
    /** TEACHING cue: draw the eye to the narration — the cursor dips to the dock edge and the
     *  caption words pulse ("look here, read this"). The storyboard's `read` beat calls this, then
     *  dwells `readMs()`. Pulse is opacity/glow-based, so it plays under 'legible'; the cursor dip
     *  teleports when vestibular motion is suppressed. */
    emphasizeCaption(signal?: AbortSignal): Promise<void>;
    /** Resolve a Target to an ELEMENT. Selectors are ROOT-scoped; pass a thunk for portals.
     *  A `RectSource` that is not an element (a host's cross-frame provider) resolves to null
     *  here — it has no element to hand back — while still being a valid target for every cue. */
    resolve(target: Target): HTMLElement | null;
    /** True when VESTIBULAR motion is suppressed (the 'legible' and 'still' tiers) — glides
     *  teleport, sweeps/rings/orbit/wave-translate are skipped. Content cadence is unaffected. */
    readonly reduced: boolean;
    /** True ONLY in the 'still' tier — CONTENT cadence collapses too: the runner sets typed text
     *  at once (no reveal) and settles run short. 'legible' keeps the reveal, so this stays false. */
    readonly still: boolean;
    /** Pacing multiplier from the theme's speed — storyboard settle + typing cadence scale by it. */
    readonly pace: number;
    /** Show or hide the CURSOR, without tearing the stage down.
     *
     *  For a host that points at something it does not always have: a cue whose target cannot be
     *  resolved leaves the cursor parked on whatever it pointed at LAST, which reads as a
     *  confident claim about an unrelated thing — worse than not pointing at all. Hiding is the
     *  honest state, and it has to be reversible within one run, so it is not `destroy()`.
     *
     *  The DOCK is deliberately unaffected: Exit must stay reachable at all times (I4), so this
     *  hides the pointer and nothing else. Idempotent. */
    setCursorVisible(visible: boolean): void;
    /** True if the event target belongs to the stage's own chrome (the Exit button). */
    contains(node: EventTarget | null): boolean;
    /** Remove every node. Idempotent; all methods no-op afterward (I6 / interleave safety). */
    destroy(): void;
}
export interface StageOptions {
    /** The host app subtree; string Targets resolve within it (root-scoped — F/D2.1). */
    root: HTMLElement;
    /** Called when the viewer clicks the Exit button. */
    onExit: () => void;
    /** Where the overlay mounts (default: the root's document body). Injectable — no hardcode. */
    portalRoot?: HTMLElement;
    /** Stacking context for hosts that go higher than the default. */
    zIndex?: number;
    /** Resolved theme — token values + pace + pointer shape + silenced cues (from theme.ts). */
    theme?: ResolvedTheme;
}
export declare function isAbortError(e: unknown): boolean;
/** A cancelable sleep — resolves after `ms`, or rejects `AbortError` if `signal` aborts first. */
export declare function wait(ms: number, signal?: AbortSignal): Promise<void>;
export declare function createStage(opts: StageOptions): Stage;
