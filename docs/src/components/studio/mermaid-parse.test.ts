// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

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
