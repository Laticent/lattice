import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present PLAYBACK wiring (2026-07-12 redesign): the model has ONE Play — it
// narrates the current slide AND advances, video-style; the separate "Autoplay"
// toggle is deleted. Voice (TTS) is an independent, muted-by-default toggle, so
// the next-slide narration warm-ahead only bills the API once Voice is ON. Here we
// assert Play engages/pauses the reader, Rehearse is a mutually-exclusive transport,
// and the warm-ahead prefetches the NEXT slide (never the current) — but only when
// Voice is unmuted.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
// vi.mock factories are hoisted above imports, so a spy referenced inside one
// must go through vi.hoisted — a plain outer `const warmSpy = vi.fn()` would
// be accessed before its own initialization.
const { warmSpy } = vi.hoisted(() => ({ warmSpy: vi.fn() }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: warmSpy }),
}));
// The presenter stage doc needs the engine — stub it out (it's best-effort anyway).
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One\n\nThe first slide has some spoken prose.', '<!-- _class: kpi -->\n\n# Two\n\nThe second slide also reads aloud.'];

afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

describe('Present — playback (one Play)', () => {
	it('one Play engages the reader and toggles back to Play on pause', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		// Starts idle on slide 1 of 2 with the single Play control.
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
		const play = screen.getByRole('button', { name: 'Play the presentation' });
		expect(play).toBeInTheDocument();
		// Play engages the reader — the control flips to Pause.
		await user.click(play);
		expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
		// Pausing stops it again.
		await user.click(screen.getByRole('button', { name: 'Pause' }));
		expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
	});

	it('Rehearse and playback are mutually exclusive transports', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
		// Entering Rehearse stops playback: the presentation transport is replaced by
		// rehearsal's own Start control (they never run at once).
		await user.click(screen.getByRole('button', { name: 'Rehearse' }));
		expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Start rehearsal' })).toBeInTheDocument();
	});

	it("warms the NEXT slide's narration (not the current one) once Voice is on during playback", async () => {
		// Regression coverage for the warm-ahead wiring itself (as opposed to
		// voice-model.js's own warm() unit tests): a slide-index bug here (e.g.
		// warming `clamped` instead of `clamped + 1`) would warm the WRONG slide and
		// pass every voice-model-level test untouched. Warm-ahead is a VOICE cost, so
		// it must stay silent while muted and only fire once Voice is turned on.
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		expect(warmSpy).not.toHaveBeenCalled(); // idle — nothing to warm

		// Play alone must NOT warm: Voice is muted by default, so there is no TTS to prefetch.
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		expect(warmSpy).not.toHaveBeenCalled();

		// Turning Voice on engages the warm-ahead for the NEXT slide.
		await user.click(screen.getByRole('button', { name: /^Voice off/ }));
		await vi.waitFor(() => expect(warmSpy).toHaveBeenCalled());
		const [sentences] = warmSpy.mock.calls.at(-1) ?? [];
		const joined = (sentences ?? []).join(' ');
		expect(joined).toMatch(/second slide/i); // warms slide 2 (the NEXT slide)…
		expect(joined).not.toMatch(/first slide/i); // …never slide 1 (the CURRENT one)
	});
});
