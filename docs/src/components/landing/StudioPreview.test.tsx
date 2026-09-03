import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudioPreview, { type StudioPreviewData } from './StudioPreview';

// Stub the shared single-slide renderer so the island never touches
// window.LatticePlayground / fetch — these tests assert the React chrome (the
// caption bar), not the separately-wrapped engine render.
vi.mock('@/lib/single-slide-render', () => ({
	createSingleSlideRenderer: () => ({
		ready: () => true,
		whenReady: () => Promise.resolve(),
		renderInto: vi.fn(() => Promise.resolve({ ok: true, slides: 1, error: null })),
		onThemeChange: vi.fn(() => () => {}),
		scaleFrame: vi.fn(),
		prefetchTheme: vi.fn(),
		dispose: vi.fn(),
	}),
}));

const DATA: StudioPreviewData = {
	sample: '<!-- _class: title -->\n\n# Markdown for the boardroom',
	mermaid: false,
	deckTitle: 'Markdown for the boardroom',
	slideCount: 7,
	themeBase: '/themes/',
	runtimeUrl: '/runtime.js',
	engineUrl: '/engine.js',
	mermaidUrl: '/mermaid.js',
	katexUrl: '/katex.css',
};

describe('StudioPreview island', () => {
	it('captions the figure with the deck it is showing', () => {
		render(<StudioPreview data={DATA} />);
		expect(screen.getByText('Markdown for the boardroom')).toBeInTheDocument();
		expect(screen.getByText('7 slides')).toBeInTheDocument();
	});

	it('names the slide in the frame for a screen reader', () => {
		render(<StudioPreview data={DATA} />);
		// The label has to say WHICH deck — "a slide rendered by Lattice" would be
		// indistinguishable from the hero's figure two sections up.
		expect(
			screen.getByLabelText('The first slide of the Markdown for the boardroom deck, rendered by Lattice'),
		).toBeInTheDocument();
	});

	it('renders the slide count from the number it is given, not a baked string', () => {
		// Guards the drift this island exists to prevent: the count is derived from
		// DECKS[0].slides.length at build time, never transcribed. A deck that grows
		// a slide must move this number without anyone editing the landing page.
		render(<StudioPreview data={{ ...DATA, slideCount: 9 }} />);
		expect(screen.getByText('9 slides')).toBeInTheDocument();
		expect(screen.queryByText('7 slides')).not.toBeInTheDocument();
	});
});
