import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present's AUTO-ADVANCE CHAIN across slides whose narration REPEATS (#1394).
//
// The defect: the effect that starts a newly-arrived slide's reader was keyed on
// `reader.track`, and `track` is memoized on its TEXT. Two consecutive slides narrating
// identically therefore produced the same object, React bailed out of the commit entirely,
// the effect never re-ran, `autoAdvanceRef` stayed armed, and the chain was dead — the deck
// stopped mid-presentation with no error and no way back but the presenter's own hand.
//
// The chain is driven here on the SILENT rung (no key needed, and the rung is irrelevant:
// autoplay rides the reader clock either way), with the between-slide beat overridden to 0
// so the test measures the chain rather than the pace.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

/** A slide whose spoken text is exactly `note` — the speaker note outranks the projection. */
const slide = (heading: string, note: string) => `<!-- _class: title -->\n\n# ${heading}\n\n<!-- note: ${note} -->`;

beforeEach(() => {
	// Brisk with an explicit 0 beat: the chain plays straight through, so a 3-slide run
	// finishes in the time the prose takes rather than in three 1.4s holds.
	localStorage.setItem('lattice-present-pace', 'brisk');
	localStorage.setItem('lattice-present-slide-beat', '0');
});
afterEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

describe('Present — the auto-advance chain (#1394)', () => {
	it('chains THROUGH two consecutive slides that narrate identically', async () => {
		const user = userEvent.setup();
		// Slides 1 and 2 speak the SAME sentence. Slide 3 is the oracle: reaching it proves
		// slide 2 actually played and finished, not merely that the index moved.
		const slides = [slide('One', 'Same words.'), slide('Two', 'Same words.'), slide('Three', 'Different words entirely.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);

		expect(screen.getByText('1 / 3')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));

		// Slide 2 arrives with byte-identical narration — the state the chain used to die in.
		await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument(), { timeout: 10_000 });
		// …and keeps going. Without the fix this never arrives: slide 2 never speaks, so it
		// never finishes, so nothing ever advances again.
		await waitFor(() => expect(screen.getByText('3 / 3')).toBeInTheDocument(), { timeout: 10_000 });
	}, 30_000);

	it('still does not auto-play on a MANUAL move (the guard the fix must not weaken)', async () => {
		const user = userEvent.setup();
		const slides = [slide('One', 'Same words.'), slide('Two', 'Same words.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);

		// Step forward by hand from a stopped deck. The narration record changes exactly as it
		// does on an auto-advance, so if the fix had dropped the `autoAdvanceRef` gate this
		// would start speaking on its own.
		await user.click(screen.getAllByRole('button', { name: 'Next slide' })[0]); // the dock renders a phone + desktop pair
		await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
	}, 20_000);
});
