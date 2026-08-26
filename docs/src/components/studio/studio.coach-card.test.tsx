import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// The Coach quick-read card's ASYNC seams. `theAsk`, `structureCheck` and `pacing(src, minutes)`
// all await a lazily-imported chunk, so a click stays in flight long enough for the user to act
// again — and what they do inside that window is where the card misbehaves. Gating that promise
// makes the window a controllable state instead of a race; none of these defects is reachable
// from a normal click. Complements studio.coach-card-race.test.tsx (#1831), which hand-releases
// the ASSESSMENT round; this file hand-releases the CHIP.
const { askGate } = vi.hoisted(() => ({ askGate: { promise: Promise.resolve() as Promise<void>, release: () => {} } }));
function armAskGate() {
	askGate.promise = new Promise<void>((res) => {
		askGate.release = () => res();
	});
}
vi.mock('./coach/coach-core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./coach/coach-core')>();
	return {
		...actual,
		theAsk: async (src: string) => { await askGate.promise; return actual.theAsk(src); },
		// Only the minutes-bearing call awaits the chunk; gate that one.
		pacing: async (src: string, min?: number) => { if (min) await askGate.promise; return actual.pacing(src, min); },
	};
});
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'q3-board', title: 'Q3 Board Review', builtin: true }]));
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
	// A FRESH gate per test. One module-scoped promise is single-use: the first test to release it
	// leaves every later one with no in-flight window, so the race they exist to pin never happens
	// and they pass vacuously. Caught by mutation, not by reading.
	armAskGate();
});

/** The open card's Close control — its only unambiguous handle, since a findings-derived card's
 *  TITLE is identical to the chip that opens it ("Top fixes"), so a text query matches the button
 *  and passes whether or not a card exists. */
function openCard(): HTMLElement | undefined {
	return screen.queryAllByRole('button', { name: 'Close' }).find((b) => b.parentElement?.firstElementChild?.tagName === 'SPAN');
}
function openCardTitle(): string | null {
	return openCard()?.parentElement?.firstElementChild?.textContent ?? null;
}
function openCardBody(): string {
	return openCard()?.closest('div')?.parentElement?.querySelector('ul')?.textContent ?? '';
}
async function setup(assessable = true) {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	await screen.findByLabelText('Deck source', undefined, { timeout: 15000 });
	fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
	// Let the deck SETTLE before any chip is clicked, and wait on a signal that the ASSESSMENT
	// finished rather than on the editor mounting. Two effects from #1840 will otherwise clear a
	// card out from under these tests, both correctly: `source` is assigned as the deck loads,
	// and the settling findings round makes a `top`/`weak` card stale. Neither is what this file
	// is about, so wait them out first.
	//
	// The signal differs by deck, and picking the wrong one is silent: an unassessable deck never
	// renders the "Assessing" skeleton at all, so waiting for that to disappear returns instantly
	// and settles nothing.
	// The "assessment landed" signal. This was `/\/ 100/` — the single grade's "NN / 100"
	// readout — which the Craft/Style split removed, so every wait here burned its 15 s
	// timeout. `STYLE` is the stable landmark now: it is rendered only once the real
	// scorecard resolves, and never for an unassessable deck.
	// The "assessment landed" signal. This was `/\/ 100/` — the single grade's "NN / 100"
	// readout — which the Craft/Style split removed, so every wait here burned its 15 s
	// timeout. The Style tile's label is the stable landmark now. Match the DOM text
	// ('Style'), not the rendered text: the panel uppercases it in CSS, and Testing
	// Library reads the DOM.
	await waitFor(() => expect(screen.getByText(assessable ? /^Style$/ : /Add a slide or two/i)).toBeInTheDocument(), { timeout: 15000 });
	if (!assessable) {
		// An unassessable deck has no post-round signal in the DOM: the Deck read placeholder
		// renders off `deckHasContent`, which is false from the first render, so waiting for it
		// proves only that the component mounted. The round still has to finish before the chips
		// can honestly say the deck was not assessed, so wait out the 400ms assessment debounce
		// and its async pass. A bounded wait rather than a signal, because there is no signal —
		// the assertions that follow are about the card's WORDS, and each is mutation-checked, so
		// this cannot quietly turn into a test that passes on broken code.
		await new Promise((r) => setTimeout(r, 1200));
	}
	return user;
}

