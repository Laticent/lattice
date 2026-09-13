import { describe, expect, it, vi } from 'vitest';
import type { NarratedWord, NarrationHandle, Narrator } from './narrate';
import { resolvePacing } from './pacing';
import type { RunContext } from './runner';
import { scene } from './scene';
import type { Stage } from './stage';

// `Step.at` — the word cue. What is being pinned here is the ALIGNMENT rule, because the
// obvious version of this feature is silently inert: cue words come early in a line
// ("Now click Publish" says it at ~410 ms) and a cursor crossing an app needs ~900 ms to
// arrive, so a rule that only ever delays the ACTION resolves to a zero wait every time.
// Whichever side is behind has to wait, and these tests fail if that regresses to one side.

/** A narrator whose timeline is exactly what the test says it is. */
function fakeNarrator(plan: NarratedWord[] | null, opts: { voiced?: boolean; durationMs?: number } = {}): Narrator & { started: number[] } {
	const started: number[] = [];
	return {
		started,
		voiced: opts.voiced ?? false,
		plan: () => plan,
		speak(): NarrationHandle {
			started.push(Date.now());
			return { done: new Promise<void>((r) => setTimeout(r, opts.durationMs ?? 0)), cancel() {} };
		},
	};
}

interface Trace {
	at: number;
	what: string;
}

function harness(narrator: Narrator, leadMs: number) {
	const t0 = Date.now();
	const trace: Trace[] = [];
	const mark = (what: string) => trace.push({ at: Date.now() - t0, what });
	const stage = {
		say: (t: string) => mark(`say:${t}`),
		emphasizeCaption: async () => mark('emphasize'),
		point: async () => mark('point'),
		press: async () => mark('press'),
		gesture: async () => mark('gesture'),
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
		narrator,
		pacing: resolvePacing('moderate', 'grounded'),
	} as unknown as RunContext<Record<string, never>>;
	return { ctx, trace, startedAt: () => (narrator as ReturnType<typeof fakeNarrator>).started.map((t) => t - t0) };
}

const PLAN: NarratedWord[] = [
	{ index: 0, text: 'Now', startMs: 0, endMs: 200 },
	{ index: 1, text: 'click', startMs: 200, endMs: 410 },
	{ index: 2, text: 'Publish', startMs: 410, endMs: 900 },
];
const LINE = 'Now click Publish.';

describe('Step.at — the cursor lands on the word', () => {
	it('when the HAND is slower, the LINE waits: narration starts late so the word meets the arrival', async () => {
		// lead 700 ms, word at 410 ms → the line has to start 290 ms in.
		const narrator = fakeNarrator(PLAN);
		const { ctx, trace, startedAt } = harness(narrator, 700);
		await scene().say(LINE).at('Publish').point('#publish').click().hold(0).build()(ctx);

		// The action did NOT wait — it left immediately, which is the point.
		const point = trace.find((t) => t.what === 'point');
		expect(point?.at ?? 999).toBeLessThan(80);
		// The line did.
		const [lineStart] = startedAt();
		expect(lineStart).toBeGreaterThanOrEqual(240);
		expect(lineStart).toBeLessThan(460);
	});

	it('when the WORD is further off, the ACTION waits instead', async () => {
		// lead 100 ms, word at 410 ms → the action holds ~310 ms so it arrives on the word.
		const narrator = fakeNarrator(PLAN);
		const { ctx, trace, startedAt } = harness(narrator, 100);
		await scene().say(LINE).at('Publish').point('#publish').click().hold(0).build()(ctx);

		const [lineStart] = startedAt();
		expect(lineStart).toBeLessThan(80); // the line started at once
		const point = trace.find((t) => t.what === 'point');
		expect(point?.at ?? 0).toBeGreaterThanOrEqual(260);
	});

	it('exactly one side waits — never both, which would just add the two delays together', async () => {
		for (const lead of [0, 100, 410, 700, 2000]) {
			const narrator = fakeNarrator(PLAN);
			const { ctx, trace, startedAt } = harness(narrator, lead);
			await scene().say(LINE).at('Publish').point('#publish').click().hold(0).build()(ctx);
			const lineStart = startedAt()[0] ?? 0;
			const pointAt = trace.find((t) => t.what === 'point')?.at ?? 0;
			expect(Math.min(lineStart, pointAt)).toBeLessThan(80);
		}
	});

	it('a word the line does not contain leaves the beat in its normal order', async () => {
		const narrator = fakeNarrator(PLAN);
		const { ctx, trace, startedAt } = harness(narrator, 700);
		await scene().say(LINE).at('Archive').point('#publish').click().hold(0).build()(ctx);
		expect(startedAt()[0]).toBeLessThan(80);
		expect(trace.find((t) => t.what === 'point')?.at ?? 999).toBeLessThan(80);
	});

	it('a narrator that cannot plan its own timeline degrades silently, it does not throw', async () => {
		const narrator = fakeNarrator(null);
		const { ctx, trace } = harness(narrator, 700);
		await expect(scene().say(LINE).at('Publish').point('#publish').click().hold(0).build()(ctx)).resolves.toBeUndefined();
		expect(trace.some((t) => t.what === 'point')).toBe(true);
	});

	it('`at` overrides `read` — the two are opposite rhythms, and it warns', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const narrator = fakeNarrator(PLAN);
		const { ctx, trace } = harness(narrator, 100);
		await scene().say(LINE).at('Publish').read().point('#publish').click().hold(0).build()(ctx);
		// `read` would have dwelled for the caption before acting AND emphasized the dock.
		expect(trace.some((t) => t.what === 'emphasize')).toBe(false);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('at'));
		warn.mockRestore();
	});

	it('warns when `at` has no `say` to find the word in', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		scene().point('#publish').at('Publish').build();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a `say`'));
		warn.mockRestore();
	});
});

describe('narration and the beat clock', () => {
	it('a beat waits for its line before settling — the next caption never cuts a voice off', async () => {
		const narrator = fakeNarrator(null, { durationMs: 400 });
		const { ctx } = harness(narrator, 0);
		const t0 = Date.now();
		await scene().say('One.').hold(0).build()(ctx);
		expect(Date.now() - t0).toBeGreaterThanOrEqual(340);
	});

	it('a read beat takes the LONGER of the narration and the reading budget', async () => {
		// A 300 ms line against a ~1000 ms floor: the caption stays up long enough to READ, which
		// is the whole reason a deaf viewer has it on screen.
		const narrator = fakeNarrator(null, { durationMs: 300 });
		const { ctx } = harness(narrator, 0);
		const t0 = Date.now();
		await scene().say('Short.').read().hold(0).build()(ctx);
		expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
	});

	it('with no narrator at all the interpreter behaves exactly as it did before narration existed', async () => {
		const t0 = Date.now();
		const trace: string[] = [];
		const stage = {
			say: (t: string) => void trace.push(`say:${t}`),
			emphasizeCaption: async () => void trace.push('emphasize'),
			point: async () => void trace.push('point'),
			press: async () => void trace.push('press'),
			reduced: false,
			still: false,
			pace: 1,
		} as unknown as Stage;
		// No `narrator`, no `pacing` — a RunContext assembled by hand, as every host that drives a
		// Walkthrough without run() does.
		const ctx = { stage, actions: {}, signal: new AbortController().signal, type: async () => {}, awaitUser: async () => new Event('x') } as unknown as RunContext<Record<string, never>>;
		await scene().say('Hello.').point('#a').click().hold(0).build()(ctx);
		expect(trace).toEqual(['say:Hello.', 'point', 'press']);
		expect(Date.now() - t0).toBeLessThan(300);
	});
});
