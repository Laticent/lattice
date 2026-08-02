import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// The first-run gesture cue is retired by the USER, not by a clock (#1301 review).
// The old version auto-faded after 5.2s and marked itself seen the moment it
// APPEARED — two opposite failures: look away and you lose it forever; reload
// inside those five seconds and you never see it at all.
vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One', '<!-- _class: kpi -->\n\n# Two'];
const KEY = 'lattice-present-hint';
const cue = () => screen.queryByText(/Swipe or use/);

afterEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	vi.useRealTimers();
});

const open = () => render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);

describe('Present — the first-run gesture cue', () => {
	it('appears on a first Present, and does NOT mark itself seen merely by appearing', () => {
		open();
		expect(cue()).toBeInTheDocument();
		// The flag is the record of a DISMISSAL. Writing it on show is what made a
		// reload inside the old 5.2s window silently consume the one showing.
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('does not auto-fade — it waits for the user', () => {
		vi.useFakeTimers();
		open();
		expect(cue()).toBeInTheDocument();
		vi.advanceTimersByTime(60_000);
		expect(cue()).toBeInTheDocument();
	});

	it('the dismiss control retires it and persists that', () => {
		open();
		fireEvent.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
		expect(cue()).not.toBeInTheDocument();
		expect(localStorage.getItem(KEY)).toBe('1');
	});

	it('navigating also retires it — a swipe proves the gesture was learned', () => {
		open();
		// Two carry this name — the flanking arrow and the dock's compact control.
		// Either is a real navigation, so drive the first rather than narrowing.
		fireEvent.click(screen.getAllByRole('button', { name: 'Next slide' })[0]);
		expect(cue()).not.toBeInTheDocument();
		expect(localStorage.getItem(KEY)).toBe('1');
	});

	it('never returns once dismissed', () => {
		localStorage.setItem(KEY, '1');
		open();
		expect(cue()).not.toBeInTheDocument();
	});

	it('stays quiet when storage throws, rather than nagging every visit', () => {
		const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
		open();
		expect(cue()).not.toBeInTheDocument();
		spy.mockRestore();
	});
});
