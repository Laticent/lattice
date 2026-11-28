// `data-lattice-gate`: the step a render is waiting on, on its host (followups.d/3368-p1). An iPad first render
// stalled after the engine loaded with no frame, no sample and no alert, and nothing said which await it stopped at.
// The iOS panes probe reads this attribute; these tests pin that a stalled step is the one it names, and that a render
// that finishes says so.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each hold is a door: `shut` makes the next call wait until `open()`, and `reached` resolves when a call is waiting.
const hold = vi.hoisted(() => {
	const door = () => {
		const d = { shut: false, reached: null as null | (() => void), open: () => {}, wait: Promise.resolve(), arrived: Promise.resolve() };
		d.arrived = new Promise<void>((r) => (d.reached = r));
		d.wait = new Promise<void>((r) => (d.open = r));
		return d;
	};
	return { door, theme: door(), engine: door(), engineThrows: false };
});
const pass = async (d: typeof hold.theme) => {
	if (!d.shut) return;
	d.reached?.();
	await d.wait;
};

vi.mock('../lib/render-engine', () => ({
	renderMarkdown: vi.fn(async () => {
		await pass(hold.engine);
		if (hold.engineThrows) throw new Error('bad markdown');
		return { html: '<div class="lattice"><section><h1>Hi</h1></section></div>', css: '.x{}', width: 1280, height: 720 };
	}),
}));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({
		ensure: () => pass(hold.theme),
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
	hold.theme = hold.door();
	hold.engine = hold.door();
	hold.engineThrows = false;
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
const gate = (host: HTMLElement) => STEPS[Number(host.getAttribute('data-lattice-gate') ?? -1)];

describe('data-lattice-gate', () => {
	it('every step the renderer writes has a name in the probe', () => {
		const src = readFileSync(join(here, 'single-slide-render.ts'), 'utf8');
		const codes = [...src.matchAll(/markGate\(([^;]*)\);/g)].flatMap((m) => [...m[1].matchAll(/\b\d+\b/g)].map((d) => Number(d[0])));
		expect([...new Set(codes)].sort((x, y) => x - y)).toEqual(STEPS.map((_, i) => i));
	});

	it('reads "done" once a render writes its frame', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		const out = await render(host, r);
		expect(out.ok).toBe(true);
		expect(gate(host)).toBe('done');
		expect(host.getAttribute('data-lattice-gate')).toBe('6');
		r.dispose();
	});

	it.each([
		['theme', 'theme'],
		['engine', 'engine render'],
	] as const)('names the step a render is stuck on: while the %s does not answer it reads "%s", and done once it does', async (what, step) => {
		hold[what].shut = true;
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		const out = render(host, r);
		// The held call is waiting, so the render is stuck inside it: that is the signal, not a duration.
		await hold[what].arrived;
		expect(gate(host)).toBe(step);
		hold[what].open();
		expect((await out).ok).toBe(true);
		expect(gate(host)).toBe('done');
		r.dispose();
	});

	it('reads "failed" when the engine throws, not "stood down"', async () => {
		hold.engineThrows = true;
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		expect((await render(host, r)).ok).toBe(false);
		expect(gate(host)).toBe('failed');
		r.dispose();
	});

	it('an older render that settles late does not overwrite a newer one\'s step', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = document.body.appendChild(document.createElement('figure'));
		hold.engine.shut = true;
		const older = render(host, r);
		await hold.engine.arrived;
		// The newer render waits on the theme; the older one is still in the engine.
		hold.theme.shut = true;
		const newer = render(host, r);
		await hold.theme.arrived;
		hold.engine.open();
		// The older render writes its frame and waits for it to load; jsdom loads nothing, so the test fires it.
		const fr = await vi.waitFor(() => {
			const f = host.querySelector('iframe');
			if (!f) throw new Error('no frame yet');
			return f;
		});
		fr.onload?.(new Event('load'));
		await older;
		expect(gate(host)).toBe('theme');
		hold.theme.open();
		await newer;
		r.dispose();
	});
});
