import { act as act2, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthoring } from '@/playground/authoring-door.js';
import { PresentOverlay } from './PresentOverlay';
import { buildStageDocument } from './studio-stage';

// The module under test reads the lint core synchronously; in the app, its loader awaits this first.
beforeAll(() => loadAuthoring());


// The CONSOLE's own instruments — the next slide, the speaker notes and the talk clock
// (2026-08-24-stage-console-split.md §4). They are what the retired second presenter
// window carried; deleting that window without moving them would have quietly dropped
// three features, so this is the cell that says they came back.
//
// It lives on the PR gate deliberately. The layout half is verified on the real Studio
// (`docs/e2e/scenarios/present-run.spec.ts`), but that tier is nightly — and what is
// asserted here is not layout, it is DERIVATION: which slide the Next panel points at,
// which note is showing, and that the last slide says so instead of wrapping to slide 1.
//
// The panel is a >= lg affordance and it is gated in JS, not by a `hidden lg:flex` class,
// because it carries a live engine frame (see `useConsolePanel`). The setup's whole job
// is therefore the matchMedia stub: the shared one in `vitest.setup.ts` answers `false`
// to every query, which is the right default for the suite and means this panel would
// otherwise never render in jsdom at all.
vi.mock('@/components/DeckPreview', () => ({
	default: ({ slideIndex, 'aria-label': label }: { slideIndex?: number; 'aria-label'?: string }) => <div data-testid="dp" data-label={label} data-index={slideIndex} />,
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0, bg: '#15110d' })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const NOTE = 'Open on the ask, then pause.';
const slides = [
	`<!-- _class: title -->\n\n# One\n\nThe first slide.\n\n<!-- @note{${NOTE}} -->`,
	'<!-- _class: kpi -->\n\n# Two\n\nThe second slide.',
];

let realMatchMedia: typeof window.matchMedia;
beforeEach(() => {
	realMatchMedia = window.matchMedia;
	// A wide console: only the panel's own query matches, so nothing else in the tree
	// changes shape underneath the assertions.
	window.matchMedia = ((query: string) =>
		({
			matches: query === '(min-width: 1024px)',
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
});
afterEach(() => {
	window.matchMedia = realMatchMedia;
	localStorage.clear();
	vi.clearAllMocks();
	// A test that queues a one-off result (a rejected build) and fails before using it must not hand it to the next one.
	vi.mocked(buildStageDocument).mockReset().mockImplementation(async () => ({ doc: '', total: 0, bg: '#15110d' }) as Awaited<ReturnType<typeof buildStageDocument>>);
});

const panelOf = () => within(screen.getByRole('complementary', { name: 'Notes and next slide' }));

/**
 * Open a Stage, the way the console does, against a FAKE window.
 *
 * The presenter view is gated on a Stage existing (see `presenterView` in
 * PresentOverlay) — Present stays Present until there is a room to be separate from — so
 * every cell about notes / next slide / talk clock has to put one there first.
 *
 * jsdom has no popups, so this stands in for one: a document the controller can write
 * into, carrying the two chrome hosts its portals target, plus the `{stage:'ready'}` beat
 * the real document posts from its inline script once the fit is live. That beat is the
 * whole handshake — without it the controller never calls `onChange` and `stageHost`
 * stays null.
 */
async function openStage(user: ReturnType<typeof import('@testing-library/user-event').default.setup>) {
	const doc = document.implementation.createHTMLDocument('Stage');
	doc.body.innerHTML = '<div id="latt-chrome"><div id="latt-cc"></div><div id="latt-rail"></div></div><div id="latt-stage"></div>';
	const fake = {
		document: Object.assign(doc, { open: () => doc, write: () => {}, close: () => {} }),
		closed: false,
		focus: () => {},
		postMessage: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
	} as unknown as Window;
	const realOpen = window.open;
	window.open = (() => fake) as typeof window.open;
	await user.click(screen.getByRole('button', { name: 'Stage' }));
	window.open = realOpen;
	// The document's own `ready`, replayed. `source` is what the controller trusts — AND
	// `origin`, which it now checks first: a WindowProxy survives navigation, so `e.source`
	// alone would let a page that took the Stage over drive the deck. A real Stage is written
	// into `about:blank` and INHERITS the opener's origin, which is why `location.origin` here
	// is the faithful value rather than a convenience.
	await act2(async () => {
		window.dispatchEvent(new MessageEvent('message', { data: { stage: 'ready' }, source: fake as unknown as MessageEventSource, origin: location.origin }));
	});
	return fake;
}

// PRESENT IS PRESENT UNTIL THERE IS A ROOM.
//
// This is the cell for the thing that was built wrong. The first cut showed notes and the
// next slide from the outset at any width >= lg, which made every Present a presenter view
// whether or not anyone was presenting — and a presenter view with no audience surface is
// a third of the screen answering a question nobody asked.
//
// The rule now: Present opens as Present, morphs when a Stage opens, and reverts when it
// closes. These assert the two ends of that, because the morph cells below can only prove
// the middle — they all open a Stage first, so every one of them would keep passing if the
// gate were deleted and the panel came back unconditionally.
describe('Present — with no Stage, Present is exactly Present', () => {
	it('carries no notes, no next slide and no talk clock until a Stage exists', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Reset the talk clock' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Speaker notes' })).toBeNull();
		expect(screen.queryByText(NOTE)).toBeNull();
		// ONE live preview — the slide itself. The presenter view's Next panel mounts a
		// second engine frame, which is the cost this gate is really about.
		expect(screen.getAllByTestId('dp')).toHaveLength(1);
		// …and the things Present always had are still here, so this cell cannot pass by
		// Present having been emptied out.
		expect(screen.getByRole('button', { name: 'Stage' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Captions' })).toBeInTheDocument();
	});

	it('reverts to Present when the Stage closes', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		const fake = await openStage(user);
		expect(screen.getByRole('complementary', { name: 'Notes and next slide' })).toBeInTheDocument();
		// The document's own goodbye — the same beat a hand-closed window fires.
		await act2(async () => {
			window.dispatchEvent(new MessageEvent('message', { data: { stage: 'closed' }, source: fake as unknown as MessageEventSource, origin: location.origin }));
		});
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Reset the talk clock' })).toBeNull();
	});

	// The console lets go on the PRESS now (the presenter view, the captions and the rail move in that frame, before the
	// Stage says `ready`). So a Stage that can never show the deck must not stay open: the captions and the rail would be
	// on neither surface while the room reads "Preparing the stage…". It closes, and the console is Present again.
	it('closes a Stage whose deck fails to render, and puts the captions and the rail back in the console', async () => {
		vi.mocked(buildStageDocument).mockRejectedValueOnce(new Error('render failed'));
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
		const doc = document.implementation.createHTMLDocument('Stage');
		// The holding page the press writes ("Preparing the stage…"), which is how the controller knows the window is ours.
		doc.body.innerHTML = '<p id="latt-holding"></p>';
		let closed = false;
		const fake = {
			document: Object.assign(doc, { open: () => doc, write: () => {}, close: () => {} }),
			get closed() {
				return closed;
			},
			close: () => {
				closed = true;
			},
			focus: () => {},
			postMessage: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
		} as unknown as Window;
		const realOpen = window.open;
		window.open = (() => fake) as typeof window.open;
		await user.click(screen.getByRole('button', { name: 'Stage' }));
		window.open = realOpen;
		// No `ready` ever comes: the render rejected, so the window never got the deck.
		await vi.waitFor(() => expect(closed).toBe(true));
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stage' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('closes a Stage whose window cannot take the deck (the write throws), and puts the rail back in the console', async () => {
		vi.mocked(buildStageDocument).mockResolvedValueOnce({ doc: '<p>deck</p>', total: 2, bg: '#15110d' } as Awaited<ReturnType<typeof buildStageDocument>>);
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		const doc = document.implementation.createHTMLDocument('Stage');
		doc.body.innerHTML = '<p id="latt-holding"></p>';
		let closed = false;
		let writes = 0;
		const fake = {
			// The holding page goes in (the first write); the deck does not.
			document: Object.assign(doc, {
				open: () => doc,
				write: () => {
					if (++writes > 1) throw new Error('write failed');
				},
				close: () => {},
			}),
			get closed() {
				return closed;
			},
			close: () => {
				closed = true;
			},
			focus: () => {},
			postMessage: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
		} as unknown as Window;
		const realOpen = window.open;
		window.open = (() => fake) as typeof window.open;
		await user.click(screen.getByRole('button', { name: 'Stage' }));
		window.open = realOpen;
		await vi.waitFor(() => expect(closed).toBe(true));
		expect(writes).toBeGreaterThan(1);
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
	});

	// On a laptop the Stage document is built when Present OPENS (`stageOffered`, the launcher's own md breakpoint), so the
	// common failure is a build that rejected before the press. The press retries it: a second failure closes the window,
	// a success writes the deck. Before the retry the window waited forever on its holding page, with the console's
	// captions and rail on neither surface (the round-2 card grader reproduced it).
	const laptopMedia = () => {
		window.matchMedia = ((query: string) =>
			({
				matches: query === '(min-width: 1024px)' || query === '(min-width: 768px)',
				media: query,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			}) as unknown as MediaQueryList) as typeof window.matchMedia;
	};
	const holdingWindow = (onWrite: (html: string) => void = () => {}) => {
		const doc = document.implementation.createHTMLDocument('Stage');
		doc.body.innerHTML = '<p id="latt-holding"></p>';
		const state = { closed: false };
		const win = {
			document: Object.assign(doc, { open: () => doc, write: onWrite, close: () => {} }),
			get closed() {
				return state.closed;
			},
			close: () => {
				state.closed = true;
			},
			focus: () => {},
			postMessage: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
		} as unknown as Window;
		return { win, state };
	};

	it('retries a build that failed before the Stage press, and closes the Stage when the retry fails too', async () => {
		laptopMedia();
		vi.mocked(buildStageDocument).mockRejectedValueOnce(new Error('render failed')).mockRejectedValueOnce(new Error('render failed again'));
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		// The build that runs at open has rejected before anyone presses Stage.
		await vi.waitFor(() => expect(vi.mocked(buildStageDocument)).toHaveBeenCalledTimes(1));
		await act2(async () => {});
		const { win, state } = holdingWindow();
		const realOpen = window.open;
		window.open = (() => win) as typeof window.open;
		await user.click(screen.getByRole('button', { name: 'Stage' }));
		window.open = realOpen;
		await vi.waitFor(() => expect(state.closed).toBe(true));
		expect(vi.mocked(buildStageDocument)).toHaveBeenCalledTimes(2);
		expect(screen.getByRole('button', { name: 'Stage' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
	});

	it('retries a build that failed before the Stage press, and writes the deck when the retry succeeds', async () => {
		laptopMedia();
		vi.mocked(buildStageDocument)
			.mockRejectedValueOnce(new Error('render failed'))
			.mockResolvedValueOnce({ doc: '<p id="latt-stage">deck</p>', total: 2, bg: '#15110d' } as Awaited<ReturnType<typeof buildStageDocument>>);
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		await vi.waitFor(() => expect(vi.mocked(buildStageDocument)).toHaveBeenCalledTimes(1));
		await act2(async () => {});
		const written: string[] = [];
		const { win, state } = holdingWindow((html) => written.push(html));
		const realOpen = window.open;
		window.open = (() => win) as typeof window.open;
		await user.click(screen.getByRole('button', { name: 'Stage' }));
		window.open = realOpen;
		await vi.waitFor(() => expect(written.some((h) => h.includes('deck'))).toBe(true));
		expect(state.closed).toBe(false);
	});

	// A deck that goes in and never says `ready` (its runtime died before the handshake): neither guard above sees it,
	// because the build resolved and the write did not throw. The controller's ready deadline (`onStuck`) closes it, and
	// the captions and the rail come back to the console (the round-3 card grader found this path).
	it('closes a Stage whose deck goes in but never says ready, and puts the rail back in the console', async () => {
		let resolveBuild: (v: Awaited<ReturnType<typeof buildStageDocument>>) => void = () => {};
		vi.mocked(buildStageDocument).mockImplementationOnce(() => new Promise((done) => (resolveBuild = done)));
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		const written: string[] = [];
		const { win, state } = holdingWindow((html) => written.push(html));
		const realOpen = window.open;
		window.open = (() => win) as typeof window.open;
		await user.click(screen.getByRole('button', { name: 'Stage' }));
		window.open = realOpen;
		expect(screen.queryByRole('group', { name: /Deck progress/ })).toBeNull();
		// Only the deadline's own timers are faked, and only from here: the click above ran on real ones.
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			await act2(async () => {
				resolveBuild({ doc: '<div id="latt-stage">deck</div>', total: 2, bg: '#15110d' } as Awaited<ReturnType<typeof buildStageDocument>>);
			});
			expect(written.some((h) => h.includes('deck'))).toBe(true);
			expect(state.closed).toBe(false);
			// No `ready` comes. Short of the deadline the Stage stays; past it, it closes.
			await act2(async () => {
				vi.advanceTimersByTime(19_000);
			});
			expect(state.closed).toBe(false);
			await act2(async () => {
				vi.advanceTimersByTime(1_000);
			});
		} finally {
			vi.useRealTimers();
		}
		expect(state.closed).toBe(true);
		// The notice goes through the app's notify kernel to sonner; its history is what a presenter is shown.
		expect(toast.getHistory().map((n) => ('title' in n ? n.title : ''))).toContain('The Stage did not start, so it closed. Press Stage to try again.');
		expect(screen.getByRole('button', { name: 'Stage' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
	});

	// The keep path. A Stage that HAS gone live keeps its deck when a rebuild fails, even mid-rewrite, when `stageHost` is
	// null for the length of the new document's boot: `stageEverLiveRef` answers "was it ever live", not `stageHost`.
	it('keeps a Stage that went live when a rebuild fails during a rewrite', async () => {
		const built = (doc: string) => ({ doc, total: 2, bg: '#15110d' }) as Awaited<ReturnType<typeof buildStageDocument>>;
		vi.mocked(buildStageDocument).mockResolvedValueOnce(built('<p>deck A</p>'));
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		const { rerender } = render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		const fake = (await openStage(user)) as unknown as { closed: boolean };
		await vi.waitFor(() => expect(screen.getByRole('complementary', { name: 'Notes and next slide' })).toBeInTheDocument());
		// A change the Stage must show: the new deck goes in (a rewrite: `stageHost` drops to null until `ready`)…
		vi.mocked(buildStageDocument).mockResolvedValueOnce(built('<p>deck B</p>'));
		rerender(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} extraCss="b{}" />);
		await vi.waitFor(() => expect(vi.mocked(buildStageDocument)).toHaveBeenCalledTimes(2));
		await act2(async () => {});
		// …and before it says `ready`, the next change fails to build.
		vi.mocked(buildStageDocument).mockRejectedValueOnce(new Error('render failed'));
		rerender(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} extraCss="c{}" />);
		await vi.waitFor(() => expect(vi.mocked(buildStageDocument)).toHaveBeenCalledTimes(3));
		await act2(async () => {});
		expect(fake.closed).toBe(false);
		expect(screen.getByRole('button', { name: 'Stage' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('takes nav from the Stage — but only the four verbs, not Object.prototype', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		const fake = await openStage(user);
		const nav = async (act: string) => {
			await act2(async () => {
				window.dispatchEvent(new MessageEvent('message', { data: { stage: 'nav', act }, source: fake as unknown as MessageEventSource, origin: location.origin }));
			});
		};

		// The Stage drives: a gesture there posts an ACTION and the console moves.
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
		await nav('next');
		expect(screen.getByText('2 / 2')).toBeInTheDocument();
		await nav('prev');
		expect(screen.getByText('1 / 2')).toBeInTheDocument();

		// …and NOTHING else dispatches. `act` arrives on a postMessage and the table is a plain
		// object, so an unguarded `NAV[act]` reaches Object.prototype.
		//
		// THIS IS ASSERTED WITH A POLLUTED PROTOTYPE, not with `constructor`/`toString`. The
		// first draft looped those and checked the deck had not moved — and PASSED with the
		// guard deleted, because calling `Object()` does not move a deck either. "Nothing
		// happened" is trivially true when the thing you dispatched is inert; the cell has to
		// dispatch something that REPORTS being called. That is also the real threat model:
		// this lookup only matters if something reachable on the prototype does something,
		// which is what prototype pollution arranges.
		let pwned = 0;
		Object.defineProperty(Object.prototype, 'pwned', { value: () => { pwned += 1; }, configurable: true, writable: true });
		try {
			await nav('pwned');
			expect(pwned, 'a polluted prototype key must not be dispatchable from a Stage message').toBe(0);
			for (const act of ['constructor', 'toString', 'valueOf', '__proto__', 'goNext', '']) {
				await nav(act);
				expect(screen.getByText('1 / 2'), `"${act}" must not move the deck`).toBeInTheDocument();
			}
		} finally {
			// Restore the prototype this cell poisoned, whatever happened above.
			delete (Object.prototype as unknown as Record<string, unknown>).pwned;
		}
	});

	it('offers a rail toggle that governs the rail wherever it lives', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		// It sits with CC and Guide and means the same kind of thing: show or hide a piece
		// of AUDIENCE chrome. Default on — deck progress is the one piece a room reads
		// without being told to.
		const rail = screen.getByRole('button', { name: /Progress rail on/ });
		expect(rail).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('group', { name: /Deck progress/ })).toBeInTheDocument();
		await user.click(rail);
		expect(screen.getByRole('button', { name: /Progress rail off/ })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByRole('group', { name: /Deck progress/ })).toBeNull();
	});
});

describe('Present — the console keeps the instruments the second window carried', () => {
	it('shows THIS slide\'s note and renders the NEXT slide, not the current one', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={0} />);
		await openStage(user);
		const panel = panelOf();
		expect(panel.getByText(NOTE)).toBeInTheDocument();
		// The index is the load-bearing bit: a Next panel pointed at `clamped` would look
		// perfectly fine and show the slide the presenter is already looking at.
		const next = panel.getByTestId('dp');
		expect(next.getAttribute('data-label')).toBe('Next slide preview');
		expect(next.getAttribute('data-index')).toBe('1');
	});

	it('says the deck has ended rather than wrapping the preview to slide 1', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} startIndex={1} />);
		await openStage(user);
		const panel = panelOf();
		expect(panel.getByText('End of the deck')).toBeInTheDocument();
		expect(panel.queryByTestId('dp')).toBeNull();
		// And a slide with no note says so, rather than leaving the last slide's note up —
		// which on a talk track is worse than blank, because it reads as still current.
		expect(panel.getByText('No speaker notes on this slide.')).toBeInTheDocument();
	});

	it('does not render the panel — or its engine frame — on a narrow console', () => {
		window.matchMedia = realMatchMedia; // the suite default: nothing matches
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);
		expect(screen.queryByRole('complementary', { name: 'Notes and next slide' })).toBeNull();
		// ONE live preview, not two. A CSS-hidden panel would still mount its frame, which
		// is the cost this gate is really about on the device least able to spare it.
		expect(screen.getAllByTestId('dp')).toHaveLength(1);
	});

	it('offers a talk clock whose reset ARMS before it wipes', async () => {
		const { default: userEvent } = await import('@testing-library/user-event');
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} />);
		await openStage(user);
		const reset = screen.getByRole('button', { name: 'Reset the talk clock' });
		await user.click(reset);
		// The label changes because the ACTION changed — the second press does something
		// the first did not. Everywhere else on this bar `aria-pressed` carries state and
		// the name is stable; this is the one control where a stable name would be the lie.
		expect(screen.getByRole('button', { name: 'Confirm reset of the talk clock' })).toBeInTheDocument();
	});
});

