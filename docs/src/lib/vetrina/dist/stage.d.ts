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
    /** OPTIONAL, and the same shape of widening as `RectSource` itself: both `Element` and
     *  `Range` already satisfy it, so nothing existing changes.
     *
     *  It exists because a bounding box is a LYING rectangle for anything that wraps. A phrase
     *  running across three lines of a paragraph has three rectangles; its bounding box is the
     *  whole paragraph's width and names words the phrase does not contain. `wash` paints one
     *  band per rectangle and `underline` sweeps the line it was given, so a host that can
     *  answer with more resolution gets a highlighter that follows the words. A host that
     *  cannot is not penalized — every cue falls back to `getBoundingClientRect()`. */
    getClientRects?(): DOMRectList | DOMRect[];
    /** Optional; the stage calls it before a drag glide exactly as it does on an element. */
    scrollIntoView?(arg?: boolean | ScrollIntoViewOptions): void;
}
export type Target = string | RectSource | (() => RectSource | null);
/** The minimum a rect has to be for the pure geometry helpers below — so `gestureRest` can be
 *  called with a plain object in a test, or with a real `DOMRect` at runtime. */
export interface RectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}
/** Narrow a resolved target to a real element, or null. Duck-typed rather than
 *  `instanceof HTMLElement`: the stage is framework-free and may be handed a node from
 *  another document or realm (a portal, a same-origin frame), where `instanceof` fails. */
export declare function asElement(src: RectSource | null | undefined): HTMLElement | null;
/** The cursor's body language — a curated alphabet, each carrying a distinct MEANING.
 *  Extending it is an allowlist edit gated in check-ownership (`SANCTIONED_GESTURES`), which
 *  is where the "what does this one SAY that the others don't" question gets asked.
 *
 *  Two families. The first five are about the TOUR's own state — hello, look-here, it worked,
 *  it failed, careful. The last four are DEICTIC: they name a piece of the host's content the
 *  way a presenter's hand does, and they are chosen by the SHAPE of the thing being named
 *  (`underline` a line, `wash` a phrase, `bracket` a block, `tap` something small); `circle`
 *  belongs to both families, since "look here" is already the right thing to say about a
 *  compact target. */
export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake' | 'underline' | 'wash' | 'bracket' | 'tap';
export interface GestureOptions {
    /** Emphasis. `'notable'` draws heavier ink and holds it longer — for when the HOST knows
     *  this one matters more than the last one. Default `'quiet'`. */
    strength?: 'quiet' | 'notable';
    /** Keep the CURSOR — and the ring/bracket ink — this many px clear of the target's box.
     *  Default `0`, so every call written before this existed is byte-identical.
     *
     *  It is a real number rather than a boolean because the cursor's footprint is the host's
     *  business: a stage over a 1:1 app and a stage over a scaled preview want different
     *  clearances for the same visual result. */
    clearance?: number;
    /** Where the cursor comes to rest when the gesture is done. Default: the gesture's own
     *  outer end — see `gestureRest`, which is exported precisely so a host can ask what that
     *  will be and override it when it knows something about what surrounds the target that
     *  the stage cannot. `null` is the same as omitting it. */
    rest?: Target | null;
}
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
    /** Body language (§6.1). `circle` and the four DEICTIC gestures need a target; the rest play
     *  at the cursor or a target. `opts` is emphasis + clearance + an explicit rest. */
    gesture(kind: Gesture, target?: Target, signal?: AbortSignal, opts?: GestureOptions): Promise<void>;
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
/**
 * Where a gesture LEAVES the cursor — the whole point of the deictic set.
 *
 * A pointer that picks its position independently of the cue has to be CHECKED for
 * occlusion afterwards, which is a search. A pointer that rides the cue's own stroke has
 * its position decided by geometry that already lives outside the thing being named, so
 * the named thing cannot be covered — there is nothing to check.
 *
 * Exported because that default is a promise this library makes to a host. A host that has
 * to decide whether the promise is safe in ITS layout (Lattice's Guide does: "past the
 * block's right edge" is the slide margin on one deck and the second column on another)
 * must be able to ASK, rather than re-deriving the geometry here and drifting from it.
 *
 * TWO RECTANGLES, TWO JOBS, and the split is the contract a host writes to:
 *
 *   `box`   — what the cursor must CLEAR. Every answer below is outside it by `clearance`.
 *   `rects` — what the INK follows, per line (see `RectSource.getClientRects`). Null = use
 *             the box.
 *
 * They are usually the same thing and are allowed not to be, which is the whole reason both
 * are parameters. Naming a phrase inside a paragraph is exactly that case: the ink belongs on
 * the phrase's own lines, while the cursor has to clear the WHOLE paragraph — resting just
 * past the phrase would put the hand on the words that follow it. So a host hands over a
 * source whose bounding box is the block and whose client rects are the phrase, and the rest
 * takes its Y from the last line of the ink and its X from the edge of the block.
 *
 * Returns null for the five NON-deictic gestures, whose cursor motion is defined by the
 * gesture itself and is not changing.
 */
export declare function gestureRest(kind: Gesture, box: RectLike, rects: readonly RectLike[] | null, clearance?: number): {
    x: number;
    y: number;
} | null;
/** Hand-frequency displacement along the two path axes, at `t` in 0..1 of a movement.
 *
 *  `along` is the direction of travel, `across` its perpendicular. Amplitudes scale with the
 *  distance covered (a longer reach wanders more, in the same way a longer stroke of a pen
 *  does) and are capped, so a cross-screen glide does not swing wildly.
 *
 *  Exported for the test battery, which pins the endpoints and the band rather than the shape. */
export declare function handOffset(t: number, dist: number, phase: number, amount: number, elapsedMs?: number): {
    along: number;
    across: number;
};
export declare function createStage(opts: StageOptions): Stage;
