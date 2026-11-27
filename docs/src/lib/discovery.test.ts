import { describe, expect, it } from 'vitest';
import { canonicalUrl, homeAgentEntryProblems, isIndexable, llmsTxt, robotsTxt, twinPath } from './discovery.mjs';

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
});

describe('twinPath', () => {
	it('puts a page\'s Markdown copy at its path plus .md, and keeps the portal file for /components/', () => {
		expect(twinPath('/guides/cli/')).toBe('/guides/cli.md');
		expect(twinPath('/')).toBe('/index.md');
		expect(twinPath('/components/')).toBe('/components.md');
	});
});

describe('homeAgentEntryProblems', () => {
	const BUILT = new Set(['agents/start.md', 'llms.txt']);
	const exists = (p: string) => BUILT.has(p);
	const page = [
		'<head><link rel="describedby" type="text/plain" href="/llms.txt" title="x">',
		'<link rel="help" type="text/markdown" href="/agents/start.md" title="y"></head>',
		'<body><a class="c" href="/agents/start.md" data-agent-entry="">Instructions</a></body>',
	].join('');
	it('passes a homepage that carries the anchor and both head links', () => {
		expect(homeAgentEntryProblems(page, exists)).toEqual([]);
	});
	it('accepts hrefs that carry a base path in front', () => {
		expect(homeAgentEntryProblems(page.replaceAll('href="/', 'href="/pr-9/'), exists)).toEqual([]);
	});
	it('fails when the visible anchor is gone', () => {
		expect(homeAgentEntryProblems(page.replace(' data-agent-entry=""', ''), exists)).toEqual([
			'expected one <a data-agent-entry> to /agents/start.md, found 0',
		]);
	});
	it('fails when the anchor points somewhere else', () => {
		expect(homeAgentEntryProblems(page.replace('href="/agents/start.md" data', 'href="/features/" data'), exists)[0]).toMatch(/points at \/features\//);
	});
	it('fails when a head link is gone or has the wrong type', () => {
		expect(homeAgentEntryProblems(page.replace(/<link rel="describedby"[^>]*>/, ''), exists)).toEqual([
			'expected one <link rel="describedby" href="…/llms.txt">, found 0',
		]);
		expect(homeAgentEntryProblems(page.replace('type="text/markdown"', 'type="text/html"'), exists)).toEqual([
			'<link rel="help"> has type text/html, want text/markdown',
		]);
	});
	it('fails when a target was not built', () => {
		expect(homeAgentEntryProblems(page, (p: string) => p !== 'agents/start.md')).toEqual([
			'/agents/start.md is linked from the homepage but was not built',
		]);
	});
	it('reads single-quoted, unquoted and multi-word attributes', () => {
		const loose = page
			.replace('href="/agents/start.md" data', "href='/agents/start.md' data")
			.replace('rel="describedby" type="text/plain"', 'rel="describedby author" type=text/plain')
			.replace('rel="help"', 'REL="Help"');
		expect(homeAgentEntryProblems(loose, exists)).toEqual([]);
	});
	it('ignores tags a browser would not act on', () => {
		const inert = page.replace(/(<link rel="help"[^>]*>)/, '<!-- $1 -->').replace(/(<a [^>]*>Instructions<\/a>)/, '<template>$1</template>');
		expect(homeAgentEntryProblems(inert, exists)).toEqual([
			'expected one <a data-agent-entry> to /agents/start.md, found 0',
			'expected one <link rel="help" href="…/agents/start.md">, found 0',
		]);
	});
	it('does not accept another origin that happens to end in the same path', () => {
		expect(homeAgentEntryProblems(page.replace('href="/llms.txt"', 'href="https://elsewhere.example/llms.txt"'), exists)).toEqual([
			'expected one <link rel="describedby" href="…/llms.txt">, found 0',
		]);
	});
});
