import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewCspMeta } from './preview-csp.js';

// The live preview names the site's own origin for fonts, because Firefox does not read a `srcdoc` frame's `'self'` as
// that origin and refused every self-hosted face (engineering/decisions/2026-11-01-icon-font.md). The newcomer bake runs
// in jsdom at build time, where `location` is a stand-in no visitor shares, so the baked document names none.
describe('previewCspMeta font origin', () => {
	afterEach(() => vi.restoreAllMocks());

	it('names this page\'s origin in font-src for a real browser', () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0');
		const meta = previewCspMeta();
		expect(meta).toContain(`font-src 'self' data: ${location.origin}`);
	});

	it('names no origin in the build\'s jsdom bake', () => {
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0');
		expect(previewCspMeta()).toMatch(/font-src 'self' data:;/);
	});
});
