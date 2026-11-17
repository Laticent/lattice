import { describe, expect, it } from 'vitest';
import { canonicalUrl, isIndexable, llmsTxt, robotsTxt } from './discovery.mjs';

const SITE = new URL('https://lattice.style');

describe('isIndexable', () => {
	it('keeps docs, catalog hubs and Learn pages', () => {
		for (const p of ['/', '/guides/cli/', '/libraries/', '/libraries/filo/learn/', '/plugins/math/'])
			expect(isIndexable(p), p).toBe(true);
	});
	it('drops library demo shells, prototypes, fixtures, the gift card and the offline page', () => {
		for (const p of ['/libraries/filo/', '/proto/anima/', '/vetrina-tour/', '/gift/', '/offline/'])
			expect(isIndexable(p), p).toBe(false);
	});
});

describe('canonicalUrl', () => {
	it('joins the site and the path, and is absent without a site', () => {
		expect(canonicalUrl(SITE, '/guides/cli/')).toBe('https://lattice.style/guides/cli/');
		expect(canonicalUrl(undefined, '/guides/cli/')).toBeUndefined();
	});
});

describe('robotsTxt', () => {
	it('allows everything and names the sitemap in production', () => {
		const txt = robotsTxt({ site: SITE, index: true });
		expect(txt).toContain('User-agent: *\nAllow: /');
		expect(txt).toContain('Sitemap: https://lattice.style/sitemap-index.xml');
	});
	it('disallows everything on a preview deploy', () => {
		const txt = robotsTxt({ site: SITE, index: false });
		expect(txt).toContain('Disallow: /');
		expect(txt).not.toContain('Sitemap:');
	});
});

describe('llmsTxt', () => {
	it('is a short router with absolute links', () => {
		const txt = llmsTxt({ site: SITE });
		expect(txt.startsWith('# Lattice\n\n> ')).toBe(true);
		expect(txt).toContain('(https://lattice.style/getting-started/)');
		expect(new TextEncoder().encode(txt).length).toBeLessThan(4096);
	});
});
