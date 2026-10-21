import { describe, expect, it } from 'vitest';
import type { NarrationHandle, Narrator } from './narrate';
import { resolvePacing } from './pacing';
import type { RunContext } from './runner';
import { scene } from './scene';
import type { Stage } from './stage';

// The voice leans toward what the cursor points at. The storyboard asks the stage where the target
// sits (-1 … 1) and hands it to the narrator BEFORE the line speaks, so the clip starts there.

function run(panOf: ((t: unknown) => number | null) | undefined) {
	const pans: number[] = [];
	const order: string[] = [];
	const narrator: Narrator = {
		voiced: true,
		setPan: (p) => {
			pans.push(p);
			order.push('pan');
		},
		speak(): NarrationHandle {
			order.push('speak');
			return { done: Promise.resolve(), cancel() {} };
		},
	};
	const stage = { say() {}, emphasizeCaption: async () => {}, point: async () => {}, press: async () => {}, gesture: async () => {}, panOf, busy() {}, setVoiced() {}, reduced: false, still: false, pace: 1, progress() {} } as unknown as Stage;
	const ctx = { stage, actions: {}, signal: new AbortController().signal, type: async () => {}, awaitUser: async () => new Event('x'), narrator, pacing: resolvePacing('moderate', 'grounded') } as unknown as RunContext<Record<string, never>>;
	return { ctx, pans, order };
}

describe('pan — the voice follows the hand', () => {
	it('sets the lean from the target before the line speaks', async () => {
		const { ctx, pans, order } = run((t) => (t === '#left' ? -0.6 : 0.4));
		await scene().say('Over here.').point('#left').hold(0).say('And over here.').point('#right').hold(0).build()(ctx);
		expect(pans).toEqual([-0.6, 0.4]);
		expect(order.slice(0, 2)).toEqual(['pan', 'speak']);
	});

	it('centres a beat that points at nothing, and a target that will not resolve', async () => {
		const { ctx, pans } = run((t) => (t === '#gone' ? null : -1));
		await scene().say('Welcome.').hold(0).say('Missing.').point('#gone').hold(0).build()(ctx);
		expect(pans).toEqual([0, 0]);
	});

	it('does nothing on a stage that cannot place a target', async () => {
		const { ctx, pans } = run(undefined);
		await scene().say('Hi.').point('#x').hold(0).build()(ctx);
		expect(pans).toEqual([0]);
	});
});
