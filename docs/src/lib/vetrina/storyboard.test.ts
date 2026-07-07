import { describe, expect, it, vi } from 'vitest';
import type { RunContext } from './runner';
import { storyboard } from './storyboard';

type Actions = { go: () => void };

// A fake ctx that records the ordered trace — no real DOM, reduced/pace stubbed.
function recorder() {
	const log: string[] = [];
	const stage = {
		say: (t: string) => void log.push(`say:${t}`),
		point: async (t: unknown) => void log.push(`point:${String(t)}`),
		press: async () => void log.push('press'),
		drag: async (from: unknown, to: unknown) => {
			log.push(`drag:${String(from)}->${String(to)}`);
			return { drop: async () => void log.push('drop'), snapBack: async () => void log.push('snapBack') };
		},
		gesture: async (k: string, t?: unknown) => void log.push(`gesture:${k}${t != null ? `:${String(t)}` : ''}`),
		reduced: true,
		still: true,
		pace: 1,
	};
	const actions: Actions = { go: () => log.push('act:go') };
	const ctx = {
		stage,
		actions,
		signal: new AbortController().signal,
		type: async (target: unknown, text: string, opts?: { instant?: boolean }) => void log.push(`type:${String(target)}:${text.length}${opts?.instant ? ':instant' : ''}`),
		awaitUser: async () => new Event('x'),
	} as unknown as RunContext<Actions>;
	return { log, ctx };
}
async function drive(play: (ctx: RunContext<Actions>) => Promise<void>) {
	const { log, ctx } = recorder();
	await play(ctx);
	return log;
}

describe('storyboard interpreter — fixed order', () => {
	it('plays say -> point -> click -> act -> type -> gesture', async () => {
		const board = storyboard<Actions>('', [
			{ say: 'hi', point: '#x', click: true, act: (a) => a.go(), type: { target: '#e', text: 'ABCD' }, gesture: 'check', settle: 0 },
		]);
		expect(await drive(board)).toEqual(['say:hi', 'point:#x', 'press', 'act:go', 'type:#e:4', 'gesture:check']);
	});
	it('circle sugar dispatches gesture(circle, target)', async () => {
		expect(await drive(storyboard<Actions>('', [{ circle: '#p', settle: 0 }]))).toEqual(['gesture:circle:#p']);
	});
});

describe('storyboard interpreter — instant beat (no theater)', () => {
	it('warns ONCE at construction about dropped verbs; play skips them and never re-warns', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const board = storyboard<Actions>('', [
			{ say: 'setup', point: '#x', click: true, act: (a) => a.go(), type: { target: '#e', text: 'ABCD' }, gesture: 'check', instant: true, settle: 0 },
		]);
		// The warn fires at BUILD (not per play — a kiosk loop replays forever).
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/instant.*ignores/i));
		// `say` still shows; point/press/gesture are SKIPPED; act runs; type is instant.
		expect(await drive(board)).toEqual(['say:setup', 'act:go', 'type:#e:4:instant']);
		await drive(board); // replay
		expect(warn).toHaveBeenCalledTimes(1); // still once — not per play
		warn.mockRestore();
	});
	it('a silent instant beat is just its act', async () => {
		expect(await drive(storyboard<Actions>('', [{ act: (a) => a.go(), instant: true }]))).toEqual(['act:go']);
	});
	it('`until` holds the beat until the predicate turns true, THEN advances', async () => {
		let polls = 0;
		let ready = false;
		const board = storyboard<Actions>('', [
			{
				act: (a) => a.go(),
				instant: true,
				until: () => {
					if (++polls >= 2) ready = true;
					return ready;
				},
				settle: 0,
			},
			{ say: 'next' },
		]);
		const log = await drive(board);
		expect(polls).toBeGreaterThanOrEqual(2); // it actually waited/polled before advancing
		expect(log).toEqual(['act:go', 'say:next']); // advanced to the next step only after `until`
	});
	it('`until` also gates the NORMAL (non-instant) path — after act/type, before the confirm gesture', async () => {
		let polls = 0;
		let ready = false;
		const board = storyboard<Actions>('', [
			{
				say: 'go',
				act: (a) => a.go(),
				gesture: 'check',
				until: () => {
					if (++polls >= 2) ready = true;
					return ready;
				},
				settle: 0,
			},
			{ say: 'next' },
		]);
		const log = await drive(board);
		expect(polls).toBeGreaterThanOrEqual(2);
		expect(log).toEqual(['say:go', 'act:go', 'gesture:check', 'say:next']);
	});
	it('a failing act still throws and skips the type (trust invariant holds)', async () => {
		const { log, ctx } = recorder();
		const board = storyboard<Actions>('', [
			{
				act: () => {
					throw new Error('nope');
				},
				type: { target: '#e', text: 'x' },
				instant: true,
				settle: 0,
			},
		]);
		await expect(board(ctx)).rejects.toThrow('nope');
		expect(log.some((l) => l.startsWith('type:'))).toBe(false);
	});
});

describe('storyboard interpreter — drag success gate (the trust invariant)', () => {
	it('act success -> the drop plays', async () => {
		const board = storyboard<Actions>('', [{ drag: { from: '#a', to: '#b' }, act: (a) => a.go(), settle: 0 }]);
		expect(await drive(board)).toEqual(['drag:#a->#b', 'act:go', 'drop']);
	});
	it('act failure -> snapBack + re-throw, NEVER a phantom drop', async () => {
		const { log, ctx } = recorder();
		const board = storyboard<Actions>('', [
			{
				drag: { from: '#a', to: '#b' },
				act: () => {
					throw new Error('nope');
				},
				settle: 0,
			},
		]);
		await expect(board(ctx)).rejects.toThrow('nope');
		expect(log).toEqual(['drag:#a->#b', 'snapBack']);
		expect(log).not.toContain('drop');
	});
});
