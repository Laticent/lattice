import { describe, expect, it } from 'vitest';
import { resolvePacing } from './pacing';
import type { RunContext } from './runner';
import { scene } from './scene';
import type { Stage } from './stage';

// The rhythm of a TRANSIENT caption, in the architect's words: "the mouse brings the user
// attention with the usual gesture. the caption appears next to it. the mouse moves the caption
// disappears. the caption appears again if there is something to be said. disappears after the
// time it takes to read the caption for an average person… bottom line, caption appears when
// needed."
//
// The ordering is the whole of it, so the ordering is what these pin. An earlier build said the
// line at the TOP of the beat — which put the words beside a cursor still standing wherever the
// previous beat had left it, and then left the caption up afterwards waiting to be replaced.

function harness(stepsAside: boolean) {
	const trace: string[] = [];
	const stage = {
		say: (t: string) => void trace.push(`say:${t}`),
		emphasizeCaption: async () => void trace.push('emphasize'),
		point: async () => void trace.push('point'),
		press: async () => void trace.push('press'),
		gesture: async (k: string) => void trace.push(`gesture:${k}`),
		drag: async () => {
			trace.push('drag');
			return { drop: async () => void trace.push('drop'), snapBack: async () => void trace.push('snapBack') };
		},
		dismissCaption: () => void trace.push('dismiss'),
		captionStepsAside: () => stepsAside,
		leadMs: () => 0,
		busy: () => {},
		setVoiced: () => {},
		progress: () => {},
		reduced: false,
		still: false,
		pace: 1,
	} as unknown as Stage;
	const ctx = {
		stage,
		actions: {},
		signal: new AbortController().signal,
		type: async () => void trace.push('type'),
		awaitUser: async () => new Event('x'),
		// A fast preset keeps the reading dwells short enough that the whole file stays quick;
		// the ORDER is what is under test, not the duration.
		pacing: resolvePacing('fast', 'grounded'),
	} as unknown as RunContext<Record<string, never>>;
	return { ctx, trace };
}

describe('a transient caption speaks AFTER the cursor arrives', () => {
	it('point → say → press, so the words land beside a cursor that is already there', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace).toEqual(['point', 'say:Now click Publish.', 'dismiss', 'press']);
	});

	it('and takes itself down before the action, not after it', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace.indexOf('dismiss')).toBeLessThan(trace.indexOf('press'));
	});

	it('a drag says its line once the item is lifted and held at the destination', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Reorder the backlog.').drag('#a', '#b').hold(0).build()(ctx);
		expect(trace).toEqual(['drag', 'say:Reorder the backlog.', 'dismiss', 'drop']);
	});

	it('a beat whose only movement is a stroke names the thing first, then speaks', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('These words are worth reading twice.').gesture('underline', '#prose').hold(0).build()(ctx);
		expect(trace).toEqual(['gesture:underline', 'say:These words are worth reading twice.', 'dismiss']);
	});

	it('a beat that does not move at all speaks immediately', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Nothing to point at here.').hold(0).build()(ctx);
		expect(trace).toEqual(['say:Nothing to point at here.', 'dismiss']);
	});

	it('every line is dismissed — a caption exists when there is something to say and not otherwise', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('One.').point('#a').hold(0).say('Two.').point('#b').hold(0).build()(ctx);
		expect(trace.filter((t) => t === 'dismiss')).toHaveLength(2);
		expect(trace).toEqual(['point', 'say:One.', 'dismiss', 'point', 'say:Two.', 'dismiss']);
	});

	it('a read beat still draws the eye to the words, after the arrival', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('This is the lesson.').read().point('#a').hold(0).build()(ctx);
		expect(trace).toEqual(['point', 'say:This is the lesson.', 'emphasize', 'dismiss']);
	});
});

describe('an edge dock keeps the rhythm it always had', () => {
	it('say → point → press, and nothing is ever dismissed', async () => {
		const { ctx, trace } = harness(false);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace).toEqual(['say:Now click Publish.', 'point', 'press']);
	});

	it('a read beat is still say → emphasize → dwell → act', async () => {
		const { ctx, trace } = harness(false);
		await scene().say('This is the lesson.').read().point('#a').hold(0).build()(ctx);
		expect(trace).toEqual(['say:This is the lesson.', 'emphasize', 'point']);
	});

	it('a plain beat does not dwell — the dock holds the words, so there is nothing to race', async () => {
		const { ctx } = harness(false);
		const t0 = Date.now();
		await scene().say('A fairly long caption that would take a moment to read properly.').point('#a').hold(0).build()(ctx);
		expect(Date.now() - t0).toBeLessThan(300);
	});
});

describe('a stage that predates all of this', () => {
	it('drives the old order, because captionStepsAside is optional', async () => {
		const trace: string[] = [];
		const stage = {
			say: (t: string) => void trace.push(`say:${t}`),
			point: async () => void trace.push('point'),
			press: async () => void trace.push('press'),
			reduced: false,
			still: false,
			pace: 1,
		} as unknown as Stage;
		const ctx = { stage, actions: {}, signal: new AbortController().signal, type: async () => {}, awaitUser: async () => new Event('x') } as unknown as RunContext<Record<string, never>>;
		await scene().say('Hello.').point('#a').click().hold(0).build()(ctx);
		expect(trace).toEqual(['say:Hello.', 'point', 'press']);
	});
});