// ── the console's own <style> sink ───────────────────────────────────────────
//
// The console injects `STAGE_CHROME_CSS` into ITS document so one PresentCaption and one
// PresentRail render correctly in either host. That element is a genuine stylesheet sink and
// NO ARM OF HARD RULE #22 CAN SEE IT: `checkDocumentStyleSinks` keys on a doctype opener and
// this assembles no document; `checkPreviewHtmlSinks` keys on the split runtime-`<script>`
// idiom and this is no preview builder; `checkCssTreeRewrapSinks` wants a CSS serializer and
// there is none. So the safety is structural — a JSX TEXT CHILD sets `textContent`, where a
// `</style>` carried in theme or author CSS is inert — or it is nothing at all.
//
// Structural safety with no gate behind it is one careless edit from gone, and the edit that
// would end it is a one-word swap back to `dangerouslySetInnerHTML` that reviews as a
// no-op. This is the same reasoning as `test/unit/export/style-guard-census.test.js`: the
// #22 gates are text matchers, so what they cannot see needs a pin of its own. It reads the
// source because the hazard is in the SOURCE — a rendered `<style>` looks identical either
// way, so no behavioral assertion can tell the two apart.
describe('PresentOverlay — the audience-chrome stylesheet is a text child', () => {
	it('never reaches the DOM through dangerouslySetInnerHTML', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		// From the vitest root (`docs/`), not `import.meta.url` — under Vite that is an http
		// URL, not a file one, and `fileURLToPath` throws on it.
		const src = readFileSync(join(process.cwd(), 'src/components/studio/PresentOverlay.tsx'), 'utf8');
		// The sink itself, in the shape that makes the terminator inert.
		expect(src).toContain('<style>{STAGE_CHROME_CSS}</style>');
		// And no `<style>` anywhere in this file takes parsed markup. Deliberately scoped to
		// `<style` rather than banning the prop outright: it has legitimate uses elsewhere in
		// a React tree, and a rule that fires on those would be turned off rather than obeyed.
		const parsedStyle = /<style[^>]*\bdangerouslySetInnerHTML/.test(src);
		expect(parsedStyle).toBe(false);
	});
});
