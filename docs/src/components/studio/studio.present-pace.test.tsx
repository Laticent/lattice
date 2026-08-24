import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// THE DECK CARRIES ITS OWN RHYTHM (#1399).
//
// The between-slide beat shipped reading `localStorage`, which made it a property of the
// machine doing the playing. These drive the acceptance criterion through the real overlay:
// a deck declaring `pace: deliberate` must present deliberately on a machine whose stored
// preference says `brisk` — and the presenter must still keep a live override.
//
// The beat is observed, not mocked. The oracle is the RAIL: a segment only grows a
// `data-tier="progress"` fill once playback has actually reached into it, so the window
// between "slide 2 arrived" and "slide 2 has a progress fill" IS the hold. Deliberately NOT
// the transport's label — during a hold the control correctly reads `Pause`, because making
// Pause unreachable for the length of every beat was one of the defects #1352's trio fixed.
// The window is sampled while it is open rather than waited out; an auto-retrying matcher
// would sit through any hold and pass against any pace, which is how an earlier spec here lied.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One\n\n<!-- note: First. -->', '<!-- _class: title -->\n\n# Two\n\n<!-- note: Second. -->'];
const fm = (pace?: string) => `---\ntheme: cuoio${pace ? `\npace: ${pace}` : ''}\n---\n`;

/** Is the deck holding — arrived on a slide, not yet speaking? Published as state by the
 *  overlay itself (`data-beat="hold"`), because every inferred signal is wrong: the transport
 *  deliberately reads `Pause` throughout a hold, and the rail's fill still carries the previous
 *  slide's progress until the reader rebuilds. Both were tried; both measure the wrong window. */
const holding = () => screen.getByRole('dialog', { name: 'Present' }).getAttribute('data-beat') === 'hold';

/** How long the deck holds on slide 2 before narration starts — the between-slide beat. */
async function measureBeat(): Promise<number> {
	const user = userEvent.setup();
	await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
	// Catch the hold as it OPENS, so the measurement covers the whole window.
	const armed = Date.now() + 12_000;
	while (Date.now() < armed && !holding()) await new Promise((r) => setTimeout(r, 10));
	expect(holding(), 'the deck never entered a hold — the chain stalled, so no beat was measured').toBe(true);
	const start = performance.now();
	while (performance.now() - start < 6000) {
		if (!holding()) return performance.now() - start;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error('the hold never ended within 6s');
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

describe('Present — the deck carries its pace (#1399)', () => {
	it('presents a `pace: deliberate` deck deliberately on a machine set to brisk', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk'); // the viewer's stored preference
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm('deliberate')} notify={() => {}} />);
		const beat = await measureBeat();
		// Deliberate is 2200ms, brisk 800ms. Anything under ~1.5s means the stored preference won
		// and the author's directorial choice was lost the moment the deck left their machine.
		expect(beat).toBeGreaterThan(1500);
	}, 30_000);

	it('takes the stored preference when the deck declares none', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk');
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm()} notify={() => {}} />);
		const beat = await measureBeat();
		// The preset is a DEFAULT for an undeclared deck, not a dead setting.
		expect(beat).toBeLessThan(1300);
	}, 30_000);

	it('still lets the presenter override a declared deck live', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk');
		localStorage.setItem('lattice-present-slide-beat', '0'); // the live "no beat" override
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm('deliberate')} notify={() => {}} />);
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));

		// The exact-millisecond override outranks the deck, so a presenter is never trapped in
		// someone else's rhythm mid-delivery. A zero beat is not a SHORT hold — the overlay
		// skips the hold entirely rather than scheduling a pointless timer — so the assertion is
		// that no hold is ever entered, while the chain still advances and speaks.
		const deadline = Date.now() + 12_000;
		let everHeld = false;
		let reached2 = false;
		while (Date.now() < deadline && !reached2) {
			if (holding()) everHeld = true;
			if (screen.queryByText('2 / 2')) reached2 = true;
			await new Promise((r) => setTimeout(r, 10));
		}
		expect(reached2, 'the deck never advanced, so the override was not what was measured').toBe(true);
		expect(everHeld, 'a 0ms override must skip the hold, not schedule one').toBe(false);
		// And the override never leaves the machine: it is a workspace value, not front matter.
		expect(fm('deliberate')).not.toMatch(/slide-beat/);
	}, 30_000);
});
