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
		// Find the sizer by what DEFINES it — it is the SIZE CONTAINER the card measures
		// itself against — rather than as `card.parentElement`: a wrapper inserted between
		// the two would otherwise silently move this assertion onto the wrong element
		// (passing while the real sizer goes unguarded). The marker used to be the inline
		// `max-width` the ResizeObserver wrote; the sizing is pure CSS now, so the
		// container declaration is what identifies it.
		const sizer = [...dialog.querySelectorAll<HTMLElement>('[class*="container-type:size"]')].find((el) => el.querySelector('.aspect-video'));
		expect(sizer).toBeTruthy();
		// The card must be CENTERED in it, never stretched to its cross size.
		expect(sizer?.className).toMatch(/\bitems-center\b/);
		// It must also have a DEFINITE height for `100cqh` to resolve against — the sizer
		// stretches to the row's content box. Without this the card's height term is
		// meaningless and it falls back to being width-bound everywhere.
		expect(sizer?.className).toMatch(/\bself-stretch\b/);
		// And the box it wraps is the 16:9 card itself, sized from the container in BOTH
		// axes — `min(100cqw, 100cqh x 16/9)` is what makes it fill the space it is given
		// instead of only the width (#1282).
		const card = sizer?.querySelector<HTMLElement>('.aspect-video');
		expect(card).toBeTruthy();
		expect(card?.className).toMatch(/100cqw/);
		expect(card?.className).toMatch(/100cqh/);
	});

	it('reserves a band below the slide so no overlay pill is ever drawn on it (#1282)', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		const dialog = screen.getByRole('dialog', { name: 'Present' });
		const sizer = [...dialog.querySelectorAll<HTMLElement>('[class*="container-type:size"]')].find((el) => el.querySelector('.aspect-video'));
		const row = sizer?.parentElement;
		// The row's transient pills are `absolute … bottom-2/3` against IT, so they resolve
		// against its PADDING box while the card is confined to the content box. The
		// bottom padding is the whole reason they cannot overlap; jsdom computes no
		// layout, so the class carrying the invariant is what is asserted.
		expect(row?.className).toMatch(/\bpb-14\b/);
		expect(row?.className).toMatch(/\brelative\b/);
	});
});