describe('Coach quick-read card — what happens during an in-flight chip', () => {
	it('a card the user CLOSED does not come back when a slow chip finally answers', async () => {
		const user = await setup();
		await user.click(await screen.findByRole('button', { name: 'The ask' }));
		await user.click(screen.getByRole('button', { name: 'Top fixes' }));
		await waitFor(() => expect(openCardTitle()).toBe('Top fixes'), { timeout: 15000 });
		await user.click(openCard() as HTMLElement);
		expect(openCardTitle()).toBeNull();
		askGate.release();
		await new Promise((r) => setTimeout(r, 600));
		expect(openCardTitle()).toBeNull();
	}, 40000);

	it('a slow chip does not overwrite the chip the user clicked after it', async () => {
		const user = await setup();
		await user.click(await screen.findByRole('button', { name: 'The ask' }));
		await user.click(screen.getByRole('button', { name: 'Weakest slide' }));
		await waitFor(() => expect(openCardTitle()).toBe('Weakest slide'), { timeout: 15000 });
		askGate.release();
		await new Promise((r) => setTimeout(r, 600));
		expect(openCardTitle()).toBe('Weakest slide');
	}, 40000);

	it('closing the panel cancels the in-flight chip that is still the latest one', async () => {
		const user = await setup();
		// The chip in flight is the MOST RECENT one, so "a later click superseded it" cannot save
		// us — only Close itself can, which is why Close bumps the token rather than just nulling.
		await user.click(await screen.findByRole('button', { name: 'Top fixes' }));
		await waitFor(() => expect(openCardTitle()).toBe('Top fixes'), { timeout: 15000 });
		await user.click(screen.getByRole('button', { name: 'The ask' }));
		await user.click(openCard() as HTMLElement);
		expect(openCardTitle()).toBeNull();
		askGate.release();
		await new Promise((r) => setTimeout(r, 600));
		expect(openCardTitle()).toBeNull();
	}, 40000);

	// The Pacing minutes input is a FIFTH `setCoachCard` writer and the only path that produces a
	// real pacing verdict. A guard covering the other four leaves both defects above fully
	// reproducible through it.
	async function submitMinutes(user: ReturnType<typeof userEvent.setup>) {
		await user.click(await screen.findByRole('button', { name: 'Pacing' }));
		const input = await screen.findByLabelText('Talk length in minutes', {}, { timeout: 15000 });
		await user.click(input);
		await user.keyboard('20{Enter}');
	}

	it('a dismissed card is not resurrected by a slow PACING answer', async () => {
		const user = await setup();
		await submitMinutes(user);
		await user.click(openCard() as HTMLElement);
		expect(openCardTitle()).toBeNull();
		askGate.release();
		await new Promise((r) => setTimeout(r, 600));
		expect(openCardTitle()).toBeNull();
	}, 40000);

	it('a slow PACING answer does not overwrite the chip clicked after it', async () => {
		const user = await setup();
		await submitMinutes(user);
		await user.click(screen.getByRole('button', { name: 'Top fixes' }));
		await waitFor(() => expect(openCardTitle()).toBe('Top fixes'), { timeout: 15000 });
		askGate.release();
		await new Promise((r) => setTimeout(r, 600));
		expect(openCardTitle()).toBe('Top fixes');
	}, 40000);
});

// A deck with NO `<!-- _class: -->` anywhere — an imported .md, or a starter whose class line the
// author deleted. `hasContent` gates assessment on that directive (deliberately: `hasContent('hello')`
// is false by contract under K1), so such a deck is never assessed and `findings` stays `[]` — which
// the findings-derived chips reported as a clean bill of health.
describe('Coach quick-read card — a deck with no _class directives', () => {
	beforeEach(() => {
		// JSON-encoded: `loadSource` parses this key, and a raw string silently falls back to the
		// built-in deck — which HAS `_class` directives, so the test would pass while exercising
		// the opposite of what it names. Caught by mutation; reading it never would have.
		localStorage.setItem(
			'lattice-studio-src-q3-board',
			JSON.stringify('# Quarterly update\n\n---\n\n## Progress\n\nWe shipped the thing.\n\n---\n\n## Next steps\n\nDecide on budget.\n'),
		);
	});

	it('the Top fixes card does not congratulate a deck nobody assessed', async () => {
		const user = await setup(false);
		await user.click(await screen.findByRole('button', { name: 'Top fixes' }));
		await waitFor(() => expect(openCardTitle()).toBe('Top fixes'), { timeout: 15000 });
		expect(openCardBody()).not.toMatch(/every slide follows/i);
		// It says the true thing, and agrees with the Deck read card beside it, which also
		// reports the deck as unassessed rather than grading it.
		expect(openCardBody()).toMatch(/haven.t assessed this deck/i);
	}, 40000);

	it('the Structure card still answers on a class-less deck', async () => {
		const user = await setup(false);
		// `structureCheck` reads the source directly and treats a bare `# Heading` as an opening
		// slide, so it is honest here and must NOT be suppressed along with the other two.
		await user.click(await screen.findByRole('button', { name: 'Structure' }));
		await waitFor(() => expect(openCardTitle()).toBe('Structure check'), { timeout: 15000 });
		expect(openCardBody()).toMatch(/Opening/i);
	}, 40000);
});
