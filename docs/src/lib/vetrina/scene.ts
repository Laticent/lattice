// Vetrina — the SCENE builder: the recommended hand-authoring surface. A RECORDING
// builder — each verb sets a slot on the CURRENT step and returns `this`; nothing
// executes until the built Walkthrough runs. It emits the same Step[] as storyboard(),
// and `build()` is DEFINED as storyboard(seed, this.toData()) — one interpreter, so
// scene() and Step[] are provably isomorphic (a parity test guards it).
//
// STEP-BOUNDARY RULE: a verb fills its slot on the current step; a NEW step opens when
// you would overwrite a filled slot (a second `say`, a second positioning verb) or call
// `.hold()` / `.step()`. So `.say().point().click().act().hold(900)` is ONE fused step
// with a single settle — identical pacing to the equivalent storyboard step.

import type { Walkthrough } from './runner';
import type { Gesture, Target } from './stage';
import { type Step, storyboard } from './storyboard';

export interface SceneBuilder<A> {
	say(text: string): this;
	point(t: Target): this;
	click(): this;
	drag(from: Target, to: Target): this;
	act(fn: (a: A) => void | Promise<void>): this;
	type(t: Target, text: string, opts?: { cadence?: number }): this;
	gesture(kind: Gesture, target?: Target): this;
	wave(): this;
	circle(t: Target): this;
	check(): this;
	cross(): this;
	shake(): this;
	/** Sets the current step's `settle` AND closes it. */
	hold(ms: number): this;
	/** Explicit step boundary (rarely needed — see the boundary rule). */
	step(): this;
	/** Compile to a Walkthrough — exactly storyboard(seed, this.toData()). */
	build(): Walkthrough<A>;
	/** The data model — for the wire / inspection / generation. */
	toData(): Step<A>[];
}

export function scene<A>(seed = ''): SceneBuilder<A> {
	const steps: Step<A>[] = [];
	let cur: Step<A> | null = null;

	// Open (or reuse) a step to write `slot`; opens a NEW step if any `exclusive` slot is
	// already filled on the current step.
	function open(exclusive: (keyof Step<A>)[]): Step<A> {
		if (!cur || exclusive.some((s) => cur?.[s] !== undefined)) {
			cur = {};
			steps.push(cur);
		}
		return cur;
	}
	const closeStep = () => {
		cur = null;
	};

	const b: SceneBuilder<A> = {
		say(text) {
			open(['say']).say = text;
			return b;
		},
		point(t) {
			open(['point', 'drag']).point = t;
			return b;
		},
		click() {
			(cur ?? open([])).click = true;
			return b;
		},
		drag(from, to) {
			open(['point', 'drag']).drag = { from, to };
			return b;
		},
		act(fn) {
			open(['act']).act = fn;
			return b;
		},
		type(t, text, opts) {
			open(['type']).type = { target: t, text, cadence: opts?.cadence };
			return b;
		},
		gesture(kind, target) {
			open(['gesture', 'circle']).gesture = target === undefined ? kind : { kind, target };
			return b;
		},
		wave() {
			return b.gesture('wave');
		},
		circle(t) {
			open(['gesture', 'circle']).circle = t;
			return b;
		},
		check() {
			return b.gesture('check');
		},
		cross() {
			return b.gesture('cross');
		},
		shake() {
			return b.gesture('shake');
		},
		hold(ms) {
			(cur ?? open([])).settle = ms;
			closeStep();
			return b;
		},
		step() {
			closeStep();
			return b;
		},
		build() {
			return storyboard(seed, steps);
		},
		toData() {
			return steps.map((s) => ({ ...s }));
		},
	};
	return b;
}
