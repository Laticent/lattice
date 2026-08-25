/**
 * The on-demand grammar loader.
 *
 * The property under test that actually matters is the BOUND. `ensureFenceLanguages`
 * is awaited immediately before the synchronous `PG.render` in render-engine.ts, so
 * anything that can hang here hangs the preview — and a `<script>` whose request
 * stalls (no response, as opposed to a refused connection) fires neither `load` nor
 * `error` until the browser's own timeout, which is minutes. The first cut of this
 * module had no deadline; these assert it exists and that the render is never left
 * waiting on the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetHljsLoaderCaches, ensureFenceLanguages, hljsBaseFor } from './ensure-hljs-language';

const BASE = 'https://example.test/playground/v/abc123/hljs/';
const MANIFEST = {
	languages: { powershell: { file: 'powershell.js', bytes: 4610 }, dockerfile: { file: 'dockerfile.js', bytes: 614 } },
	aliases: { ps1: 'powershell', docker: 'dockerfile' },
};

/** Scripts the module appended, so a test can settle them on its own terms. */
function appendedScripts(): HTMLScriptElement[] {
	return [...document.querySelectorAll<HTMLScriptElement>('script[data-lattice-hljs]')];
}

/** Stand in for the engine bundle's global. `missing` is what the deck still needs. */
function stubPlayground(missing: string[], onDrain?: () => string[]) {
	const drained: string[] = [];
	window.LatticePlayground = {
		render: (() => ({ html: '', css: '' })) as never,
		addThemes: () => {},
		hasTheme: () => true,
		missingLanguages: () => missing,
		drainLanguages: () => (onDrain ? onDrain() : drained),
	};
}

beforeEach(() => {
	__resetHljsLoaderCaches();
	document.head.innerHTML = '';
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(MANIFEST), { status: 200 })));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	window.LatticePlayground = undefined;
});

describe('hljsBaseFor', () => {
	it('derives the grammar dir from the engine bundle URL', () => {
		expect(hljsBaseFor('/playground/v/abc/lattice-playground.js')).toBe('/playground/v/abc/hljs/');
	});

	it('returns null for anything that is not the engine bundle', () => {
		expect(hljsBaseFor('/playground/v/abc/lattice-katex.js')).toBeNull();
		expect(hljsBaseFor('')).toBeNull();
	});
});

describe('ensureFenceLanguages — the common case costs nothing', () => {
	it('a deck needing no extra grammar never touches the network', async () => {
		stubPlayground([]);
		await expect(ensureFenceLanguages('# hi', BASE)).resolves.toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
		expect(appendedScripts()).toHaveLength(0);
	});

	it('an engine bundle older than this feature is a no-op, not a crash', async () => {
		window.LatticePlayground = { render: (() => ({ html: '', css: '' })) as never, addThemes: () => {}, hasTheme: () => true };
		await expect(ensureFenceLanguages('# hi', BASE)).resolves.toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('ensureFenceLanguages — resolution', () => {
	it('fetches only the files the deck names', async () => {
		stubPlayground(['dockerfile'], () => ['dockerfile']);
		const p = ensureFenceLanguages('x', BASE);
		await vi.waitFor(() => expect(appendedScripts()).toHaveLength(1));
		const [s] = appendedScripts();
		expect(s.src).toBe(`${BASE}dockerfile.js`);
		s.dispatchEvent(new Event('load'));
		await expect(p).resolves.toEqual(['dockerfile']);
	});

	it('resolves an alias through the manifest rather than fetching speculatively', async () => {
		stubPlayground(['ps1'], () => ['powershell']);
		const p = ensureFenceLanguages('x', BASE);
		await vi.waitFor(() => expect(appendedScripts()).toHaveLength(1));
		expect(appendedScripts()[0].src).toBe(`${BASE}powershell.js`);
		appendedScripts()[0].dispatchEvent(new Event('load'));
		await p;
	});

	it('a tag that is not a highlight.js language fetches nothing beyond the manifest', async () => {
		stubPlayground(['not-a-real-language']);
		await expect(ensureFenceLanguages('x', BASE)).resolves.toEqual([]);
		expect(appendedScripts()).toHaveLength(0);
	});
});

describe('ensureFenceLanguages — never blocks the render', () => {
	it('a script that errors resolves instead of hanging', async () => {
		stubPlayground(['dockerfile'], () => []);
		const p = ensureFenceLanguages('x', BASE);
		await vi.waitFor(() => expect(appendedScripts()).toHaveLength(1));
		appendedScripts()[0].dispatchEvent(new Event('error'));
		await expect(p).resolves.toEqual([]);
	});

	it('A STALLED script — neither load nor error — still settles on the deadline', async () => {
		// The regression this module's first cut would have failed: the render sits
		// behind this await, and a stalled request fires no event for minutes.
		vi.useFakeTimers();
		stubPlayground(['dockerfile'], () => []);
		const p = ensureFenceLanguages('x', BASE);
		// Let the manifest fetch settle its microtasks before the timers advance.
		await vi.advanceTimersByTimeAsync(0);
		await vi.waitFor(() => expect(appendedScripts()).toHaveLength(1), { timeout: 1000 });
		// Deliberately dispatch NOTHING on the script.
		await vi.advanceTimersByTimeAsync(10_001);
		await expect(p).resolves.toEqual([]);
	});

	it('a rejected manifest fetch resolves, and is retryable rather than memoized dead', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
		stubPlayground(['dockerfile']);
		await expect(ensureFenceLanguages('x', BASE)).resolves.toEqual([]);
		// Second call re-fetches: one offline moment must not leave the preview
		// permanently monochrome for the rest of the session.
		await ensureFenceLanguages('x', BASE).catch(() => []);
		expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2);
	});

	it('a drainLanguages that throws does not reject the caller', async () => {
		stubPlayground(['dockerfile'], () => { throw new Error('bad grammar'); });
		const p = ensureFenceLanguages('x', BASE);
		await vi.waitFor(() => expect(appendedScripts()).toHaveLength(1));
		appendedScripts()[0].dispatchEvent(new Event('load'));
		await expect(p).resolves.toEqual([]);
	});
});
