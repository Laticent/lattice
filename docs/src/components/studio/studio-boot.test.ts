import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureEngine = vi.fn(() => Promise.resolve());
const fetchTheme = vi.fn(() => Promise.resolve(''));
vi.mock('@/lib/load-engine', () => ({ ensureEngine }));
vi.mock('@/lib/theme-fetch', () => ({ createThemeFetcher: () => ({ fetch: fetchTheme }) }));

function seed(json: string | null) {
	document.head.innerHTML = '';
	document.body.innerHTML = json === null ? '' : `<script type="application/json" data-studio-boot>${json}</script>`;
}

describe('studio-boot', () => {
	beforeEach(() => {
		vi.resetModules();
		ensureEngine.mockClear();
		fetchTheme.mockClear();
	});
	afterEach(() => {
		document.head.innerHTML = '';
		document.body.innerHTML = '';
	});

	it('starts the engine, the base theme and the runtime prefetch when the page names them', async () => {
		seed('{"engineUrl":"/p/esm/engine.js","themeBase":"/p/themes/","runtimeUrl":"/p/lattice-runtime.js"}');
		await import('./studio-boot');
		expect(ensureEngine).toHaveBeenCalledWith('/p/esm/engine.js');
		expect(fetchTheme).toHaveBeenCalledWith('lattice');
		const link = document.head.querySelector('link[rel="prefetch"]') as HTMLLinkElement;
		expect(link.getAttribute('href')).toBe('/p/lattice-runtime.js');
		expect(link.getAttribute('as')).toBe('script');
	});

	it('does nothing without boot data, and does not throw on malformed data', async () => {
		seed(null);
		await import('./studio-boot');
		vi.resetModules();
		seed('{not json');
		await import('./studio-boot');
		expect(ensureEngine).not.toHaveBeenCalled();
		expect(document.head.querySelector('link')).toBeNull();
	});

	it('drops a URL that is not a plain absolute path on this origin', async () => {
		seed('{"engineUrl":"https://evil.example/e.js","themeBase":"//evil.example/t/","runtimeUrl":"/p/\\"><img src=x onerror=1>"}');
		await import('./studio-boot');
		expect(ensureEngine).not.toHaveBeenCalled();
		expect(fetchTheme).not.toHaveBeenCalled();
		expect(document.head.querySelector('link')).toBeNull();
	});

	it('swallows an engine failure: the preview reports it through its own call', async () => {
		ensureEngine.mockImplementationOnce(() => Promise.reject(new Error('offline')));
		seed('{"engineUrl":"/p/esm/engine.js"}');
		await expect(import('./studio-boot')).resolves.toBeDefined();
	});
});
