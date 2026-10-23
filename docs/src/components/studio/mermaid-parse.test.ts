// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// The page has recorded its engine's address (the frame cannot open before that).
vi.mock('../../lib/engine-base', () => ({ engineBase: () => 'https://x.test/engine/' }));

// The check draws each diagram through the page's draw host and reads the library's refusal as the diagnosis.
const diagram = (slide: number, code: string) => ({ slide, code });

function withHost(host: unknown) {
	vi.stubGlobal('window', { __latticeDrawHost: host });
}

afterEach(() => vi.unstubAllGlobals());

describe('checkDiagrams: the sandboxed frame answers, the page loads no Mermaid', () => {
	it('reports the diagrams the library refuses, by slide', async () => {
		const jobs: Array<Record<string, unknown>> = [];
		withHost({
			kinds: ['mermaid'],
			draw: async (job: Record<string, unknown>) => {
				jobs.push(job);
				if (String(job.definition).includes('bad')) throw Object.assign(new Error('Parse error on line 2:\n...\n---^\nExpecting X, got Y'), { drawRefused: true });
				return '{}';
			},
		});
		const { checkDiagrams } = await import('./mermaid-parse');
		const out = await checkDiagrams([diagram(1, 'flowchart TD\n A-->B'), diagram(4, 'bad')]);
		expect(out).toEqual([{ slide: 4, message: 'Parse error on line 2: Expecting X, got Y' }]);
		expect(jobs.every((j) => j.kind === 'mermaid' && typeof j.svgId === 'string')).toBe(true);
		expect(new Set(jobs.map((j) => j.svgId)).size).toBe(jobs.length);
	});

	it('gives an unchanged diagram the same job id on the next check, so the host can remember it', async () => {
		const ids: unknown[] = [];
		withHost({ kinds: ['mermaid'], draw: async (job: Record<string, unknown>) => {
			ids.push(job.svgId);
			return '{}';
		} });
		const { checkDiagrams } = await import('./mermaid-parse');
		await checkDiagrams([diagram(1, 'graph TD\n A')]);
		await checkDiagrams([diagram(1, 'graph TD\n A')]);
		expect(ids[0]).toBe(ids[1]);
	});

	it('refuses an over-long label the way the preview does, without drawing it', async () => {
		const jobs: unknown[] = [];
		withHost({ kinds: ['mermaid'], draw: async (job: unknown) => {
			jobs.push(job);
			return '{}';
		} });
		const { checkDiagrams } = await import('./mermaid-parse');
		const out = await checkDiagrams([diagram(2, `flowchart TD\n A["${'x'.repeat(600)}"] --> B`)]);
		expect(jobs).toHaveLength(0);
		expect(out).toHaveLength(1);
		expect(out?.[0].slide).toBe(2);
	});

	it("does not read the author's own words as the frame's trouble", async () => {
		const { checkDiagrams } = await import('./mermaid-parse');
		withHost({
			kinds: ['mermaid'],
			draw: async (job: Record<string, unknown>) => {
				if (String(job.definition).includes('bad')) throw Object.assign(new Error('Parse error on line 3:\n...the API returned null --> B\nExpecting X'), { drawRefused: true });
				return '{}';
			},
		});
		const out = await checkDiagrams([diagram(1, 'graph TD\n A'), diagram(2, 'bad the API returned null')]);
		expect(out).toHaveLength(1);
		expect(out?.[0].slide).toBe(2);
		for (const m of ['the frame returned undefined, not text', 'mermaid did not load', 'the drawing is not text']) {
			withHost({ kinds: ['mermaid'], draw: async () => { throw Object.assign(new Error(m), { drawRefused: true }); } });
			expect(await checkDiagrams([diagram(1, 'graph TD\n A')]), m).toBeNull();
		}
	});

	it('stops between diagrams when the deck moves on', async () => {
		const { checkDiagrams } = await import('./mermaid-parse');
		let drawn = 0;
		let stop = false;
		withHost({ kinds: ['mermaid'], draw: async () => { drawn++; stop = true; return '{}'; } });
		expect(await checkDiagrams([diagram(1, 'graph TD\n A'), diagram(2, 'graph TD\n B')], '', () => stop)).toBeNull();
		expect(drawn).toBe(1);
	});

	it("does not call the drawing's own trouble a diagram error, and stops when the deck moved on", async () => {
		const { checkDiagrams } = await import('./mermaid-parse');
		withHost({ kinds: ['mermaid'], draw: async () => { throw Object.assign(new Error('the drawing is past the 8000000 limit'), { drawRefused: true }); } });
		expect(await checkDiagrams([diagram(1, 'graph TD\n A')])).toBeNull();
		const jobs: unknown[] = [];
		withHost({ kinds: ['mermaid'], draw: async (job: unknown) => {
			jobs.push(job);
			return '{}';
		} });
		expect(await checkDiagrams([diagram(1, 'graph TD\n A')], '', () => true)).toBeNull();
		expect(jobs).toHaveLength(0);
	});

	it('returns [] only when every diagram drew', async () => {
		withHost({ kinds: ['mermaid'], draw: async () => '{}' });
		const { checkDiagrams } = await import('./mermaid-parse');
		expect(await checkDiagrams([diagram(1, 'graph TD\n A')])).toEqual([]);
	});

	it('gives no answer (null), not a verdict, when the host or the frame cannot answer', async () => {
		const { checkDiagrams } = await import('./mermaid-parse');
		withHost({ kinds: [], draw: async () => '{}' });
		expect(await checkDiagrams([diagram(1, 'graph TD\n A')])).toBeNull();
		withHost({ kinds: ['mermaid'], draw: async () => { throw new Error('the mermaid draw did not finish within 30000 ms'); } });
		expect(await checkDiagrams([diagram(1, 'graph TD\n A')])).toBeNull();
		withHost({ kinds: ['mermaid'], draw: async () => '{}' });
		expect(await checkDiagrams([])).toBeNull();
	});
});
