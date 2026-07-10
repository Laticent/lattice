import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveKatexProviderUrl, ensureKatexProvider, katexProviderUrlFor } from './ensure-katex';

describe('katexProviderUrlFor', () => {
	it('swaps lattice-playground.js for lattice-katex.js', () => {
		expect(katexProviderUrlFor('https://example.test/playground/v/abc123/lattice-playground.js')).toBe(
			'https://example.test/playground/v/abc123/lattice-katex.js',
		);
	});

	it('returns null for a URL that does not match the expected filename', () => {
		expect(katexProviderUrlFor('https://example.test/some-other-bundle.js')).toBeNull();
	});
});

afterEach(() => {
	document.head.innerHTML = '';
	window.__latticeKatexReady = undefined;
	vi.restoreAllMocks();
});

describe('deriveKatexProviderUrl', () => {
	it('derives the sibling lattice-katex.js URL from the injected engine script', () => {
		const s = document.createElement('script');
		s.src = 'https://example.test/playground/v/abc123/lattice-playground.js';
		s.setAttribute('data-lattice-engine', '');
		document.head.appendChild(s);
		expect(deriveKatexProviderUrl()).toBe('https://example.test/playground/v/abc123/lattice-katex.js');
	});

	it('returns null when no engine script is present', () => {
		expect(deriveKatexProviderUrl()).toBeNull();
	});

	it('returns null when the engine script src does not match the expected filename', () => {
		const s = document.createElement('script');
		s.src = 'https://example.test/some-other-bundle.js';
		s.setAttribute('data-lattice-engine', '');
		document.head.appendChild(s);
		expect(deriveKatexProviderUrl()).toBeNull();
	});
});

describe('ensureKatexProvider', () => {
	it('resolves immediately if already ready', async () => {
		window.__latticeKatexReady = true;
		await expect(ensureKatexProvider('https://example.test/lattice-katex.js')).resolves.toBeUndefined();
		expect(document.querySelectorAll('script[data-lattice-katex-provider]').length).toBe(0);
	});

	it('injects a script tag and resolves once __latticeKatexReady flips true', async () => {
		const url = 'https://example.test/lattice-katex.js';
		const p = ensureKatexProvider(url);
		const injected = document.querySelector<HTMLScriptElement>('script[data-lattice-katex-provider]');
		expect(injected?.src).toBe(url);
		// Simulate the bundle executing and setting the ready flag, then firing load.
		window.__latticeKatexReady = true;
		injected?.dispatchEvent(new Event('load'));
		await expect(p).resolves.toBeUndefined();
	});

	it('rejects on a script load error', async () => {
		const url = 'https://example.test/lattice-katex-broken.js';
		const p = ensureKatexProvider(url);
		const injected = document.querySelector<HTMLScriptElement>('script[data-lattice-katex-provider]');
		injected?.dispatchEvent(new Event('error'));
		await expect(p).rejects.toThrow(/failed to load/);
	});
});
