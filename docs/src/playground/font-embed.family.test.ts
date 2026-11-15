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

import { buildFamilyFontCss, FACES } from './font-embed.js';

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
});
