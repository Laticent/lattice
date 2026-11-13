// The three script loaders take their URL from the page (a data attribute, or the engine's own
// `<script src>`), and CodeQL's js/xss-through-dom follows that text into `script.src` (#1958 §7).
// Each loader now carries the barrier inline at the sink: a URL with a markup character or
// whitespace, an empty one, or one off this page's origin or scheme is refused. These tests prove each
// loader injects NOTHING for a refused URL: before #1958 §7, all three appended a
// `<script src="javascript:…">` for the first row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordEngineUrl, resetEngineBase } from './engine-base';
import { __resetHljsLoaderCaches, ensureFenceLanguages } from './ensure-hljs-language';
import { ensureKatexProvider } from './ensure-katex';
import { ensureEngine } from './load-engine';
import { injectPrefetch } from './prefetch-engine';

const REFUSED = [
	'javascript:alert(1)//lattice-playground.js',
	'JavaScript:alert(1)',
	'data:text/javascript,alert(1)',
	'blob:https://example.test/abc',
	// Same origin as the test page (http://localhost:3000), so only the scheme check refuses it.
	'blob:http://localhost:3000/abc',
	// Same scheme as the test page, another origin, so only the origin check refuses it.
	'http://evil.test/playground/v/x/lattice-playground.js',
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

describe('the loaders inject nothing for a refused URL', () => {
	it('ensureEngine rejects and appends no script', async () => {
		for (const url of REFUSED) {
			await expect(ensureEngine(url), url).rejects.toThrow(/refused/);
			expect(document.querySelectorAll('script').length, url).toBe(0);
		}
	});

	it('a refused engine URL that gets recorded still loads nothing', async () => {
		// recordEngineUrl only notes the asset directory; the loaders that read it guard at their own sink.
		recordEngineUrl('javascript:alert(1)//lattice-playground.js');
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
		await expect(ensureFenceLanguages('x')).resolves.toEqual([]);
		expect(document.querySelectorAll('script').length).toBe(0);
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
		// The first base fails the scheme check; the second shares the page's scheme and fails only on origin.
		for (const base of ['javascript:alert(1)//', 'http://evil.test/playground/v/x/hljs/']) {
			__resetHljsLoaderCaches();
			await expect(ensureFenceLanguages('x', base), base).resolves.toEqual([]);
			expect(document.querySelectorAll('script').length, base).toBe(0);
		}
	});
});

// The loaders inject the RESOLVED href (the same-origin barrier), so a dedup that compared the
// caller's raw string missed a tag injected from a relative URL: a second <script> on retry and a
// redundant prefetch link. These ran red before `scriptTagFor` compared resolved URLs.
describe('dedup compares resolved URLs', () => {
	const REL = '/playground/v/dedup/lattice-playground.js';

	it('ensureEngine retried after a failed load from a relative URL adds no second <script>', async () => {
		const first = ensureEngine(REL);
		const tag = document.querySelector<HTMLScriptElement>('script[data-lattice-engine]');
		expect(tag?.src).toBe(new URL(REL, window.location.href).href);
		tag?.dispatchEvent(new Event('error'));
		await expect(first).rejects.toThrow(/failed to load/);
		const retry = ensureEngine(REL);
		expect(document.querySelectorAll('script[data-lattice-engine]').length).toBe(1);
		window.LatticePlayground = {} as typeof window.LatticePlayground;
		await expect(retry).resolves.toBeUndefined();
	});

	it('ensureKatexProvider retried from a relative URL adds no second <script>', async () => {
		const url = '/playground/v/dedup/lattice-katex.js';
		const first = ensureKatexProvider(url);
		document.querySelector('script[data-lattice-katex-provider]')?.dispatchEvent(new Event('error'));
		await expect(first).rejects.toThrow(/failed to load/);
		const retry = ensureKatexProvider(url);
		expect(document.querySelectorAll('script[data-lattice-katex-provider]').length).toBe(1);
		window.__latticeKatexReady = true;
		await expect(retry).resolves.toBeUndefined();
	});

	it('injectPrefetch skips a URL whose <script> is already in, however the URL is spelled', () => {
		const s = document.createElement('script');
		s.setAttribute('data-lattice-engine', '');
		s.src = new URL(REL, window.location.href).href;
		document.head.appendChild(s);
		injectPrefetch(REL);
		expect(document.querySelectorAll('link[rel="prefetch"]').length).toBe(0);
	});
});
