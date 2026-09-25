import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import { type Ltt, timeline, validateLtt } from '@/lib/ltt';
import { createTourRecorder, findCueWord, type Narrator, type RunContext, recordedLine, replayNarrator, type Stage, type Step, staleStretches, storyboard } from '@/lib/vetrina';

// LTT step 4: a storyboard run, recorded as a seekable LTT, then checked against its source.
// The plans are Cadenza's real tracks; the stage is a fake that records what the beat did, and
// the narrator speaks instantly, so the run's rhythm is the storyboard's own waits and settles.

const digest = async (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const INPUTS = { engine: `sha256:${'e'.repeat(64)}`, pace: 'moderate' as const };

/** Cadenza's real track for a line, at a twentieth of its length, so a test run takes milliseconds
 *  while every word keeps its place relative to the others. */
function fast(text: string) {
	const t = buildTrack(text, { pace: 'moderate' });
	const r = (n: number) => Math.round(n / 20);
	return { durationMs: r(t.durationMs), cues: t.cues.map((c) => ({ ...c, startMs: r(c.startMs), endMs: r(c.endMs), words: c.words.map((w) => ({ ...w, startMs: r(w.startMs), endMs: r(w.endMs) })) })) };
}

function narrator(): Narrator & { spoke: string[] } {
	const spoke: string[] = [];
	return {
		spoke,
		voiced: false,
		plan: (text: string) => fast(text),
		speak(text: string) {
			spoke.push(text);
			return { done: sleep(fast(text).durationMs), cancel() {} };
		},
	};
}

function context(n: Narrator, record: ReturnType<typeof createTourRecorder>, leadMs = 0) {
	const trace: { at: number; what: string }[] = [];
	const t0 = Date.now();
	const stage = {
		say: () => {},
		point: async () => {
			trace.push({ at: Date.now() - t0, what: 'point' });
		},
		press: async () => {},
		gesture: async () => {},
		leadMs: () => leadMs,
		busy: () => {},
		setVoiced: () => {},
		reduced: false,
		still: false,
		pace: 1,
		progress: () => {},
	} as unknown as Stage;
	const ctx = {
		stage,
		actions: {},
		signal: new AbortController().signal,
		type: async () => {},
		awaitUser: async () => new Event('x'),
		narrator: n,
		pacing: { captionMs: () => 0, dwellMs: () => 0, settleMs: () => 0 },
		recorder: record,
	} as unknown as RunContext<Record<string, never>>;
	return { ctx, trace };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tour(said = 'Then it shows the result.'): Step<Record<string, never>>[] {
	let ready = false;
	return [
		{ say: 'This is the report.', settle: 0 },
		{ say: 'Now click Publish to send it.', at: 'Publish', point: '#publish', click: true, settle: 0 },
		{ act: () => sleep(60), settle: 0 },
		{ say: said, settle: 0 },
		{
			act: () => {
				setTimeout(() => {
					ready = true;
				}, 40);
			},
			until: () => ready,
			settle: 0,
		},
		{ say: 'Done.', settle: 0 },
	];
}

async function record(steps = tour()): Promise<Ltt> {
	const n = narrator();
	const rec = createTourRecorder({ id: 'publish-demo', inputs: INPUTS, digest, viewport: { w: 1440, h: 900 } });
	await storyboard('', steps)(context(n, rec).ctx);
	return rec.ltt(steps);
}

describe('the tour recorder — one run, written down as a seekable LTT', () => {
	it('writes a file validateLtt accepts, seekable, with the screen it was recorded on', async () => {
		const ltt = await record();
		expect(validateLtt(ltt)).toEqual([]);
		expect(ltt.seekable).toBe(true);
		expect(ltt.source).toEqual({ kind: 'tour', id: 'publish-demo' });
		expect(ltt.inputs).toMatchObject({ viewport: { w: 1440, h: 900 }, motion: 'full', stagePace: 1 });
	});

	it('starts a new stretch after each wait, and records how long the wait took', async () => {
		const ltt = await record();
		const s = ltt.segments.map((g) => (g.kind === 'stretch' ? { beats: g.at.beats, after: g.after, cues: g.track.cues.length } : null));
		expect(s).toEqual([
			{ beats: [0, 2], after: undefined, cues: 2 },
			{ beats: [3, 4], after: 'act', cues: 1 },
			{ beats: [5, 5], after: 'until', cues: 1 },
		]);
		const [, act, until] = ltt.segments as Extract<Ltt['segments'][number], { kind: 'stretch' }>[];
		// The act slept 60 ms and the until held ~40 ms; timers only ever run late.
		expect(act.waitedMs).toBeGreaterThanOrEqual(55);
		expect(until.waitedMs).toBeGreaterThanOrEqual(35);
		expect(timeline(ltt).durationMs).toBeGreaterThan(0);
	});

	it('records the word cue as an action with the word the author named', async () => {
		const ltt = await record();
		const first = ltt.segments[0] as Extract<Ltt['segments'][number], { kind: 'stretch' }>;
		expect(first.actions).toEqual([{ cue: 1, word: 2, match: 'publish', verb: 'click', target: '#publish', arrive: 'on-word' }]);
		expect(first.track.cues[1].words[2].display).toBe('Publish');
	});

	it('an action whose word moved fails validateLtt, as §4.7 promises', async () => {
		const ltt = await record();
		const first = ltt.segments[0] as Extract<Ltt['segments'][number], { kind: 'stretch' }>;
		first.actions = [{ ...(first.actions?.[0] as NonNullable<typeof first.actions>[number]), word: 3 }];
		expect(validateLtt(ltt).join('\n')).toMatch(/narration moved under the action/);
	});

	it('changes nothing when no recorder is wired', async () => {
		const n = narrator();
		const { ctx } = context(n, undefined as unknown as ReturnType<typeof createTourRecorder>);
		await expect(storyboard('', tour())(ctx)).resolves.toBeUndefined();
		expect(n.spoke).toHaveLength(4);
	});
});

describe('staleStretches — the recorder is isStale’s first caller (G3)', () => {
	it('a fresh recording is not stale against its own storyboard', async () => {
		const ltt = await record();
		expect(await staleStretches(ltt, tour(), INPUTS, digest)).toEqual([]);
	});

	it('an edited line flags its stretch, and the recorded wait is kept', async () => {
		const ltt = await record();
		const before = JSON.stringify(ltt);
		const stale = await staleStretches(ltt, tour('Then it shows the new result.'), INPUTS, digest);
		expect(stale).toEqual([{ id: 's1', reason: 'changed', keep: true }]);
		// Flagged, never rebuilt: the measured wait and the recorded rhythm are all still there.
		expect(JSON.stringify(ltt)).toBe(before);
		expect((ltt.segments[1] as { waitedMs?: number }).waitedMs).toBeGreaterThanOrEqual(55);
	});

	it('emphasis is part of the hash: re-weighting a line flags its stretch', async () => {
		const ltt = await record();
		const stale = await staleStretches(ltt, tour(), INPUTS, digest, (t) => (t === 'Done.' ? [{ start: 0, end: 4, weight: 1.6 }] : undefined));
		expect(stale.map((s) => s.id)).toEqual(['s2']);
	});

	it('a new engine or pace flags every stretch: the host passes its CURRENT inputs', async () => {
		const ltt = await record();
		const stale = await staleStretches(ltt, tour(), { ...INPUTS, pace: 'fast' }, digest);
		expect(stale.map((s) => s.id)).toEqual(['s0', 's1', 's2']);
	});

	it('every recorded stretch is measured, so isStale alone already says keep it', async () => {
		const ltt = await record();
		expect(ltt.segments.every((g) => g.kind === 'stretch' && g.basis === 'measured')).toBe(true);
	});

	it('a storyboard that lost the recorded beats reports them gone', async () => {
		const ltt = await record();
		const stale = await staleStretches(ltt, tour().slice(0, 4), INPUTS, digest);
		expect(stale).toEqual([
			{ id: 's1', reason: 'gone', keep: true },
			{ id: 's2', reason: 'gone', keep: true },
		]);
	});
});

describe('an aborted run records nothing', () => {
	it('ltt() refuses a run that did not reach its last beat', async () => {
		const n = narrator();
		const rec = createTourRecorder({ id: 'x', inputs: INPUTS, digest, viewport: { w: 1440, h: 900 } });
		const controller = new AbortController();
		const { ctx } = context(n, rec);
		const run = storyboard('', tour())({ ...ctx, signal: controller.signal });
		setTimeout(() => controller.abort(), 5);
		await run.catch(() => {});
		await expect(rec.ltt(tour())).rejects.toThrow(/did not finish/);
	});
});

describe('replay — the recording, played back as the plan', () => {
	it('a line said twice replays each time with its own recorded timing', async () => {
		const steps: Step<Record<string, never>>[] = [
			{ say: 'Click Save.', settle: 0 },
			{ act: () => sleep(20), settle: 0 },
			{ say: 'Click Save.', settle: 0 },
		];
		const n = narrator();
		const slow = { ...n, speak: (text: string, o: Parameters<Narrator['speak']>[1]) => (text === 'Click Save.' && n.spoke.length === 0 ? (n.spoke.push(text), { done: sleep(80), cancel() {} }) : n.speak(text, o)) };
		const rec = createTourRecorder({ id: 'x', inputs: INPUTS, digest, viewport: { w: 1440, h: 900 } });
		await storyboard('', steps)(context(slow as Narrator, rec).ctx);
		const ltt = await rec.ltt(steps);
		const first = recordedLine(ltt, 'Click Save.', 0)?.durationMs ?? 0;
		const second = recordedLine(ltt, 'Click Save.', 1)?.durationMs ?? 0;
		expect(first).toBeGreaterThan(second + 30);
		// And the replay narrator walks them in order.
		const replay = replayNarrator(ltt, narrator());
		expect(replay.plan?.('Click Save.')?.durationMs).toBe(first);
		replay.speak('Click Save.', { signal: new AbortController().signal });
		expect(replay.plan?.('Click Save.')?.durationMs).toBe(second);
	});

	it('recordedLine hands back the line exactly as recorded, re-based to 0', async () => {
		const ltt = await record();
		const line = recordedLine(ltt, 'Now click Publish to send it.');
		const plan = fast('Now click Publish to send it.');
		// The words keep their places; the whole line is re-timed to how long it really took.
		expect(line?.cues[0].words.map((w) => w.display)).toEqual(plan.cues[0].words.map((w) => w.display));
		expect(Math.abs((line?.durationMs ?? 0) - plan.durationMs)).toBeLessThan(25);
		expect(recordedLine(ltt, 'A line nobody said.')).toBeNull();
	});

	it('a replayed word cue lands on its word whatever the lead — the lead is asked of the live stage', async () => {
		const ltt = await record();
		const word = findCueWord(recordedLine(ltt, 'Now click Publish to send it.'), 'Publish');
		expect(word).not.toBeNull();
		// Three leads stand for three screens: a near target, the recorded one, a far one. Whichever
		// side is behind waits, so the hand ARRIVES (point + lead) as the line reaches the word.
		for (const lead of [0, 20, 300]) {
			const inner = narrator();
			const startedAt: number[] = [];
			const speak = inner.speak;
			inner.speak = (text, o) => {
				startedAt.push(Date.now());
				return speak(text, o);
			};
			const run = context(replayNarrator(ltt, inner), createTourRecorder({ id: 'x', inputs: INPUTS, digest }), lead);
			const t0 = Date.now();
			await storyboard('', tour())(run.ctx);
			const pointAt = t0 + (run.trace.find((t) => t.what === 'point')?.at ?? 0);
			const wordAt = startedAt[1] + (word?.startMs ?? 0);
			expect(Math.abs(pointAt + lead - wordAt), `lead ${lead}`).toBeLessThan(25);
		}
	});
});
