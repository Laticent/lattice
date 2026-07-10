import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RestyleShowcase, { type RestyleData } from './RestyleShowcase';

// Stub the shared single-slide renderer so the island never touches
// window.LatticePlayground / fetch — these tests assert the React chrome (swatch
// tablist + active name + manual select), not the (separately wrapped) engine
// render. The island holds one renderer per mount (a React.useRef instance), so
// a module-level stub matches that lifetime.
const renderInto = vi.fn(() => Promise.resolve({ ok: true, slides: 1, error: null }));
vi.mock('@/lib/single-slide-render', () => ({
	createSingleSlideRenderer: () => ({
		ready: () => true,
		whenReady: () => Promise.resolve(),
		renderInto,
		onThemeChange: vi.fn(),
		scaleFrame: vi.fn(),
		prefetchTheme: vi.fn(),
	}),
}));

const DATA: RestyleData = {
	sample: '<!-- _class: kpi -->\n# x',
	mermaid: false,
	palettes: [
		{ name: 'indaco', label: 'Indaco', accent: '#006fa8' },
		{ name: 'cuoio', label: 'Cuoio', accent: '#9a3b2f' },
		{ name: 'ardesia', label: 'Ardesia', accent: '#4a5a6a' },
	],
	themeBase: '/themes/',
	runtimeUrl: '/runtime.js',
	engineUrl: '/engine.js',
};

beforeEach(() => {
	renderInto.mockClear();
	// jsdom has no IntersectionObserver — the island falls back to eager begin().
	// @ts-expect-error test shim
	delete window.IntersectionObserver;
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	document.documentElement.removeAttribute('data-mode');
});

describe('RestyleShowcase island', () => {
	it('renders a swatch tab per palette inside a tablist', () => {
		render(<RestyleShowcase data={DATA} />);
		const tabs = screen.getAllByRole('tab');
		expect(tabs).toHaveLength(3);
		expect(screen.getByRole('tablist', { name: /choose a palette/i })).toBeInTheDocument();
	});

	it('marks the first palette active and shows its label', () => {
		render(<RestyleShowcase data={DATA} />);
		expect(screen.getByRole('tab', { name: 'Indaco' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByText('Indaco')).toBeInTheDocument();
	});

	it('selecting a swatch makes it active and re-renders that palette', () => {
		render(<RestyleShowcase data={DATA} />);
		fireEvent.click(screen.getByRole('tab', { name: 'Cuoio' }));
		expect(screen.getByRole('tab', { name: 'Cuoio' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByText('Cuoio')).toBeInTheDocument();
		// last renderInto call targeted the cuoio palette override.
		expect(renderInto).toHaveBeenCalledWith(expect.anything(), DATA.sample, false, 'cuoio');
	});

	it('carries the lx-ui island scope class', () => {
		const { container } = render(<RestyleShowcase data={DATA} />);
		expect(container.querySelector('.lx-ui')).not.toBeNull();
	});
});
