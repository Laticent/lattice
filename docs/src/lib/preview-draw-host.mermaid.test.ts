// The previews' draw host, Mermaid's half (docs/src/lib/preview-draw-host-impl.ts): what a frame answers is untrusted text,
// so the figure passes the DIAGRAM sanitizer, a gantt link keeps only the schemes a link in a deck may use, and a font face is
// fetched only from the engine's own font directories (a frame has no network; the host is the one that fetches).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = `${window.location.origin}/playground/v/abc123def456/`;
let answer = '';
const jobs: Array<Record<string, unknown>> = [];

vi.mock('./code-packages/draw-host', () => ({
	createDrawHost: () => ({
		draw: async (job: Record<string, unknown>) => {
			jobs.push(job);
			return answer;
		},
		warm: async () => {},
		close() {},
	}),
}));
vi.mock('./engine-base', () => ({
	engineBase: () => BASE,
	sameOriginAsset: (base: string, rel: string) => new URL(rel, new URL(base, window.location.href)),
}));

const figure = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		svg: '<svg id="x"><style>#x .a{fill:red}</style><script>alert(1)</script><g class="node" onclick="x()"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="lbl">Draft</div></foreignObject></g></svg>',
		type: 'gantt',
		links: [
			['d1', 'https://example.com/design'],
			['d2', 'javascript:alert(1)'],
			['d3', 'data:text/html,<script>1</script>'],
			['d4', '/relative/path'],
			['d5', 'mailto:a@b.test'],
		],
		...over,
	});

describe('the previews\' draw host: Mermaid', () => {
	beforeEach(() => {
		vi.resetModules();
		jobs.length = 0;
		answer = figure();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(`font:${url}`).buffer })),
		);
	});

	const impl = () => import('./preview-draw-host-impl');
	const JOB = { kind: 'mermaid', definition: 'gantt\n Design :d1, 2026-01-01, 5d', svgId: 'lattice-mmd-1', config: { theme: 'base' }, stage: 1280, fonts: [] };

	it('sanitizes the figure with the diagram profile: the script and the handler go, the sheet and the label stay', async () => {
		const { draw } = await impl();
		const fig = JSON.parse(await draw(JOB));
		expect(fig.svg).not.toMatch(/<script|onclick|alert/);
		expect(fig.svg).toMatch(/<style>.*fill:red/s);
		expect(fig.svg).toMatch(/<foreignObject/i);
		expect(fig.svg).toMatch(/class="lbl"/);
		expect(fig.type).toBe('gantt');
	});

	it('keeps only the links a deck may use', async () => {
		const { draw } = await impl();
		const fig = JSON.parse(await draw(JOB));
		expect(fig.links.map((l: [string, string]) => l[0])).toEqual(['d1', 'd4', 'd5']);
	});

	it('answers an error from the frame as a rejection, and a draw of another kind is refused', async () => {
		const { draw } = await impl();
		answer = 'not json';
		await expect(draw(JOB)).rejects.toThrow();
		await expect(draw({ kind: 'math', source: 'x' })).rejects.toThrow(/does not draw math/);
	});

	it('fetches a face only from the engine\'s font directories, once, and sends it as a data: URL', async () => {
		const { draw } = await impl();
		const ok = `${BASE}themes/fonts/outfit-400.woff2`;
		const asks = [
			{ family: 'Outfit', weight: '400', style: 'normal', url: ok },
			{ family: 'Evil', weight: '400', style: 'normal', url: 'https://evil.example/fonts/x.woff2' },
			{ family: 'Evil', weight: '400', style: 'normal', url: `${BASE}../../secret/fonts/x.woff2` },
			{ family: 'Evil', weight: '400', style: 'normal', url: `${BASE}themes/fonts/not-a-font.js` },
			{ family: 'Outfit', weight: 'bold', style: 'normal', url: ok },
		];
		await draw({ ...JOB, fonts: asks });
		const sent = (jobs[0].fonts as Array<{ family: string; data: string }>) ?? [];
		expect(sent).toHaveLength(1);
		expect(sent[0].family).toBe('Outfit');
		expect(sent[0].data).toMatch(/^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/);
		expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0])).toEqual([ok]);
		// the same face again is not fetched again
		await draw({ ...JOB, definition: 'gantt\n other :d9, 2026-02-01, 1d', fonts: asks });
		expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
	});

	it('remembers a figure by its whole job, so an edit elsewhere in the deck draws nothing again', async () => {
		const { draw } = await impl();
		await draw(JOB);
		await draw(JOB);
		expect(jobs).toHaveLength(1);
	});
});
