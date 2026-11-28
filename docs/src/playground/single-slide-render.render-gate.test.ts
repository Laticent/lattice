// `data-lattice-render-gate`: the step a render is waiting on, on its host (followups.d/3368-p1). An iPad first render
// stalled after the engine loaded with no frame, no sample and no alert, and nothing said which await it stopped at.
// The iOS panes probe reads this attribute; these tests pin that a stalled step is the one it names, and that a render
// that finishes says so.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hold = vi.hoisted(() => ({ theme: false, engine: false }));
const never = () => new Promise<never>(() => {});

vi.mock('../lib/render-engine', () => ({
	renderMarkdown: vi.fn(async () => {
		if (hold.engine) await never();
		return { html: '<div class="lattice"><section><h1>Hi</h1></section></div>', css: '.x{}', width: 1280, height: 720 };
	}),
}));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({
		ensure: async () => {
			if (hold.theme) await never();
		},
		ensureBase: async () => {},
		ensureKatexFaces: async () => {},
		katexFacesActive: () => false,
		fetch: async () => {},
	}),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js', scaleImages: true, liveLayout: true };
const DECK = '# One\n\n---\n\n# Two';
const stopFrameLoad = (e: Event) => {
	if (e.target instanceof HTMLIFrameElement) e.stopImmediatePropagation();
};

beforeEach(() => {
	hold.theme = false;
	hold.engine = false;
	document.addEventListener('load', stopFrameLoad, true);
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	};
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	document.documentElement.setAttribute('data-palette', 'cuoio');
	document.documentElement.setAttribute('data-mode', 'light');
	clearDeckMemo();
	clearSliceCache();
});
afterEach(() => {
	document.removeEventListener('load', stopFrameLoad, true);
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
	document.body.innerHTML = '';
});

const render = (host: HTMLElement, r: ReturnType<typeof createSingleSlideRenderer>) =>
	r.renderInto(host, DECK, false, undefined, undefined, undefined, undefined, { slideIndex: 0, slideCount: 2, slideMarkdown: '# One', deckId: 'd' });
// The renderer writes the step as a number; the probe names it from its own list, read here from the probe itself, so
// a step added to the renderer without its name in the probe fails this file.
const here = dirname(fileURLToPath(import.meta.url));
const PROBE = readFileSync(join(here, '..', '..', 'scripts', 'ios-safari', 'panes-probe.js'), 'utf8');
const STEPS: string[] = JSON.parse((/const RENDER_GATE_STEPS = (\[[^\]]*\]);/.exec(PROBE)?.[1] ?? '[]').replaceAll("'", '"'));
const gate = (host: HTMLElement) => STEPS[Number(host.getAttribute('data-lattice-render-gate') ?? -1)];

describe('data-lattice-render-gate', () => {
	it('every step the renderer writes has a name in the probe', () => {
		const src = readFileSync(join(here, 'single-slide-render.ts'), 'utf8');
		const codes = [...src.matchAll(/markGate\((?:r\.ok \? )?(\d+)(?: : (\d+))?\)/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number);
		expect([...new Set(codes)].sort((x, y) => x - y)).toEqual(STEPS.map((_, i) => i));
	});

	it('reads "done" once a render writes its frame', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		const out = await render(host, r);
		expect(out.ok).toBe(true);
		expect(gate(host)).toBe('done');
		expect(host.getAttribute('data-lattice-render-gate')).toBe('6');
		r.dispose();
	});

	it.each([
		['theme', 'theme'],
		['engine', 'engine render'],
	] as const)('names the step a render is stuck on: when the %s never answers it reads "%s"', async (what, step) => {
		hold[what] = true;
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		void render(host, r);
		await vi.waitFor(() => expect(gate(host)).toBe(step));
		r.dispose();
	});
});
