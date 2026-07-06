import { describe, expect, it } from 'vitest';
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
		pace: 1,
	};
	const actions: Actions = { go: () => log.push('act:go') };
	const ctx = {
		stage,
		actions,
		signal: new AbortController().signal,
		type: async (target: unknown, text: string) => void log.push(`type:${String(target)}:${text.length}`),
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
