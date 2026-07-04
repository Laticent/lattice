import { describe, expect, it, vi } from 'vitest';
import type { DemoActions } from './demo-director';
import { runStoryboard, type Storyboard } from './demo-director';
import type { DemoStage } from './demo-stage';

// A fake stage: no real DOM, everything resolves instantly, reduced-motion ON so
// the director takes its fast path (no per-keystroke animation). It records the
// caption + cursor calls so we can assert the fixed step order.
function fakeStage(log: string[], reduced = true): DemoStage {
	return {
		resolve: (sel) => {
			log.push(`resolve:${sel}`);
			return {} as HTMLElement;
		},
		moveToEl: async () => {
			log.push('move');
		},
		press: async () => {
			log.push('press');
		},
		say: (t) => log.push(`say:${t}`),
		contains: () => false,
		reduced,
		destroy: () => {},
	};
}

function fakeActions(log: string[]): DemoActions & { source: string } {
	const bag = {
		source: '',
		setSource: (s: string) => {
			bag.source = s;
			log.push(`src:${s.length}`);
		},
		typeTail: (t: string) => {
			bag.source += t;
			log.push(`type:${t.length}`);
		},
		gotoSlide: (i: number) => log.push(`slide:${i}`),
		setView: () => {},
		openArchitect: (o: boolean) => log.push(`architect:${o}`),
		setArchitectTab: (t: string) => log.push(`tab:${t}`),
		openInspector: () => {},
		setPalette: (n: string) => log.push(`palette:${n}`),
		toggleMode: () => log.push('mode'),
		openPresent: () => {},
		openShare: () => {},
		fixAll: () => {},
	};
	return bag as unknown as DemoActions & { source: string };
}

describe('demo director', () => {
	it('plays steps in the fixed say → point → click → act → type order', async () => {
		const log: string[] = [];
		const actions = fakeActions(log);
		const board: Storyboard = {
			seed: 'AB',
			steps: [
				{ say: 'hello', moveTo: '#x', click: true, act: (a) => a.gotoSlide(2), settle: 0 },
				{ type: 'ABCD', settle: 0 },
			],
		};
		await runStoryboard(fakeStage(log), actions, board, new AbortController().signal);
		// Seed first, then the ordered effects of step 1, then the typed target.
		expect(log[0]).toBe('src:2'); // seed 'AB'
		expect(log.slice(1, 6)).toEqual(['say:hello', 'resolve:#x', 'move', 'press', 'slide:2']);
		expect(actions.source).toBe('ABCD'); // typed to the full target
	});

	it('reaches the storyboard target source through setSource', async () => {
		const log: string[] = [];
		const actions = fakeActions(log);
		const board: Storyboard = { seed: '', steps: [{ type: 'hello world', settle: 0 }] };
		await runStoryboard(fakeStage(log), actions, board, new AbortController().signal);
		expect(actions.source).toBe('hello world');
	});

	it('rejects with an AbortError when the signal aborts mid-run (take-over)', async () => {
		const log: string[] = [];
		const actions = fakeActions(log);
		const controller = new AbortController();
		const board: Storyboard = {
			seed: 'x',
			steps: [
				{ act: () => controller.abort(), settle: 5 },
				{ act: (a) => a.gotoSlide(9), settle: 0 },
			],
		};
		const run = runStoryboard(fakeStage(log), actions, board, controller.signal);
		await expect(run).rejects.toMatchObject({ name: 'AbortError' });
		// The step after the abort never ran.
		expect(log).not.toContain('slide:9');
	});

	it('animated typing appends through typeTail (native editor insert), not setSource', async () => {
		// With motion ON, each keystroke run is a native tail append — NOT a full-doc
		// setSource. setSource is only the seed here; the growing deck goes through
		// typeTail, which the editor dispatches without a user-event annotation (so it
		// never trips the first-edit cue).
		const log: string[] = [];
		const actions = fakeActions(log);
		const setSpy = vi.spyOn(actions, 'setSource');
		const typeSpy = vi.spyOn(actions, 'typeTail');
		const board: Storyboard = { seed: '', steps: [{ type: 'hello world', settle: 0 }] };
		await runStoryboard(fakeStage(log, /* reduced */ false), actions, board, new AbortController().signal);
		expect(setSpy).toHaveBeenCalledTimes(1); // the seed only
		expect(setSpy).toHaveBeenCalledWith(''); // …with the empty seed
		expect(typeSpy).toHaveBeenCalled(); // the deck was typed, not set
		expect(actions.source).toBe('hello world'); // and the appends reconstruct the target
	});
});
