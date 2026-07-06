// Vetrina — the STORYBOARD: the declarative data model + its interpreter. A linear
// walkthrough as data, played in the fixed order
//   say -> (point+click | drag) -> act -> type -> gesture -> settle
// so a storyboard reads top-to-bottom as intent. `storyboard()` returns a Walkthrough,
// so it composes with the primitive and the fluent builder (scene() is defined as
// storyboard(seed, this.toData()) — one interpreter, no drift).

import { holdUntil } from './recipes';
import type { RunContext, Walkthrough } from './runner';
import { type Gesture, isAbortError, type Target, wait } from './stage';

export interface Step<A> {
	say?: string;
	// POSITIONING — a step has EITHER point(+click) OR drag, never both.
	point?: Target;
	click?: boolean;
	drag?: { from: Target; to: Target };
	act?: (a: A) => void | Promise<void>;
	// Typing carries its TARGET (so it round-trips through the data model). Per-step cadence.
	type?: { target: Target; text: string; cadence?: number };
	gesture?: Gesture | { kind: Gesture; target?: Target };
	circle?: Target; // sugar for gesture: { kind: 'circle', target }
	/** Advance GATE for a NON-async / pollable readiness condition — before settling, hold
	 *  (abort-safe poll) until this returns true. The declarative "callback for when to move on":
	 *  pair with `instant` to fire an action then wait until the app is ready (a render/animation
	 *  settled, a DOM flag flipped). Throw-safe (a predicate that throws while its element is still
	 *  null = "not ready yet"); on a ~15s timeout it ENDS the run (never silently advances onto an
	 *  unready app). For a PROMISE-based readiness, use an async `act` — the step already awaits it. */
	until?: () => boolean;
	/** Fixed pause AFTER the beat (ms), before the next step. Works with `instant` too. */
	settle?: number;
	/** INSTANT beat — the substance happens now with NO theater: no cursor move, no typing
	 *  animation, no gesture, no settle. Only `act` (and `type`, set at once) run; positioning
	 *  verbs are ignored. `say` still shows (narration ≠ motion), but instant beats are usually
	 *  silent — the deliberate plumbing between the taught beats. */
	instant?: boolean;
}

const STEP_SETTLE = 900;

/**
 * Compile a linear storyboard into a Walkthrough.
 * @param seed The typing baseline (the doc's starting text). '' for a blank canvas. For a
 *   non-empty seed, provide `TypeOps.read()` on the run so the diff tracks the live document.
 */
export function storyboard<A>(seed: string, steps: Step<A>[]): Walkthrough<A> {
	void seed; // baseline is run-scoped (ctx.type); non-empty seeds want TypeOps.read()
	return async (ctx: RunContext<A>) => {
		const { stage, actions, signal } = ctx;

		for (const step of steps) {
			if (signal.aborted) return;
			if (step.say != null) stage.say(step.say);

			// INSTANT beat — skip ALL theater (cursor / typing animation / gesture / settle) and
			// just apply the substance. Positioning + gesture verbs are ignored; `type` is set at
			// once. `say` (above) still shows. The escape hatch for setup / close / jump beats that
			// don't need teaching — and it keeps the trust invariant (act is still awaited).
			if (step.instant) {
				// An instant beat has no theater to hang a positioning/gesture verb on — warn if the
				// author set one (it would be silently dropped, a real footgun — red-team #3).
				if (step.point != null || step.drag || step.click || step.gesture != null || step.circle != null) {
					console.warn('vetrina: an `instant` beat ignores point/click/drag/gesture — remove them, or drop `instant` to perform the beat.');
				}
				let actErr: unknown = null;
				if (step.act) {
					try {
						await step.act(actions);
					} catch (e) {
						if (isAbortError(e)) throw e;
						actErr = e;
					}
				}
				if (!actErr && step.type) await ctx.type(step.type.target, step.type.text, { cadence: step.type.cadence, instant: true });
				if (actErr) throw actErr;
				if (step.until) await holdUntil(ctx, step.until);
				await wait((step.settle ?? 0) * stage.pace, signal);
				continue;
			}

			// Positioning: point(+click) XOR drag. A drag LIFTS now; its drop is gated on `act`.
			let drag: Awaited<ReturnType<typeof stage.drag>> | null = null;
			if (step.drag) {
				drag = await stage.drag(step.drag.from, step.drag.to, signal);
			} else if (step.point != null) {
				await stage.point(step.point, signal);
				if (step.click) await stage.press(signal);
			}

			// act (awaited). Success gates the drag drop + the outcome gesture; a rejected act
			// snaps the drag back (the honest "it didn't happen") and re-throws -> onStop('error').
			let actErr: unknown = null;
			if (step.act) {
				try {
					await step.act(actions);
				} catch (e) {
					if (isAbortError(e)) throw e;
					actErr = e;
				}
			}
			if (drag) {
				if (actErr) await drag.snapBack(signal);
				else await drag.drop(signal);
			}
			if (actErr) throw actErr; // the theater already told the truth; now surface the failure

			// type (run-scoped baseline via ctx.type — shared across composed segments).
			if (step.type) {
				await ctx.type(step.type.target, step.type.text, { cadence: step.type.cadence });
			}

			// gesture — the outcome/confirm, AFTER act (reached only on success: a failed act threw).
			if (step.gesture != null) {
				const g = typeof step.gesture === 'string' ? { kind: step.gesture, target: undefined as Target | undefined } : step.gesture;
				await stage.gesture(g.kind, g.target, signal);
			}
			if (step.circle != null) await stage.gesture('circle', step.circle, signal);

			// Advance gate — hold until the app signals ready, THEN settle (both optional).
			if (step.until) await holdUntil(ctx, step.until);
			await wait((step.settle ?? (stage.reduced ? 300 : STEP_SETTLE)) * stage.pace, signal);
		}
	};
}
