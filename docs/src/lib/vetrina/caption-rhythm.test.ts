import { describe, expect, it } from 'vitest';
import type { CaptionTrack } from '@/lib/ltt';
import { resolvePacing } from './pacing';
import type { RunContext } from './runner';
import { scene } from './scene';
import type { Stage } from './stage';

/** A flat word list as the one-cue CaptionTrack a narrator's `plan()` returns. */
function asTrack(words: { text: string; startMs: number; endMs: number }[]): CaptionTrack {
	const end = words.length ? words[words.length - 1].endMs : 0;
	return {
		durationMs: end,
		cues: [{ display: words.map((w) => w.text).join(' '), startMs: 0, endMs: end, charOffset: 0, words: words.map((w) => ({ display: w.text, spoken: w.text, startMs: w.startMs, endMs: w.endMs, charOffset: 0 })) }],
	};
}

// The rhythm of a TRANSIENT caption, in the architect's words: "the mouse brings the user
// attention with the usual gesture. the caption appears next to it. the mouse moves the caption
// disappears. the caption appears again if there is something to be said. disappears after the
// time it takes to read the caption for an average person… bottom line, caption appears when
// needed."
//
// The ordering is the whole of it, so the ordering is what these pin. An earlier build said the
// line at the TOP of the beat — which put the words beside a cursor still standing wherever the
// previous beat had left it, and then left the caption up afterwards waiting to be replaced.

function harness(stepsAside: boolean, narrator?: unknown) {
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
		holdCaption: (on: boolean) => void trace.push(`hold:${on}`),
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
		narrator,
	} as unknown as RunContext<Record<string, never>>;
	return { ctx, trace };
}

describe('a transient caption speaks AFTER the cursor arrives', () => {
	it('point → say → press, so the words land beside a cursor that is already there', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['point', 'say:Now click Publish.', 'dismiss', 'press']);
	});

	it('and takes itself down before the action, not after it', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace.indexOf('dismiss')).toBeLessThan(trace.indexOf('press'));
	});

	it('a drag says its line once the item is lifted and held at the destination', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Reorder the backlog.').drag('#a', '#b').hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['drag', 'say:Reorder the backlog.', 'dismiss', 'drop']);
	});

	it('a beat whose only movement is a stroke names the thing first, then speaks', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('These words are worth reading twice.').gesture('underline', '#prose').hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['gesture:underline', 'say:These words are worth reading twice.', 'dismiss']);
	});

	it('a beat that does not move at all speaks immediately', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Nothing to point at here.').hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['say:Nothing to point at here.', 'dismiss']);
	});

	it('every line is dismissed — a caption exists when there is something to say and not otherwise', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('One.').point('#a').hold(0).say('Two.').point('#b').hold(0).build()(ctx);
		expect(trace.filter((t) => t === 'dismiss')).toHaveLength(2);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['point', 'say:One.', 'dismiss', 'point', 'say:Two.', 'dismiss']);
	});

	it('a beat that TYPES says its line before typing, not after', async () => {
		// `gesture` used to count as the say-point whenever it was present, so a say+type+gesture
		// beat typed first and then explained the typing it had just done.
		const { ctx, trace } = harness(true);
		await scene()
			.say('Type the title, then check it.')
			.type('#title', 'Q4')
			.gesture('check')
			.hold(0)
			.build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['say:Type the title, then check it.', 'dismiss', 'type', 'gesture:check']);
	});

	it('a beat that WAITS shows its line before the wait, not after the confirm', async () => {
		// `until` can hold the advance gate for up to ~15s. Saying the line after it left the viewer
		// looking at a frozen app with no caption at all, then explained it once the gate opened.
		const { ctx, trace } = harness(true);
		let ready = false;
		setTimeout(() => {
			ready = true;
		}, 60);
		await scene()
			.say('Wait for the render.')
			.until(() => ready)
			.gesture('check')
			.hold(0)
			.build()(ctx);
		const order = trace.filter((t) => !t.startsWith('hold:'));
		expect(order.indexOf('say:Wait for the render.')).toBeLessThan(order.indexOf('gesture:check'));
	});

	it('a beat whose act THROWS still said what it was trying to do', async () => {
		// The throw leaves the beat before the gesture block, which is where a gesture-only beat
		// says its line — so the tour used to stop on an empty caption.
		const { ctx, trace } = harness(true);
		const play = scene<{ boom: () => void }>()
			.say('This one is going to fail.')
			.act(() => {
				throw new Error('boom');
			})
			.gesture('cross')
			.hold(0)
			.build();
		await expect(play(ctx as never)).rejects.toThrow('boom');
		expect(trace).toContain('say:This one is going to fail.');
	});

	it('a DRAG beat holds its caption up for the dwell — it does not depend on a side effect', async () => {
		// A drag holds the stage's performance count from lift to drop, so the caption was legible
		// only because `say()` re-zeroes that count — a line whose own comment calls it a cosmetic
		// slip. The dwell now pins the caption explicitly.
		const { ctx, trace } = harness(true);
		await scene().say('Reorder the backlog.').drag('#a', '#b').hold(0).build()(ctx);
		const held = trace.indexOf('hold:true');
		const dismissed = trace.indexOf('dismiss');
		expect(held).toBeGreaterThan(-1);
		expect(held).toBeLessThan(dismissed);
		expect(trace.lastIndexOf('hold:false')).toBeGreaterThan(dismissed);
	});

	it('a TRAILING cued beat clears its hold — a composed segment must not leave it pinned', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Now click Publish.').at('Publish').point('#publish').click().hold(0).build()(ctx);
		// No narrator here, so the cue does not resolve — but the walkthrough must still end with the
		// hold released, because a storyboard can be followed by raw primitives in the same run.
		expect(trace[trace.length - 1]).toBe('hold:false');
	});

	it('a read beat still draws the eye to the words, after the arrival', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('This is the lesson.').read().point('#a').hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['point', 'say:This is the lesson.', 'emphasize', 'dismiss']);
	});
});

