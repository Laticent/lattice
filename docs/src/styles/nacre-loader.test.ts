// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Nacre loader's grain is a gradient, in BOTH places the loader's CSS lives: the island's stylesheet and the
// pre-paint shell's inline copy in studio.astro. Chrome counts a `background-image` that loads an image and covers a box as a
// largest-contentful-paint candidate; the app builds its own loader at mount, so an image here made THAT element the page's
// LCP at the island's mount time (13.7 s on the Lighthouse mobile profile, against 4-5 s without it). A first fix changed
// only the stylesheet and missed the shell's copy, which the shipped page still painted: this file reads both.
// The behavior itself is pinned in docs/e2e/studio-lcp.spec.ts (the real LCP entry on the real page).
const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, 'nacre-loader.css'), 'utf8');
const page = readFileSync(join(here, '..', 'pages', 'studio.astro'), 'utf8');

// The whole shell copy: every rule in the `SHELL_NACRE_CSS` template literal, not only the first ::after.
const shellCss = page.match(/const SHELL_NACRE_CSS = `([^`]*)`/)?.[1] ?? '';
const IMAGE_LOADERS = /url\(|image-set\(|-webkit-image-set\(/i;

const sheetRule = sheet.match(/\.nacre-loader::after\s*\{([^}]*)\}/)?.[1] ?? '';
const shellRule = page.match(/#studio-ssr-shell \.nacre-loader::after\{([^}]*)\}/)?.[1] ?? '';
// Whitespace-insensitive: the shell copy is minified, the stylesheet is not.
const decl = (rule: string, prop: string) => rule.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',');

describe('the loader grain', () => {
	it('finds both rules', () => {
		expect(sheetRule, 'nacre-loader.css has no .nacre-loader::after rule').not.toBe('');
		expect(shellRule, "studio.astro's shell copy has no #studio-ssr-shell .nacre-loader::after rule").not.toBe('');
	});

	for (const [where, rule] of [
		['the stylesheet', sheetRule],
		["the pre-paint shell's copy", shellRule],
	] as const) {
		it(`${where} paints it with a gradient, never an image`, () => {
			const bg = decl(rule, 'background-image') ?? '';
			expect(bg, 'no background-image declared').not.toBe('');
			expect(bg).toMatch(/^(repeating-)?(conic|linear|radial)-gradient\(/);
			expect(rule).not.toMatch(IMAGE_LOADERS);
		});
	}

	it('the two copies agree on opacity, pattern and size', () => {
		for (const prop of ['opacity', 'background-image', 'background-size']) {
			expect(decl(shellRule, prop), `${prop} drifted between nacre-loader.css and the shell copy`).toBe(decl(sheetRule, prop));
		}
	});

	it('no rule in the stylesheet loads an image (any case)', () => {
		expect(sheet.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(IMAGE_LOADERS);
	});

	it("no rule in the shell's inline copy loads an image (any case, any rule)", () => {
		expect(shellCss, 'SHELL_NACRE_CSS not found in studio.astro').not.toBe('');
		expect(shellCss).not.toMatch(IMAGE_LOADERS);
	});
});
