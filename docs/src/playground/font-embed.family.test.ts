// `buildFamilyFontCss` (font-embed.js): the slide map's posters embed the families a slide draws in, so a capture fetches
// and encodes those faces only, once each, never the whole vendored block (one task of over a second at 4x CPU).
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetched: string[] = [];
vi.stubGlobal(
	'fetch',
	vi.fn(async (url: string) => {
		fetched.push(String(url));
		return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
	}),
);
afterEach(() => vi.clearAllMocks());

import { buildFamilyFontCss, FACES } from './font-embed.js';

describe('buildFamilyFontCss', () => {
	it('writes rules for the families asked for and fetches only their faces', async () => {
		const css = await buildFamilyFontCss(['outfit']);
		expect(css).toContain("font-family:'Outfit'");
		expect(css).not.toContain('Playfair');
		const outfit = FACES.filter((f: { family: string }) => f.family === 'Outfit').length;
		expect(fetched.length).toBeGreaterThan(0);
		expect(fetched.length).toBeLessThanOrEqual(outfit);
	});
	it('encodes a face once a page: asking again fetches nothing', async () => {
		await buildFamilyFontCss(['outfit']);
		const before = fetched.length;
		expect(await buildFamilyFontCss(['outfit'])).toContain("font-family:'Outfit'");
		expect(fetched.length).toBe(before);
	});
});