// A cue only resolves against a narrator that can `plan`, and it is the RESOLVED cue that takes
// a beat off the step-aside path. A harness without one silently tests the other branch.
const PLANNER = {
	voiced: false,
	speak: () => ({ done: Promise.resolve(), cancel() {} }),
	plan: (text: string) => asTrack(text.split(/\s+/).map((w, i) => ({ text: w, index: i, startMs: i * 300, endMs: i * 300 + 280 }))),
};

describe('a transient caption is never left standing', () => {
	// `stepsAside` takes a caption down inside its own beat. The two shapes it excludes did not
	// take theirs down AT ALL: an `instant` beat left its line up, and the balloon then re-anchored
	// itself beside the cursor on every later beat that had no `say` of its own; a cued (`at`) beat
	// did the same. Both contradict the property the style is sold on, and both were invisible
	// inside `run()` because `destroy()` swept the leftover away at the end of the tour.

	it('an INSTANT beat does not leave its line up for the rest of the tour', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Setup line, not a lesson.').instant().hold(0).build()(ctx);
		expect(trace.filter((t) => t === 'dismiss')).toHaveLength(1);
	});

	it('and the beat after it does not inherit a caption', async () => {
		const { ctx, trace } = harness(true);
		await scene().say('Setup line.').instant().hold(0).point('#a').hold(0).build()(ctx);
		// One line said, one line dismissed, and the pointing beat that follows says nothing.
		expect(trace.filter((t) => t.startsWith('say:'))).toEqual(['say:Setup line.']);
		expect(trace.filter((t) => t === 'dismiss')).toHaveLength(1);
		expect(trace.indexOf('dismiss')).toBeLessThan(trace.indexOf('point'));
	});

	it('a CUED beat pins its caption through the action, then takes it down', async () => {
		// A cue only resolves against a narrator that can `plan`, and it is the RESOLVED cue that
		// takes the beat off the step-aside path — so a harness without one tests the wrong branch.
		const { ctx, trace } = harness(true, PLANNER);
		await scene().say('Now click Publish.').at('Publish').point('#publish').click().hold(0).build()(ctx);
		// Pinned through the action — that is what `at` is for — and then taken down, which is the
		// part that was missing: the line used to survive the beat and be inherited by the next.
		expect(trace).toContain('dismiss');
		expect(trace.indexOf('press')).toBeLessThan(trace.indexOf('dismiss'));
		expect(trace.lastIndexOf('hold:false')).toBeGreaterThan(trace.indexOf('dismiss'));
	});
});

