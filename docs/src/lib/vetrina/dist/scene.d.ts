import type { Walkthrough } from './runner';
import type { Gesture, Target } from './stage';
import { type Step } from './storyboard';
export interface SceneBuilder<A> {
    say(text: string): this;
    point(t: Target): this;
    click(): this;
    drag(from: Target, to: Target): this;
    act(fn: (a: A) => void | Promise<void>): this;
    type(t: Target, text: string, opts?: {
        cadence?: number;
    }): this;
    gesture(kind: Gesture, target?: Target): this;
    wave(): this;
    circle(t: Target): this;
    check(): this;
    cross(): this;
    shake(): this;
    /** Mark the current step INSTANT — its `act`/`type` apply now with no cursor / typing
     *  animation / gesture / settle. For setup / close / jump beats that don't need teaching. */
    instant(): this;
    /** Mark the current step a TEACHING beat — after `say`, dip the cursor to the caption and
     *  the words glow-pulse, then DWELL to read (timed to the caption) BEFORE the action runs.
     *  Pairs with a short `hold`/settle (the land — a brief digest pause on the result). */
    read(): this;
    /** Advance GATE — hold on this step until `pred` is true (abort-safe). The "callback for
     *  when to move on"; pairs with `.instant()` to fire, then wait for the app to be ready. */
    until(pred: () => boolean): this;
    /** Sets the current step's `settle` AND closes it. */
    hold(ms: number): this;
    /** Explicit step boundary (rarely needed — see the boundary rule). */
    step(): this;
    /** Compile to a Walkthrough — exactly storyboard(seed, this.toData()). */
    build(): Walkthrough<A>;
    /** The data model — for the wire / inspection / generation. */
    toData(): Step<A>[];
}
export declare function scene<A>(seed?: string): SceneBuilder<A>;
