import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from './render-engine';

describe('renderMarkdown', () => {
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
});