describe('a transient dwell is budgeted by dwellMs, never captionMs', () => {
	// The two are the same number under `'grounded'` and differ by 43% under the DEFAULT
	// `'legacy'`, whose 300 wpm ./pacing documents as wrong by a factor. An edge dock survives the
	// wrong number because the words stay up; a transient caption ERASES itself on it. Asserting
	// which function is consulted is the fast oracle — asserting the duration would mean sleeping
	// through a real 3-second dwell to catch a one-line regression.
	function spied(stepsAside: boolean) {
		const base = resolvePacing('fast', 'legacy');
		const calls: string[] = [];
		const { ctx, trace } = harness(stepsAside);
		(ctx as { pacing: unknown }).pacing = {
			...base,
			captionMs: () => {
				calls.push('captionMs');
				return 1;
			},
			dwellMs: () => {
				calls.push('dwellMs');
				return 1;
			},
		};
		return { ctx, trace, calls };
	}

	it('a transient beat asks dwellMs', async () => {
		const { ctx, calls } = spied(true);
		await scene().say('This panel is the app you are about to tour.').point('#a').hold(0).build()(ctx);
		expect(calls).toContain('dwellMs');
		expect(calls).not.toContain('captionMs');
	});

	it('and an edge dock still asks captionMs, which is a pacing decision and follows the model', async () => {
		const { ctx, calls } = spied(false);
		await scene().say('This panel is the app you are about to tour.').point('#a').hold(0).build()(ctx);
		expect(calls).toContain('captionMs');
		expect(calls).not.toContain('dwellMs');
	});
});

describe('a hold never outlives the beat that set it', () => {
	it('a throwing act on a cued beat releases the pin', async () => {
		// The release used to sit at the top of the NEXT iteration, under a comment claiming "there
		// is no path that leaves the caption pinned". A throwing `act` that a host swallows —
		// `retry()` and `loop()` in ./recipes both catch — left `captionHeld` true, and the caption
		// never stepped aside again for the rest of the run.
		const { ctx, trace } = harness(true, PLANNER);
		const play = scene<{ boom: () => void }>()
			.say('This one is going to fail.')
			.at('going')
			.point('#a')
			.act(() => {
				throw new Error('boom');
			})
			.hold(0)
			.build();
		await expect(play(ctx as never)).rejects.toThrow('boom');
		expect(trace.lastIndexOf('hold:false')).toBeGreaterThan(trace.lastIndexOf('hold:true'));
	});
});

describe('an edge dock keeps the rhythm it always had', () => {
	it('say → point → press, and nothing is ever dismissed', async () => {
		const { ctx, trace } = harness(false);
		await scene().say('Now click Publish.').point('#publish').click().hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['say:Now click Publish.', 'point', 'press']);
	});

	it('a read beat is still say → emphasize → dwell → act', async () => {
		const { ctx, trace } = harness(false);
		await scene().say('This is the lesson.').read().point('#a').hold(0).build()(ctx);
		expect(trace.filter((t) => !t.startsWith('hold:'))).toEqual(['say:This is the lesson.', 'emphasize', 'point']);
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
