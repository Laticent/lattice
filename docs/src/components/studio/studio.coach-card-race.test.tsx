import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// The Coach's quick-read card vs. the deck assessment that lands behind it (#1831).
//
// `assessDeck` is debounced 400ms and async, so a round is almost always IN FLIGHT while
// the author is doing something else. Its result is a fresh `findings` array every time —
// new identity even when the deck and its findings are unchanged — and the housekeeping
// effect keyed on that array used to clear the quick-read card unconditionally. So a chip
// clicked while a round was in flight had its card wiped a few milliseconds later by a
// round that had nothing to say about it.
//
// That is what the `studio.controls` Coach test was hitting: instrumented on an idle box,
// the settling round landed 25-30ms before the chip click — under load it lands after, the
// card is inserted and removed inside one task, and the `findByText` that follows never
// sees it. A budget cannot fix a card that is gone; only the clear can.
//
// Timing is the whole subject, so the round is HAND-RELEASED here rather than raced.

vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

// PER-TEST, not per-file. A single hoisted promise is resolved forever once the first test
// releases it, so tests 2 and 3 would run against an UNPARKED assessment that lands somewhere
// near their click — reintroducing, inside the regression test, the exact race this file
// exists to pin. It passed locally and failed in CI on the second case. `reset()` in
// `beforeEach` gives every test its own parked round. (#1812's class, one file later.)
const gate = vi.hoisted(() => {
	let open: () => void = () => {};
	let parked: Promise<void> = Promise.resolve();
	return {
		reset() {
			parked = new Promise<void>((resolve) => {
				open = resolve;
			});
		},
		wait: () => parked,
		release: () => open(),
	};
});

// A distinctive finding + band so "the round landed" and "the card is the findings one"
// are both observable in the DOM, not inferred from timing. The finding is written inline:
// a `vi.mock` factory is hoisted above every module-scope const, so it cannot read one.
vi.mock('./coach/coach-core', () => ({
	assessDeck: vi.fn(async () => {
		await gate.wait();
		return { hasContent: true, scorecard: { overall: 82, band: 'B+', categories: [] }, findings: [{ slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' }] };
	}),
	rankFindings: (f: unknown[]) => f,
	topFixes: () => ({ title: 'Top fixes', body: ['Too many words on this slide. (slide 2)'] }),
	weakestSlide: () => ({ title: 'Weakest slide', body: ['Slide 2 has the most to fix:'] }),
	theAsk: async () => ({ title: 'The ask', body: ['No clear ask.'] }),
	pacing: async () => ({ title: 'Pacing', body: ['6 slides.'] }),
	structureCheck: async () => ({ title: 'Structure check', body: ['✓ Opening / title slide'] }),
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

beforeEach(() => {
	gate.reset();
	localStorage.clear();
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'q3-board', title: 'Q3 Board Review', builtin: true }]));
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
});

/** Same explicit budget, same reason, as `studio.controls.test.tsx`: this waits on Vite
 *  transforming CodeMirror on first use in the file, not on a state update. */
async function openCoach() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	await screen.findByLabelText('Deck source', undefined, { timeout: 15000 });
	fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
	return user;
}

/** Let the parked assessment through and wait for its result to be COMMITTED — the real
 *  scorecard band is the shell's own proof the round landed, so nothing here sleeps. */
async function landTheRound() {
	gate.release();
	await screen.findByText('B+');
}

describe('Studio Coach — a quick read survives the assessment round behind it', () => {
	it('a source-derived card is NOT cleared by a findings round that says nothing about it', async () => {
		const user = await openCoach();
		// Click the chip while the round is still parked — the author's real position inside
		// the 400ms debounce.
		await user.click(await screen.findByRole('button', { name: 'Structure' }));
		expect(await screen.findByText('Structure check')).toBeInTheDocument();

		await landTheRound();

		// `structureCheck` reads the deck source and nothing else, and the source has not
		// moved — so the card is still true, and still on screen. Before #1831 the round
		// wiped it here.
		expect(screen.getByText('Structure check')).toBeInTheDocument();
		expect(screen.getByText('✓ Opening / title slide')).toBeInTheDocument();
	});

	it('a findings-derived card IS still cleared when a round lands', async () => {
		const user = await openCoach();
		await user.click(await screen.findByRole('button', { name: 'Top fixes' }));
		// Assert the CARD BODY, not the title — the chip that opens it carries the same words.
		expect(await screen.findByText('Too many words on this slide. (slide 2)')).toBeInTheDocument();

		await landTheRound();

		// `topFixes` is computed from the findings array the round just replaced, so this one
		// genuinely is stale. Narrowing the clear must not have removed that.
		await waitFor(() => expect(screen.queryByText('Too many words on this slide. (slide 2)')).not.toBeInTheDocument());
	});

	it('editing the deck clears the card at the keystroke, not a debounce later', async () => {
		const user = await openCoach();
		await user.click(await screen.findByRole('button', { name: 'Structure' }));
		expect(await screen.findByText('Structure check')).toBeInTheDocument();

		// A quick read is a read of the DECK; moving the deck is what makes it stale. That is
		// `source`, which changes with the keystroke — where the findings round trails it by
		// the debounce and used to be what did the clearing.
		await user.click(screen.getByLabelText('Deck source'));
		await user.paste('\n\n---\n\n# A new slide\n');
		// SYNCHRONOUS, deliberately — no `waitFor`. A `waitFor` here would pass on the old
		// behavior too, since the findings round clears it ~400ms later either way, and the
		// test would have asserted nothing beyond "eventually". `setSource` is called straight
		// out of CodeMirror's `updateListener` with no debounce (`Editor.tsx`), so by the time
		// `paste` has settled the clear has already happened — and if this ever regresses to
		// riding the findings round, this line is what catches it.
		expect(screen.queryByText('Structure check')).not.toBeInTheDocument();
	});
});
