// The previews' draw host (docs/src/lib/preview-draw-host.ts): installed once and not replaceable, it answers a draw only
// with markup the slide sanitizer has approved (the runtime has no sanitizer, so this is the guard behind the
// SANCTIONED_RUNTIME_MARKUP_SINKS entry for function-plot.hydrate.js), and refuses a kind it does not draw yet.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOSTILE = '<svg class="function-plot" onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/><foreignObject><img src=x onerror=alert(3)></foreignObject></svg>';

const calls = { draw: 0, warm: 0, last: [] as unknown[] };
vi.mock('./code-packages/draw-host', () => ({
	createDrawHost: () => ({
		draw: async (job: unknown) => {
			calls.draw++;
			calls.last.push(job);
			return HOSTILE;
		},
		warm: async () => {
			calls.warm++;
		},
		close() {},
	}),
}));

describe('the previews\' draw host', () => {
	// A window of its own per test: the name is installed non-configurable, so one shared window would carry it forward.
	let win: Window;
	beforeEach(() => {
		vi.resetModules();
		win = {} as Window;
		calls.draw = 0;
		calls.warm = 0;
		calls.last = [];
	});

	it('installs once, as a name a page cannot overwrite', async () => {
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		const first = win.__latticeDrawHost;
		expect(typeof first?.draw).toBe('function');
		installPreviewDrawHost(win);
		expect(win.__latticeDrawHost).toBe(first);
		expect(() => {
			
			(win as unknown as Record<string, unknown>).__latticeDrawHost = { draw: async () => '<img src=x onerror=alert(1)>' };
		}).toThrow();
		expect(win.__latticeDrawHost).toBe(first);
	});

	it('does not replace a host something else defined first', async () => {
		const mine = { draw: async () => 'x' };
		Object.defineProperty(win, '__latticeDrawHost', { value: mine, configurable: true });
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		expect(win.__latticeDrawHost).toBe(mine);
	});

	it('a plot\'s drawing is sanitized before the runtime sees it', async () => {
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		const out = await (win.__latticeDrawHost as { draw: (j: object) => Promise<string> }).draw({ kind: 'function-plot', configB64: '', configText: '{}', width: 600, height: 300, index: 0 });
		expect(out).not.toMatch(/onload|onclick|onerror|<script|alert/);
		expect(out).toMatch(/<svg class="function-plot"/);
	});

	const JOB = { kind: 'function-plot', configB64: 'e30=', configText: '{}', width: 600, height: 300, index: 0 };
	const draw = (w: Window, job: object) => (w.__latticeDrawHost as { draw: (j: object) => Promise<string> }).draw(job);

	it('remembers a drawing by its whole job: the same plot again costs no second draw, a changed one does', async () => {
		vi.resetModules();
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		const a = await draw(win, JOB);
		const b = await draw(win, { ...JOB });
		expect(b).toBe(a);
		expect(calls.draw).toBe(1);
		await draw(win, { ...JOB, configText: '{"data":[]}' });
		await draw(win, { ...JOB, index: 1 });
		await draw(win, { ...JOB, width: 601 });
		expect(calls.draw).toBe(4);
	});

	it('two asks for one plot at the same moment share one draw', async () => {
		vi.resetModules();
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		const [a, b] = await Promise.all([draw(win, JOB), draw(win, JOB)]);
		expect(a).toBe(b);
		expect(calls.draw).toBe(1);
	});

	it('warms the kind\'s frame ahead of a draw, and ignores a kind it does not draw', async () => {
		vi.resetModules();
		const { installPreviewDrawHost, warmPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		warmPreviewDrawHost('function-plot', win);
		warmPreviewDrawHost('math', win);
		await new Promise((r) => setTimeout(r, 50));
		expect(calls.warm).toBe(1);
		// No host on the page (an export, or a surface that offers none): warming does nothing and throws nothing.
		expect(() => warmPreviewDrawHost('function-plot', {} as Window)).not.toThrow();
	});

	it('refuses a kind it does not draw yet', async () => {
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		await expect((win.__latticeDrawHost as { draw: (j: object) => Promise<string> }).draw({ kind: 'math' })).rejects.toThrow(/does not draw math yet/);
	});
});
