import { describe, expect, it } from 'vitest';
import { canonicalUrl, DESCRIBEDBY_TAG, isIndexable, llmsTxt, robotsTxt, twinPath, withDescribedBy } from './discovery.mjs';

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
		// Search engines are kept off the Markdown copies; every other crawler is not.
		expect(txt).toMatch(/User-agent: Googlebot\nUser-agent: Bingbot\nAllow: \/\nDisallow: \/\*\.md\$/);
		expect(txt).toContain('Allow: /playground/v/');
		expect(txt.split('User-agent: Googlebot')[0]).not.toContain('Disallow');
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
		// Article pages link their Markdown copy; a page with no copy links the page.
		expect(txt).toContain('(https://lattice.style/getting-started.md)');
		expect(txt).toContain('(https://lattice.style/components.md)');
		expect(txt).toContain('(https://lattice.style/features/)');
		expect(new TextEncoder().encode(txt).length).toBeLessThan(4096);
	});
	it('routes an agent to start.md, then layouts.md, and names the engine version it describes', () => {
		const txt = llmsTxt({ site: SITE, version: '9.8.7' });
		expect(txt).toContain('The agent pack below describes engine 9.8.7.');
		expect(txt).toContain('(https://lattice.style/agents/start.md)');
		expect(txt).toContain('(https://lattice.style/agents/layouts.md)');
		expect(txt).toContain('`<!-- @meta{layout=NAME} -->`');
		expect(llmsTxt({ site: SITE })).not.toContain('describes engine');
	});
});

describe('twinPath', () => {
	it('puts a page\'s Markdown copy at its path plus .md, and keeps the portal file for /components/', () => {
		expect(twinPath('/guides/cli/')).toBe('/guides/cli.md');
		expect(twinPath('/')).toBe('/index.md');
		expect(twinPath('/components/')).toBe('/components.md');
	});
});

describe('withDescribedBy', () => {
	it('adds the llms.txt describedby tag at the end of <head>, once', () => {
		const once = withDescribedBy('<html><head><title>x</title></head><body></body></html>');
		expect(once).toBe(`<html><head><title>x</title>${DESCRIBEDBY_TAG}</head><body></body></html>`);
		expect(withDescribedBy(once)).toBe(once);
	});
	it('leaves a document with no </head> alone', () => {
		expect(withDescribedBy('<p>fragment</p>')).toBe('<p>fragment</p>');
	});
	it('writes the tag homeAgentEntryProblems looks for', () => {
		expect(DESCRIBEDBY_TAG).toBe('<link rel="describedby" type="text/plain" href="/llms.txt">');
	});
});
