// absolutizeUrls (single-slide-render.ts) resolves each relative url() in the preview's CSS against the page, for the
// blob URL that serves it. It writes the RESOLVED address back where the written one was, so the address must be escaped
// for that place, or a quote or parenthesis in it ends the string or the url early (the maker-checker on #3294 found
// `url('it\'s.png')` turned into a string that closed at `it`). Each case reads the output back through the CSS tokenizer
// (lib/core/css-tokens.mjs, held to css-tree's spec tokenizer) and asks that it still decodes to the resolved address.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('../lib/theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('./font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { cssTokens, cssUrls } from '../../../lib/core/css-tokens.mjs';
import { __absolutizeUrlsForTest as absolutize } from './single-slide-render';

const BASE = 'https://x.test/themes/a/';
const read = (css: string) => cssUrls(css).map((u) => ({ value: u.value, quoted: u.quoted }));

describe('absolutizeUrls', () => {
	it.each([
		['a quoted address with an escaped quote of its own kind', "a{b:url('it\\'s.png')}", "https://x.test/themes/a/it's.png", true],
		['a double-quoted address holding a single quote', 'a{b:url("it\'s.png")}', "https://x.test/themes/a/it's.png", true],
		['an unquoted address with an escaped quote', "a{b:url(it\\'s.png)}", "https://x.test/themes/a/it's.png", false],
		['an unquoted address with an escaped parenthesis', 'a{b:url(f\\(1\\).png)}', 'https://x.test/themes/a/f(1).png', false],
		['a plain relative address', 'a{b:url(fonts/x.woff2)}', 'https://x.test/themes/a/fonts/x.woff2', false],
	])('%s still reads as one url() with the resolved address', (_name, css, href, quoted) => {
		const out = absolutize(css, BASE);
		expect(read(out)).toEqual([{ value: href, quoted }]);
		// And nothing after it was swallowed: the rule still closes where it did.
		expect(cssTokens(out).at(-1)?.type).toBe('}');
	});

	it('leaves absolute, data: and fragment addresses, and a url( inside a comment or a string, as written', () => {
		const css = 'a{b:url(data:image/png;base64,AA==);c:url(#g);d:url(https://y.test/z.png)}/* url(q.png) */e{content:"url(q.png)"}';
		expect(absolutize(css, BASE)).toBe(css);
	});
});
