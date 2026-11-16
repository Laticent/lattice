// `buildFamilyFontCss` (font-embed.js): the slide map's posters embed the families a slide draws in, so a capture fetches
// and encodes those faces only, once each, never the whole vendored block (one task of over a second at 4x CPU).
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetched: string[] = [];
const net = vi.hoisted(() => ({ status: 200 }));
vi.stubGlobal(
	'fetch',
	vi.fn(async (url: string) => {
		fetched.push(String(url));
		return { ok: net.status < 400, status: net.status, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
	}),
);
afterEach(() => {
	vi.clearAllMocks();
	net.status = 200;
});

import { buildFamilyFontCss, cssWeightFor, ensureFontsLoaded, FACES, ICON_FACES } from './font-embed.js';

const face = (family: string, weight = 400, style = 'normal') => ({ family, weight, style });

describe('buildFamilyFontCss', () => {
	it('writes rules for the families asked for and fetches only their faces', async () => {
		const css = await buildFamilyFontCss([face('outfit')]);
		expect(css).toContain("font-family:'Outfit'");
		expect(css).not.toContain('Playfair');
		const outfit = FACES.filter((f: { family: string }) => f.family === 'Outfit').length;
		expect(fetched.length).toBeGreaterThan(0);
		expect(fetched.length).toBeLessThanOrEqual(outfit);
	});
	it('encodes a face once a page: asking again fetches nothing', async () => {
		await buildFamilyFontCss([face('outfit')]);
		const before = fetched.length;
		expect(await buildFamilyFontCss([face('outfit')])).toContain("font-family:'Outfit'");
		expect(fetched.length).toBe(before);
	});
	it('adds the icon faces and the emoji slice only when the slide draws them', async () => {
		const plain = await buildFamilyFontCss([face('outfit')], 'Plain words');
		expect(plain).not.toContain('Lattice Icons');
		expect(plain).not.toContain('Noto Color Emoji');
		expect(await buildFamilyFontCss([face('outfit')], 'An icon \uE000')).toContain("font-family:'Lattice Icons'");
		expect(await buildFamilyFontCss([face('outfit')], 'A smile \u{1F600}')).toContain("font-family:'Noto Color Emoji'");
	});
	it('rejects when a face answers with an error, rather than encoding the error page as a font', async () => {
		net.status = 404;
		await expect(buildFamilyFontCss([face('fraunces')])).rejects.toThrow(/HTTP 404/);
	});
	it('embeds the weight a slide draws, not every weight of its family, and the nearest one for a weight not vendored', async () => {
		const css = await buildFamilyFontCss([face('outfit', 400)]);
		expect(css.match(/font-family:'Outfit'/g)).toHaveLength(1);
		expect(css).toContain('font-weight:400');
		const heavy = await buildFamilyFontCss([face('outfit', 800)]);
		expect(heavy).toContain('font-weight:700');
		expect(heavy.match(/font-family:'Outfit'/g)).toHaveLength(1);
	});
	it('breaks a weight tie the way CSS matching does: heavier from 400 up', async () => {
		// Outfit is vendored at 300-700 in steps of 100: 450 sits between 400 and 500, and the browser draws 500.
		const css = await buildFamilyFontCss([face('outfit', 450)]);
		expect(css).toContain('font-weight:500');
		expect(css).not.toContain('font-weight:400');
	});
	// Each of these loads the module afresh: its caches live as long as the page, so a face an earlier test cached as a
	// success would answer from the cache instead of the network under test.
	const fresh = async () => {
		vi.resetModules();
		return import('./font-embed.js');
	};
	it('refuses an icon or emoji face that answers with an error, as it does a text face', async () => {
		const m = await fresh();
		net.status = 404;
		await expect(m.buildFamilyFontCss([], 'An icon \uE000')).rejects.toThrow(/HTTP 404/);
		await expect(m.buildFamilyFontCss([], 'A smile \u{1F600}')).rejects.toThrow(/HTTP 404/);
	});
	it('forgets a failed face, so the next capture asks again and gets it', async () => {
		const m = await fresh();
		net.status = 503;
		await expect(m.buildFamilyFontCss([], 'A smile \u{1F92A}')).rejects.toThrow(/HTTP 503/);
		net.status = 200;
		expect(await m.buildFamilyFontCss([], 'A smile \u{1F92A}')).toContain("font-family:'Noto Color Emoji'");
	});
	it('leaves the export\'s own caches alone: a poster\'s failure does not fail an export', async () => {
		const m = await fresh();
		net.status = 503;
		await expect(m.buildFamilyFontCss([], 'Party \u{1F389}')).rejects.toThrow();
		net.status = 200;
		expect(await m.buildFontEmbedCss('Party \u{1F389}')).toContain("font-family:'Noto Color Emoji'");
	});
	it('picks the weight CSS font matching draws, not the nearest one (CSS Fonts 4 §5.2)', () => {
		expect(cssWeightFor(500, [400, 600])).toBe(400); // 400..500: up to 500 first, then lighter, then heavier
		expect(cssWeightFor(450, [300, 400, 500, 600, 700])).toBe(500);
		expect(cssWeightFor(520, [400, 700])).toBe(700); // above 500: heavier first
		expect(cssWeightFor(300, [400, 700])).toBe(400); // below 400: lighter first, then heavier
		expect(cssWeightFor(350, [300, 400])).toBe(300);
		expect(cssWeightFor(700, [400, 600])).toBe(600);
	});
	it('embeds the Barlow Condensed face the browser draws at 500: the 400, not the nearer-looking 600', async () => {
		const css = await buildFamilyFontCss([face('barlow condensed', 500)]);
		expect(css).toContain('font-weight:400');
		expect(css).not.toContain('font-weight:600');
	});
});

// `ensureFontsLoaded` waits for the faces it is given: every vendored face by default (each export), or only the faces
// one slide draws (deck-export.js `rasterizeSlidePreview`, the chat's `render_slide` look), so a face the slide never
// uses is never asked for. A `load` call for a face is what fetches it.
describe('ensureFontsLoaded', () => {
	const fakeDoc = () => {
		const loads: string[] = [];
		const doc = {
			getElementById: () => null,
			createElement: () => ({ id: '', textContent: '' }),
			head: { appendChild: () => {} },
			fonts: { load: async (spec: string) => void loads.push(spec), ready: Promise.resolve() },
		};
		return { doc: doc as unknown as Document, loads };
	};
	it('loads every vendored face when no list is given, as every export does', async () => {
		const { doc, loads } = fakeDoc();
		await ensureFontsLoaded(doc, '');
		expect(loads.length).toBe(FACES.length + ICON_FACES.length);
	});
	it('loads only the faces it is given', async () => {
		const { doc, loads } = fakeDoc();
		await ensureFontsLoaded(doc, '', [face('outfit', 700)]);
		expect(loads).toEqual(["normal 700 1em 'outfit'"]);
	});
});
