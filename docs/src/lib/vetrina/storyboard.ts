// Vetrina — the STORYBOARD: the declarative data model + its interpreter. A linear
// walkthrough as data, played in the fixed order
//   say -> (point+click | drag) -> act -> type -> gesture -> settle
// so a storyboard reads top-to-bottom as intent. `storyboard()` returns a Walkthrough,
// so it composes with the primitive and the fluent builder (scene() is defined as
// storyboard(seed, this.toData()) — one interpreter, no drift).

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
	settle?: number;
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

			await wait((step.settle ?? (stage.reduced ? 300 : STEP_SETTLE)) * stage.pace, signal);
		}
	};
}
