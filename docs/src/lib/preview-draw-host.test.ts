// The previews' draw host (docs/src/lib/preview-draw-host.ts): installed once and not replaceable, it answers a draw only
// with markup the slide sanitizer has approved (the runtime has no sanitizer, so this is the guard behind the
// SANCTIONED_RUNTIME_MARKUP_SINKS entry for function-plot.hydrate.js), and refuses a kind it does not draw yet.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const HOSTILE = '<svg class="function-plot" onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/><foreignObject><img src=x onerror=alert(3)></foreignObject></svg>';

vi.mock('./code-packages/draw-host', () => ({ createDrawHost: () => ({ draw: async () => HOSTILE, close() {} }) }));

describe('the previews\' draw host', () => {
	// A window of its own per test: the name is installed non-configurable, so one shared window would carry it forward.
	let win: Window;
	beforeEach(() => {
		vi.resetModules();
		win = {} as Window;
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

	it('refuses a kind it does not draw yet', async () => {
		const { installPreviewDrawHost } = await import('./preview-draw-host');
		installPreviewDrawHost(win);
		await expect((win.__latticeDrawHost as { draw: (j: object) => Promise<string> }).draw({ kind: 'mermaid' })).rejects.toThrow(/does not draw mermaid yet/);
	});
});
