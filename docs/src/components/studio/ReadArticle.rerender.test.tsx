// The Reading view must not rewrite its article on a re-render that does not change it. React 19 re-applies
// `dangerouslySetInnerHTML` whenever the prop is a new object, so an inline `{{ __html }}` threw away every hydrated
// figure on each re-render (a resize, any shell update); studio-read-article-charts.spec.ts held a detached figure.
import { act, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('./article-projection', () => ({
	projectDeckArticle: vi.fn(async () => ({ articleHtml: '<section id="s1"><h1>One</h1><figure class="lp-figure">chart</figure></section>', toc: [], css: '' })),
}));

import { ReadArticle } from './ReadArticle';

test('a re-render with the same article keeps the same figure nodes', async () => {
	const options = { themeBase: '/t/', runtimeUrl: '/r.js' } as never;
	const props = { options, source: '# One', palette: 'cuoio', mode: 'light' as const, onClose: () => {} };
	const view = render(<ReadArticle {...props} />);
	const figure = await view.findByText('chart');
	// A new onClose: a re-render that changes nothing the article is made from.
	await act(async () => view.rerender(<ReadArticle {...props} onClose={() => {}} />));
	expect(view.getByText('chart')).toBe(figure);
	expect(figure.isConnected).toBe(true);
});
