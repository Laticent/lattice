import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKatexProviderUrl, ensureKatexProvider } from './ensure-katex';
import { renderMarkdown } from './render-engine';

vi.mock('./ensure-katex', () => ({
	deriveKatexProviderUrl: vi.fn(),
	ensureKatexProvider: vi.fn(),
}));

describe('renderMarkdown', () => {
	beforeEach(() => {
		vi.mocked(deriveKatexProviderUrl).mockReset();
		vi.mocked(ensureKatexProvider).mockReset().mockResolvedValue(undefined);
	});

	it('forwards source/theme/opts to PG.render and returns its result', async () => {
		const render = vi.fn().mockReturnValue({ html: '<section></section>', css: 'body{}', width: 1280, height: 720 });
		const PG = { render, addThemes: vi.fn(), hasTheme: vi.fn() };
		const result = await renderMarkdown(PG, '# hi', 'indaco', { baseUrl: 'https://example.test/samples/' });
		expect(render).toHaveBeenCalledWith('# hi', 'indaco', { baseUrl: 'https://example.test/samples/' });
		expect(result).toEqual({ html: '<section></section>', css: 'body{}', width: 1280, height: 720 });
	});

	it('works with opts omitted', async () => {
		const render = vi.fn().mockReturnValue({ html: '', css: '' });
		const PG = { render, addThemes: vi.fn(), hasTheme: vi.fn() };
		await renderMarkdown(PG, '# hi', 'indaco');
		expect(render).toHaveBeenCalledWith('# hi', 'indaco', undefined);
	});

	it('turns a synchronous throw from PG.render into a rejected promise', async () => {
		const PG = {
			render: vi.fn(() => {
				throw new Error('boom');
			}),
			addThemes: vi.fn(),
			hasTheme: vi.fn(),
		};
		await expect(renderMarkdown(PG, '# hi', 'indaco')).rejects.toThrow('boom');
	});

	it('does NOT touch the KaTeX loader for a deck with no math', async () => {
		const PG = { render: vi.fn().mockReturnValue({ html: '', css: '' }), addThemes: vi.fn(), hasTheme: vi.fn() };
		await renderMarkdown(PG, '# Plain deck\n\nNo formulas here.\n', 'indaco');
		expect(deriveKatexProviderUrl).not.toHaveBeenCalled();
		expect(ensureKatexProvider).not.toHaveBeenCalled();
	});

	it('awaits the KaTeX provider load before rendering a deck WITH math', async () => {
		vi.mocked(deriveKatexProviderUrl).mockReturnValue('https://example.test/playground/v/abc/lattice-katex.js');
		const calls: string[] = [];
		vi.mocked(ensureKatexProvider).mockImplementation(async () => {
			calls.push('katex-loaded');
		});
		const render = vi.fn(() => {
			calls.push('rendered');
			return { html: '<span class="katex"></span>', css: '' };
		});
		const PG = { render, addThemes: vi.fn(), hasTheme: vi.fn() };
		await renderMarkdown(PG, 'Inline $a^2$ math.\n', 'indaco');
		expect(ensureKatexProvider).toHaveBeenCalledWith('https://example.test/playground/v/abc/lattice-katex.js');
		expect(calls).toEqual(['katex-loaded', 'rendered']); // load completes BEFORE render runs
	});

	it('renders anyway when the KaTeX provider fails to load (best-effort, non-blocking)', async () => {
		vi.mocked(deriveKatexProviderUrl).mockReturnValue('https://example.test/playground/v/abc/lattice-katex.js');
		vi.mocked(ensureKatexProvider).mockRejectedValue(new Error('network error'));
		const render = vi.fn().mockReturnValue({ html: '', css: '' });
		const PG = { render, addThemes: vi.fn(), hasTheme: vi.fn() };
		await expect(renderMarkdown(PG, 'Inline $a^2$ math.\n', 'indaco')).resolves.toEqual({ html: '', css: '' });
		expect(render).toHaveBeenCalled();
	});

	it('skips the KaTeX loader entirely when no engine script is found (deriveKatexProviderUrl → null)', async () => {
		vi.mocked(deriveKatexProviderUrl).mockReturnValue(null);
		const render = vi.fn().mockReturnValue({ html: '', css: '' });
		const PG = { render, addThemes: vi.fn(), hasTheme: vi.fn() };
		await renderMarkdown(PG, 'Inline $a^2$ math.\n', 'indaco');
		expect(ensureKatexProvider).not.toHaveBeenCalled();
		expect(render).toHaveBeenCalled();
	});
});
