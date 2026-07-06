import { describe, expect, it } from 'vitest';
import type { RunContext } from './runner';
import { scene } from './scene';
import { storyboard } from './storyboard';

type Actions = { go: () => void };

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

describe('scene() — the step-boundary rule', () => {
	it('fuses verbs into ONE step until a filled slot / hold()', () => {
		const d = scene<Actions>('')
			.say('a')
			.point('#x')
			.click()
			.act((x) => x.go())
			.hold(900)
			.toData();
		expect(d).toHaveLength(1);
		expect(d[0].say).toBe('a');
		expect(d[0].point).toBe('#x');
		expect(d[0].click).toBe(true);
		expect(d[0].settle).toBe(900);
	});
	it('a second say opens a new step', () => {
		expect(scene('').say('a').say('b').toData()).toHaveLength(2);
	});
	it('a second positioning verb opens a new step (point XOR drag)', () => {
		expect(scene('').point('#x').point('#y').toData()).toHaveLength(2);
		expect(scene('').point('#x').drag('#a', '#b').toData()).toHaveLength(2);
	});
	it('sugar maps to Step fields', () => {
		expect(scene('').wave().toData()[0].gesture).toBe('wave');
		expect(scene('').check().toData()[0].gesture).toBe('check');
		expect(scene('').circle('#p').toData()[0].circle).toBe('#p');
		expect(scene('').gesture('circle', '#p').toData()[0].gesture).toEqual({ kind: 'circle', target: '#p' });
		expect(scene('').drag('#a', '#b').toData()[0].drag).toEqual({ from: '#a', to: '#b' });
	});
	it('.instant() flags the current step (composes with act, fuses into one step)', () => {
		const d = scene<Actions>('')
			.act((x) => x.go())
			.instant()
			.toData();
		expect(d).toHaveLength(1);
		expect(d[0].instant).toBe(true);
		expect(typeof d[0].act).toBe('function');
	});
	it('.instant().until() compose on one step — fire now, hold until ready', () => {
		let ready = false;
		const d = scene<Actions>('')
			.act((x) => x.go())
			.instant()
			.until(() => ready)
			.toData();
		expect(d).toHaveLength(1);
		expect(d[0].instant).toBe(true);
		expect(typeof d[0].until).toBe('function');
		ready = true;
		expect(d[0].until?.()).toBe(true);
	});
});

describe('scene().build() === storyboard(seed, toData()) — provable isomorphism', () => {
	it('both compile to identical run traces — including instant + until', async () => {
		// Cover the NEW fields too, so the isomorphism is proven, not just asserted by construction.
		const s = scene<Actions>('seed')
			.say('a')
			.point('#x')
			.click()
			.act((x) => x.go())
			.until(() => true) // resolves on the first poll — no trace, but must round-trip
			.hold(0)
			.check()
			.hold(0)
			.act((x) => x.go())
			.instant() // an instant beat: act only, no theater
			.hold(0);
		const trace = async (play: (ctx: RunContext<Actions>) => Promise<void>) => {
			const { log, ctx } = recorder();
			await play(ctx);
			return log;
		};
		const viaScene = await trace(s.build());
		const viaData = await trace(storyboard('seed', s.toData()));
		expect(viaScene).toEqual(viaData);
		expect(viaScene.length).toBeGreaterThan(0);
	});
});
