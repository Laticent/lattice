import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { slideBeatMs } from '@/lib/cadenza';
import { loadAuthoring } from '@/playground/authoring-door.js';
import { PresentOverlay } from './PresentOverlay';

// The module under test reads the lint core synchronously; in the app, its loader awaits this first.
beforeAll(() => loadAuthoring());


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
//
// The clock is FAKE (HARD RULE #32). The beat is a `setTimeout` of the pace's length, so the
// hold is measured in fake milliseconds stepped one `STEP` at a time: the reading is the same on
// an idle laptop and a loaded runner, and a pace that is wrong by a whole preset cannot pass.

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

/** One step of fake time, and the helper that spends it: every timer and frame due in the step
 *  fires, and the microtasks between them settle, inside act() so React commits what they set. */
const STEP = 10;
const step = (ms = STEP) =>
	act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
/** Step fake time until `done()` holds, for at most `budget` fake ms. Returns whether it did. */
async function stepUntil(done: () => boolean, budget = 12_000): Promise<boolean> {
	for (let spent = 0; spent < budget && !done(); spent += STEP) await step();
	return done();
}
/** Pressing a control. A plain click event, not userEvent: Testing Library's async wrapper settles
 *  each userEvent call on a `setTimeout(0)`, which a fake clock never fires. */
const press = async (name: string) => {
	fireEvent.click(screen.getAllByRole('button', { name })[0]);
	await step(0);
};

/** How long the deck holds on slide 2 before narration starts — the between-slide ARRIVAL beat.
 *  The clock starts when slide 2 is shown: the leave beat on slide 1 is also a hold, and timing
 *  from the first hold measured leave + arrival, so a pace that reached only one could pass.
 *  The result is fake milliseconds, counted in `STEP`s, never a reading of a real clock. */
async function measureBeat(): Promise<number> {
	await press('Play the presentation');
	await stepUntil(() => !!screen.queryByText('2 / 2'));
	expect(holding(), 'the deck arrived on slide 2 without holding — the chain stalled, so no beat was measured').toBe(true);
	let held = 0;
	while (held < 6000) {
		if (!holding()) return held;
		await step();
		held += STEP;
	}
	throw new Error('the hold never ended within 6s');
}

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

describe('Present — the deck carries its pace (#1399)', () => {
	it('presents a `pace: deliberate` deck deliberately on a machine set to brisk', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk'); // the viewer's stored preference
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm('deliberate')} />);
		const beat = await measureBeat();
		// Deliberate is 2200ms, brisk 800ms. Anything under ~1.5s means the stored preference won
		// and the author's directorial choice was lost the moment the deck left their machine.
		expect(beat).toBeGreaterThan(1500);
	}, 30_000);

	it('takes the stored preference when the deck declares none', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk');
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm()} />);
		const beat = await measureBeat();
		// The preset is a DEFAULT for an undeclared deck, not a dead setting.
		expect(beat).toBeLessThan(1300);
	}, 30_000);

	it('drops the leave beat cleanly when the presenter moves on during it', async () => {
		// Moving to the next slide by hand inside the leave beat must end the hold: it used to stay
		// on, so the transport read Pause with nothing playing (checker, reproduced).
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm('deliberate')} />);
		await press('Play the presentation');
		await stepUntil(() => holding() && !!screen.queryByText('1 / 2'));
		expect(holding(), 'the finished slide never held its leave beat').toBe(true);
		await press('Next slide');
		// Past the whole deliberate leave beat, which is the longest the dropped hold could last.
		await step(slideBeatMs('leave', 'deliberate') + 400);
		expect(screen.queryByText('2 / 2')).not.toBeNull();
		expect(holding(), 'a hold outlived the leave beat it belonged to').toBe(false);
	}, 30_000);

	it('still lets the presenter override a declared deck live', async () => {
		localStorage.setItem('lattice-present-pace', 'brisk');
		localStorage.setItem('lattice-present-slide-beat', '0'); // the live "no beat" override
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={fm('deliberate')} />);
		await press('Play the presentation');

		// The exact-millisecond override outranks the deck, so a presenter is never trapped in
		// someone else's rhythm mid-delivery. A zero beat is not a SHORT hold — the overlay
		// skips the hold entirely rather than scheduling a pointless timer — so the assertion is
		// that no hold is ever entered, while the chain still advances and speaks.
		let everHeld = false;
		const reached2 = await stepUntil(() => {
			if (holding()) everHeld = true;
			return !!screen.queryByText('2 / 2');
		});
		expect(reached2, 'the deck never advanced, so the override was not what was measured').toBe(true);
		expect(everHeld, 'a 0ms override must skip the hold, not schedule one').toBe(false);
		// And the override never leaves the machine: it is a workspace value, not front matter.
		expect(fm('deliberate')).not.toMatch(/slide-beat/);
	}, 30_000);
});
