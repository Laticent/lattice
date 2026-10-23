// The previews' draw host names no plugin (docs/src/lib/preview-draw-host-impl.ts). The kinds it draws and each plugin's host-page half come from
// the files the registry build writes (lib/plugins/draw-kinds.generated.mjs, draw-host-adapters.generated.mjs), so a third plugin that declares
// `draw` is drawn with no edit here. This test gives the host two made-up kinds, one with a host half and one with none, and checks what runs.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = `${window.location.origin}/playground/v/abc123def456/`;
const sent: Array<Record<string, unknown>> = [];
let answer = '';

vi.mock('../../../lib/plugins/draw-kinds.generated.mjs', () => ({ DRAW_KINDS: ['sparkline', 'bare'] }));
vi.mock('../../../lib/plugins/draw-host-adapters.generated.mjs', () => ({
	DRAW_HOST_ADAPTERS: {
		sparkline: async () => ({
			prepare: (job: Record<string, unknown>, env: { fonts: (asks: unknown) => unknown[] }) => ({ ...job, prepared: true, fonts: env.fonts(job.fonts) }),
			finish: (raw: string, env: { sanitize: { slide: (s: string) => string; diagram: (s: string) => string } }) => `finished:${env.sanitize.slide(raw)}|${typeof env.sanitize.diagram}`,
		}),
	},
}));
vi.mock('./code-packages/draw-host', () => ({
	createDrawHost: () => ({
		draw: async (job: Record<string, unknown>) => {
			sent.push(job);
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

const woff2 = (n: number) => `data:font/woff2;base64,${'A'.repeat(n)}`;

describe("the previews' draw host: any plugin", () => {
	beforeEach(() => {
		vi.resetModules();
		sent.length = 0;
		answer = '<svg><script>alert(1)</script><rect/></svg>';
	});

	it("runs a kind's own prepare and finish, and hands both the host's sanitizers", async () => {
		const { draw } = await import('./preview-draw-host-impl');
		const out = await draw({ kind: 'sparkline', values: [1, 2] });
		expect(sent[0]).toMatchObject({ kind: 'sparkline', values: [1, 2], prepared: true });
		expect(out.startsWith('finished:')).toBe(true);
		expect(out).not.toMatch(/<script/i);
		expect(out.endsWith('|function')).toBe(true);
	});

	it('gives a kind with no host half the safe default: its answer is markup and goes through the slide sanitizer', async () => {
		const { draw } = await import('./preview-draw-host-impl');
		const out = await draw({ kind: 'bare', n: 1 });
		expect(sent[0]).toEqual({ kind: 'bare', n: 1 });
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('<rect');
	});

	it('refuses a kind the registry does not list, and remembers a drawing by its job', async () => {
		const { draw } = await import('./preview-draw-host-impl');
		await expect(draw({ kind: 'math' })).rejects.toThrow(/does not draw math/);
		await draw({ kind: 'bare', n: 2 });
		await draw({ kind: 'bare', n: 2 });
		expect(sent.length).toBe(1);
	});

	it("keeps a deck's own embedded font, and only a well-formed, small one", async () => {
		const { draw } = await import('./preview-draw-host-impl');
		const face = (url: string, family = 'Brand Sans') => ({ family, weight: '400', style: 'normal', url });
		await draw({
			kind: 'sparkline',
			values: [1],
			fonts: [
				face(woff2(2000)),
				face('data:text/html;base64,AAAA', 'Bad Type'),
				face('data:font/woff2;base64,AA AA', 'Bad Chars'),
				face(woff2(800_000), 'Too Big'),
				face(`${BASE}themes/fonts/outfit-400.woff2`, 'Outfit'),
				face('https://evil.example/f.woff2', 'Remote'),
				face(`${BASE}themes/fonts/../x.woff2`, 'Dots'),
			],
		});
		const fonts = sent[0].fonts as Array<Record<string, string>>;
		expect(fonts.map((f) => f.family).sort()).toEqual(['Brand Sans', 'Outfit']);
		expect(fonts.find((f) => f.family === 'Brand Sans')?.data).toBe(woff2(2000));
		expect(fonts.find((f) => f.family === 'Outfit')?.url).toBe(`${BASE}themes/fonts/outfit-400.woff2`);
	});

	it('caps how many embedded faces and how many characters one job may carry', async () => {
		const { draw } = await import('./preview-draw-host-impl');
		const many = Array.from({ length: 12 }, (_, i) => ({ family: `F${i}`, weight: '400', style: 'normal', url: woff2(1000) }));
		await draw({ kind: 'sparkline', values: [1], fonts: many });
		expect((sent[0].fonts as unknown[]).length).toBe(8);
		sent.length = 0;
		const big = Array.from({ length: 4 }, (_, i) => ({ family: `G${i}`, weight: '400', style: 'normal', url: woff2(690_000) }));
		await draw({ kind: 'sparkline', values: [2], fonts: big });
		expect((sent[0].fonts as unknown[]).length).toBe(2);
	});
});
