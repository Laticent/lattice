// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Nacre loader is drawn with gradients only. Chrome counts a `background-image: url(...)` that covers a box as a
// largest-contentful-paint candidate, and the app builds its own loader when React mounts, so an image here made THAT
// element the page's LCP at the island's mount time: 13.7 s on the Lighthouse mobile profile, against 4.2-5.0 s once the
// image was gone. The grain used to be a data-URI noise tile; it is a gradient now (engineering/decisions/2026-10-23-startup-bake-off.md E6).
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'nacre-loader.css'), 'utf8');

describe('nacre-loader.css', () => {
	it('uses no url() image anywhere, so the loader can never be the largest contentful paint', () => {
		const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(withoutComments).not.toMatch(/url\(/);
	});

	it('keeps a grain layer, drawn as a gradient', () => {
		const rule = css.match(/\.nacre-loader::after\s*\{([^}]*)\}/)?.[1] ?? '';
		expect(rule).toMatch(/repeating-conic-gradient/);
	});
});
