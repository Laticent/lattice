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

// The preview records the step Present asks it to paint, so a cell can read where a slide was landed.
vi.mock('@/components/DeckPreview', () => ({ default: (p: { step?: unknown }) => <div data-testid="dp" data-step={JSON.stringify(p.step ?? null)} /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

/** A slide whose spoken text is exactly `spoken`, pinned with a `<!-- say: -->` override.
 *
 *  This used to author a `<!-- note: -->`, back when a speaker note outranked the slide's own
 *  content in the narration ladder. That rung was removed on 2026-08-24 — a note is never
 *  spoken now — which silently GUTTED these cells: two slides built with the same `note` began
 *  narrating their own headings ("One." and "Two."), so the very condition the first test names
 *  in its title, two consecutive slides that narrate IDENTICALLY, stopped being constructed.
 *  Both cells still passed, which is the only reason it was not noticed.
 *
 *  A say override is the channel that sets a slide's spoken line now, so it restores the
 *  fixture's meaning rather than just its green. */
const slide = (heading: string, spoken: string) => `<!-- _class: title -->\n\n# ${heading}\n\n<!-- say: ${spoken} -->`;

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
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);

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
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);

		// Step forward by hand from a stopped deck. The narration record changes exactly as it
		// does on an auto-advance, so if the fix had dropped the `autoAdvanceRef` gate this
		// would start speaking on its own.
		await user.click(screen.getAllByRole('button', { name: 'Next slide' })[0]); // the dock renders a phone + desktop pair
		await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
	}, 20_000);
	it('lands a build slide AT REST when autoplay reaches it, every point shown while it is read (D2 does not apply)', async () => {
		const user = userEvent.setup();
		// Narration is per slide and never walks steps. A build entered by autoplay must show its points while they are
		// spoken, as the exported player's `go(i, true)` does; a jump would start it hidden (step 0) for its whole read.
		const build = '<!-- _build -->\n\n## Built\n\n- First\n- Second\n\n<!-- say: Two points. -->';
		const slides = [slide('One', 'First words.'), build, slide('Three', 'Last words.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument(), { timeout: 10_000 });
		// null is rest: no step asked, so the build shows whole.
		for (const dp of screen.getAllByTestId('dp')) expect(dp.getAttribute('data-step')).toBe('null');
	}, 30_000);
});
