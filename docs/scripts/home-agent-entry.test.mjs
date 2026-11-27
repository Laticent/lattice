import { describe, expect, it } from 'vitest';
import { homeAgentEntryProblems } from './home-agent-entry.mjs';

describe('homeAgentEntryProblems', () => {
	const BUILT = new Set(['agents/start.md', 'llms.txt']);
	const exists = (p) => BUILT.has(p);
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
		expect(homeAgentEntryProblems(page, (p) => p !== 'agents/start.md')).toEqual([
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
