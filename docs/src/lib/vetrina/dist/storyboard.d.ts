import type { Walkthrough } from './runner';
import { type Gesture, type Target } from './stage';
export interface Step<A> {
    say?: string;
    point?: Target;
    click?: boolean;
    drag?: {
        from: Target;
        to: Target;
    };
    act?: (a: A) => void | Promise<void>;
    type?: {
        target: Target;
        text: string;
        cadence?: number;
    };
    gesture?: Gesture | {
        kind: Gesture;
        target?: Target;
    };
    circle?: Target;
    /** Advance GATE for a NON-async / pollable readiness condition — before the confirm gesture +
     *  settle, hold (abort-safe poll) until this returns true. The declarative "callback for when to
     *  move on": pair with `instant` to fire an action then wait until the app is ready (a render/
     *  animation settled, a DOM flag flipped). Throw-safe (a predicate that throws while its element
     *  is still null = "not ready yet"). On a ~15s timeout it ADVANCES with a `console.warn` (naming
     *  the last predicate error, if any) — never silent (the author gets a signal), never fatal (a
     *  backgrounded tab or slow app must not self-destruct the demo). For a PROMISE-based readiness,
     *  use an async `act` — the step already awaits it. */
    until?: () => boolean;
    /** Fixed pause AFTER the beat (ms), before the next step. Works with `instant` too. */
    settle?: number;
    /** INSTANT beat — the substance happens now with NO theater: no cursor move, no typing
     *  animation, no gesture, no settle. Only `act` (and `type`, set at once) run; positioning
     *  verbs are ignored. `say` still shows (narration ≠ motion), but instant beats are usually
     *  silent — the deliberate plumbing between the taught beats. */
    instant?: boolean;
    /** TEACHING BEAT — treat the caption as a lesson, not a subtitle. After `say` shows, the
     *  cursor dips to the narration dock (drawing the eye — the teacher underlining what they
     *  said) and the beat DWELLS long enough to READ, timed to the caption's word count via
     *  `readMs`, BEFORE the action runs. So the viewer understands the words first, then watches
     *  the thing happen. Needs a `say`; ignored on `instant` beats. Pairs with a short `settle`
     *  (the LAND — a brief digest pause on the result). */
    read?: boolean;
}
/** Reading dwell for a caption, scaled to its length — the DWELL in a teaching beat. A human
 *  reads ~4 words/sec; we budget a little slower (a newcomer, glancing between caption and canvas)
 *  and clamp so a short beat still lands and a long one doesn't stall. Multiply by `stage.pace` at
 *  the call site so a slow/fast theme scales reading time too. */
export declare function readMs(text: string): number;
/**
 * Compile a linear storyboard into a Walkthrough.
 * @param seed The typing baseline (the doc's starting text). '' for a blank canvas. For a
 *   non-empty seed, provide `TypeOps.read()` on the run so the diff tracks the live document.
 */
export declare function storyboard<A>(seed: string, steps: Step<A>[]): Walkthrough<A>;
