// The three script loaders take their URL from the page (a data attribute, or the engine's own
// `<script src>`), and CodeQL's js/xss-through-dom follows that text into `script.src` (#1958 §7).
// `scriptSrc` is the guard each one now passes the URL through. These tests pin the guard itself and
// prove each loader injects NOTHING for a URL it refuses: before #1958 §7, all three appended a
// `<script src="javascript:…">` for the first row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engineBase, recordEngineUrl, resetEngineBase, scriptSrc } from './engine-base';
import { __resetHljsLoaderCaches, ensureFenceLanguages } from './ensure-hljs-language';
import { ensureKatexProvider } from './ensure-katex';
import { ensureEngine } from './load-engine';

const REFUSED = [
	'javascript:alert(1)//lattice-playground.js',
	'JavaScript:alert(1)',
	'data:text/javascript,alert(1)',
	'blob:https://example.test/abc',
	'/playground/v/x/"><img src=x onerror=alert(1)>/lattice-playground.js',
	"/playground/v/x'/lattice-playground.js",
	'/playground/v/x /lattice-playground.js',
	'/playground/v/x\\/lattice-playground.js',
	'',
];

afterEach(() => {
	document.head.innerHTML = '';
	window.LatticePlayground = undefined;
	window.__latticeKatexReady = undefined;
	resetEngineBase();
	__resetHljsLoaderCaches();
	vi.unstubAllGlobals();
});

describe('scriptSrc', () => {
	it('passes the URLs a build writes, unchanged', () => {
		for (const url of [
			'/playground/v/abc123/lattice-playground.js',
			'playground/v/abc123/engine.js',
			'https://example.test/playground/v/abc123/hljs/powershell.js',
			'http://localhost:4321/playground/v/abc123/lattice-katex.js?x=1#y',
		]) {
			expect(scriptSrc(url), url).toBe(url);
		}
	});

	it('refuses another scheme, markup characters and whitespace', () => {
		for (const url of REFUSED) expect(scriptSrc(url), url).toBeNull();
	});
});

describe('the loaders inject nothing for a refused URL', () => {
	it('ensureEngine rejects and appends no script', async () => {
		for (const url of REFUSED) {
			await expect(ensureEngine(url), url).rejects.toThrow(/refused/);
			expect(document.querySelectorAll('script').length, url).toBe(0);
		}
	});

	it('ensureEngine records no asset directory from a refused URL', () => {
		recordEngineUrl('javascript:alert(1)//lattice-playground.js');
		expect(engineBase()).toBeNull();
	});

	it('ensureKatexProvider rejects and appends no script', async () => {
		for (const url of REFUSED) {
			await expect(ensureKatexProvider(url), url).rejects.toThrow(/refused/);
			expect(document.querySelectorAll('script').length, url).toBe(0);
		}
	});

	it('the fence-grammar loader leaves the fence plain and appends no script', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ languages: { dockerfile: { file: 'dockerfile.js' } }, aliases: {} }), { status: 200 })),
		);
		window.LatticePlayground = {
			render: (() => ({ html: '', css: '' })) as never,
			addThemes: () => {},
			hasTheme: () => true,
			missingLanguages: () => ['dockerfile'],
			drainLanguages: () => [],
		};
		await expect(ensureFenceLanguages('x', 'javascript:alert(1)//')).resolves.toEqual([]);
		expect(document.querySelectorAll('script').length).toBe(0);
	});
});
