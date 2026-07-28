import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present LAYOUT invariants — the slide card's box.
//
// jsdom computes no layout, so this asserts the CLASS that carries the invariant
// rather than a measured rectangle. That is the point: the bug (#1227) was a
// MISSING class, and the measured surface it broke on (WebKit/iOS Safari) is not
// reachable from the PR gate — Chromium keeps the sizer's height indefinite, so
// every screenshot baseline and every Chromium e2e stayed green while the real
// iPad showed a 910x540 card where 16:9 wanted 910x512.
//
// The rule: the card must NEVER be a stretch target. A stretched flex item gets a
// DEFINITE cross size, and a definite height beats `aspect-ratio` per spec — so
// `aspect-video` is silently ignored wherever the sizer's own height resolves
// definite, and the slide grows out of its row, over the header and under the
// caption crawl. `items-center` on the sizer removes that path on every engine.
vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One\n\nThe first slide.', '<!-- _class: kpi -->\n\n# Two\n\nThe second slide.'];

afterEach(() => vi.clearAllMocks());

describe('Present — slide box', () => {
	it('sizes the slide card 16:9 and never lets it be stretched (#1227)', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		const dialog = screen.getByRole('dialog', { name: 'Present' });
		// Find the sizer by what DEFINES it — the measured `rowH x 16/9` width cap — rather
		// than as `card.parentElement`: a wrapper inserted between the two would otherwise
		// silently move this assertion onto the wrong element (passing while the real sizer
		// goes unguarded).
		const sizer = [...dialog.querySelectorAll<HTMLElement>('[style*="max-width"]')].find((el) => el.querySelector('.aspect-video'));
		expect(sizer).toBeTruthy();
		// The card must be CENTERED in it, never stretched to its cross size.
		expect(sizer?.className).toMatch(/\bitems-center\b/);
		// And the box it wraps is the 16:9 card itself.
		expect(sizer?.querySelector('.aspect-video')).toBeTruthy();
	});
});
