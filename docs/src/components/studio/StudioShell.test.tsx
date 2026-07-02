import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Most flows here exercise the FULL-density Studio against the original deck set
// (the 6-slide "Q3 Board Review" active). Seed a returning-user state — the saved
// deck index without the newcomer welcome deck, plus onboarded:true — which is the
// real shape for anyone who has used the Studio before. The fresh first-run state
// (welcome deck + reduced density + welcome banner) is covered separately below.
function seedReturningUser() {
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
		{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
		{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
	]));
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
}

// The live preview loads the real engine by polling `window.LatticePlayground`
// on a timer that never resolves in jsdom and leaks past teardown. These tests
// assert shell behavior (text, labels, navigation), not the rendered slide, so
// stub DeckPreview to a static element — also covers its use in Present/Fabricate.
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

// The Share exporters drive the engine render + heavy lazy chunks (jspdf, jszip,
// pptxgenjs) — out of scope for a jsdom shell test. Mock them so we assert the
// WIRING (the right export runs on the right click) without booting the engine.
const shareSpies = vi.hoisted(() => ({
	shareMarkdown: vi.fn(async () => {}),
	shareMarp: vi.fn(async () => {}),
	sharePdf: vi.fn(
		async (
			_options: unknown,
			_source: string,
			_name: string,
			_palette: string,
			_mode: 'light' | 'dark',
			_extra?: { name: string; css: string },
			_onStatus?: (m: string) => void,
			_extraCss?: string,
		) => {},
	),
	sharePptx: vi.fn(async () => {}),
	sharePrintDeck: vi.fn(async () => {}),
	sharePrintSource: vi.fn(() => {}),
}));
vi.mock('./share-export', () => shareSpies);

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

const realMatchMedia = window.matchMedia;
// Force the responsive hook down a given branch: mobile matches both queries,
// tablet only the 1099 query, desktop neither (the hook checks 699 then 1099).
function setViewport(bp: 'desktop' | 'tablet' | 'mobile') {
	window.matchMedia = ((q: string) =>
		({
			matches: bp === 'mobile' ? /699|1099/.test(q) : bp === 'tablet' ? /1099/.test(q) : false,
			media: q,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		})) as typeof window.matchMedia;
}

beforeEach(() => {
	localStorage.clear();
	seedReturningUser();
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	window.matchMedia = realMatchMedia;
	localStorage.clear();
});

function setup() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	return user;
}

describe('StudioShell — smoke', () => {
	it('renders the lean bar, the active deck, and the three Compose panes', () => {
		setup();
		expect(screen.getByText('Lattice')).toBeInTheDocument();
		expect(screen.getByText('Q3 Board Review')).toBeInTheDocument();
		expect(screen.getByText('Architect')).toBeInTheDocument();
		expect(screen.getByText('Board-ready')).toBeInTheDocument();
		expect(screen.getByText('Edit')).toBeInTheDocument();
		expect(screen.getByText('Preview')).toBeInTheDocument();
		// Present is a verb (button), not a persistent tab.
		expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument();
	});
});

describe('StudioShell — newcomer first run', () => {
	it('opens on the welcome deck with reduced density and a one-time cue', () => {
		localStorage.clear(); // a true fresh visitor — no seed, no prior use
		render(<StudioShell options={options} />);
		// The crafted intro deck is the active deck.
		expect(screen.getByText('Welcome to Lattice')).toBeInTheDocument();
		// Reduced density: the Architect coach is NOT open by default.
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		// A one-time welcome cue points the way.
		expect(screen.getByText(/New here\?/)).toBeInTheDocument();
	});

	it('dismissing the welcome graduates the user and persists it', async () => {
		localStorage.clear();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await user.click(screen.getByRole('button', { name: 'Got it' }));
		expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').onboarded).toBe(true);
	});

	it('treats a returning user (prior Studio use) as already onboarded — no cue', () => {
		// beforeEach already seeded a returning-user state.
		render(<StudioShell options={options} />);
		expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
		expect(screen.getByText('Board-ready')).toBeInTheDocument();
		// A returning user sees the full topbar (advanced surfaces present).
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
	});

	it('hides the advanced topbar cluster for a newcomer, revealing it on graduation', async () => {
		localStorage.clear(); // fresh visitor
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// Advanced surfaces are out of the way on first run.
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Workspace settings' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Enter focus mode' })).not.toBeInTheDocument();
		// Engaging (dismissing the welcome) graduates them → the cluster appears.
		await user.click(screen.getByRole('button', { name: 'Got it' }));
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Enter focus mode' })).toBeInTheDocument();
	});
});

describe('StudioShell — e2e flows (jsdom)', () => {
	it('opens and closes Present (the verb)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		expect(await screen.findByText('Presenter screen')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Exit present' }));
		expect(screen.queryByText('Presenter screen')).not.toBeInTheDocument();
	});

	it('Present navigates the deck and reshapes by reader lens', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		const dialog = await screen.findByRole('dialog', { name: 'Present' });
		const d = within(dialog);
		// Full deck, started on slide 1 of 6.
		expect(d.getByText('1 / 6')).toBeInTheDocument();
		await user.click(d.getAllByRole('button', { name: 'Next slide' })[0]);
		expect(d.getByText('2 / 6')).toBeInTheDocument();
		// Exec-summary lens reshapes to the headline slides (title/kpi/stats/closing).
		await user.click(d.getByRole('button', { name: /Exec summary/ }));
		expect(d.getByText('1 / 4')).toBeInTheDocument();
		// One-pager collapses to a single slide.
		await user.click(d.getByRole('button', { name: /One-pager/ }));
		expect(d.getByText('1 / 1')).toBeInTheDocument();
	});

	it('Present opens the slide sorter and jumps from a thumbnail', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		const dialog = await screen.findByRole('dialog', { name: 'Present' });
		const d = within(dialog);
		expect(d.getByText('1 / 6')).toBeInTheDocument();
		// Open the sorter — a thumbnail per slide of the full deck.
		await user.click(d.getByRole('button', { name: /Slides/ }));
		const sorter = within(await screen.findByRole('dialog', { name: 'Slide overview' }));
		expect(sorter.getByText('All slides — 6')).toBeInTheDocument();
		// Jump to slide 4 → the sorter closes and Present is on that slide.
		await user.click(sorter.getByRole('button', { name: 'Slide 4' }));
		expect(screen.queryByRole('dialog', { name: 'Slide overview' })).not.toBeInTheDocument();
		expect(d.getByText('4 / 6')).toBeInTheDocument();
	});

	it('opens the deck-scoped Share with both hand-off intents', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Share' }));
		expect(await screen.findByText('Hand off the deck')).toBeInTheDocument();
		expect(screen.getByText('Hand off the source')).toBeInTheDocument();
		expect(screen.getByText('Print deck')).toBeInTheDocument();
		expect(screen.getByText('Print source')).toBeInTheDocument();
	});

	it('Share runs the REAL export pipeline for every format', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Share' }));
		const sheet = within(await screen.findByRole('dialog', { name: /Share/ }));
		// Markdown → the real source handoff, confirmed with a success toast.
		await user.click(sheet.getByText('Markdown'));
		expect(shareSpies.shareMarkdown).toHaveBeenCalled();
		expect(await screen.findByText(/Markdown ready/)).toBeInTheDocument();
		// The rendered-artifact actions each run their own exporter (not a toast).
		await user.click(sheet.getByText('PDF'));
		expect(shareSpies.sharePdf).toHaveBeenCalled();
		// G8: the export must receive a REAL onStatus (7th arg) — the Studio used to
		// pass `undefined`, so a multi-second export gave no per-slide progress.
		expect(typeof shareSpies.sharePdf.mock.calls.at(-1)?.[6]).toBe('function');
		await user.click(sheet.getByText('PowerPoint'));
		expect(shareSpies.sharePptx).toHaveBeenCalled();
		await user.click(sheet.getByText('Marp bundle'));
		expect(shareSpies.shareMarp).toHaveBeenCalled();
		await user.click(sheet.getByText('Print source'));
		expect(shareSpies.sharePrintSource).toHaveBeenCalled();
	});

	it('Share → Present link opens Present', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Share' }));
		await user.click(await screen.findByText('Present link'));
		expect(await screen.findByText('Presenter screen')).toBeInTheDocument();
	});

	it('opens Workspace settings ("your setup") with the REAL model status + tabs', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace settings' }));
		const sheet = within(await screen.findByRole('dialog', { name: /Workspace/ }));
		// Default tab = AI: the Model section leads with a Generation switch (Cloud /
		// On-device) that picks the active tier. With no model in the test env, nothing is
		// active yet, and the Cloud pane offers a one-click Connect affordance.
		expect(sheet.getByText('Model')).toBeInTheDocument();
		expect(sheet.getByRole('tab', { name: 'On-device' })).toBeInTheDocument();
		expect(sheet.getByText(/No tier active yet/)).toBeInTheDocument();
		expect(sheet.getByRole('button', { name: /Connect OpenRouter/ })).toBeInTheDocument();
		// The Spend section (same tab) shows real (zero) session spend, not a fabricated
		// figure. With no model connected there's no authoritative account line — only the
		// honest live session tally ($0.00) plus a prompt to connect for the balance. (The
		// old broken local "all-time $0.00" card is gone — that was the bug G6 fixed.)
		expect(await sheet.findByText(/No model connected/)).toBeInTheDocument();
		expect(sheet.getByText('This session')).toBeInTheDocument();
		expect(sheet.getByText(/Connect OpenRouter .* to see your real balance/)).toBeInTheDocument();
		// The Instructions section (same tab) — the textarea persists to localStorage.
		const ta = await sheet.findByRole('textbox', { name: 'Standing instructions' });
		await user.clear(ta);
		await user.type(ta, 'Be terse.');
		expect(ta).toHaveValue('Be terse.');
		expect(localStorage.getItem('lattice-studio-instructions')).toBe('Be terse.');
		expect(sheet.queryByText('Active generation tier')).not.toBeInTheDocument();
	});

	it('expands the Deck Inspector ("this deck") from its collapsed rail', async () => {
		const user = setup();
		expect(screen.queryByText('this deck')).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Toggle Deck inspector' }));
		expect(await screen.findByText('this deck')).toBeInTheDocument();
		expect(screen.getByText('Lenses')).toBeInTheDocument();
	});

	it('the Inspector "Inline validation" toggle has real teeth', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Toggle Deck inspector' }));
		const sw = await screen.findByRole('switch', { name: 'Inline validation' });
		expect(sw).toBeChecked();
		await user.click(sw);
		expect(sw).not.toBeChecked();
		expect(await screen.findByText(/Inline validation off/)).toBeInTheDocument();
	});

	it('reaches Fabricate from the launcher (not a deck mode)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		expect(await screen.findByPlaceholderText(/Describe a look/i)).toBeInTheDocument();
		expect(screen.getByText('Essentials')).toBeInTheDocument();
	});

	it('switches decks from the deck switcher', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		await user.click(await screen.findByText('FY26 Product Strategy'));
		expect(screen.getByRole('button', { name: /FY26 Product Strategy/ })).toBeInTheDocument();
	});

	it('shows a live, deck-reactive Architect scorecard', () => {
		setup();
		// The default deck is clean + varied + titled → the readiness rows reflect it.
		expect(screen.getByText('Board-ready')).toBeInTheDocument();
		expect(screen.getByText('Components valid')).toBeInTheDocument();
		expect(screen.getByText('Opens with a title')).toBeInTheDocument();
		expect(screen.getByText('Variety')).toBeInTheDocument();
		// A clean deck reads READY (the color-independent pass tag), not FIX.
		expect(screen.getByText('READY')).toBeInTheDocument();
		expect(screen.queryByText('FIX')).not.toBeInTheDocument();
	});

	it('a reader lens reshapes the Compose preview, and clears back to full', async () => {
		const user = setup();
		expect(screen.getByText('Slide 1 / 6')).toBeInTheDocument();
		// The Architect's "Exec summary" reshapes the preview to the headline slides.
		await user.click(screen.getByText('Exec summary'));
		expect(await screen.findByText('Slide 1 / 4')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Clear reader lens' })).toBeInTheDocument();
		// Clearing returns to the full deck.
		await user.click(screen.getByRole('button', { name: 'Clear reader lens' }));
		expect(await screen.findByText('Slide 1 / 6')).toBeInTheDocument();
	});

	it('jumps to any slide from the navigator rail', async () => {
		const user = setup();
		// The Q3 deck opens on slide 1 (the title).
		expect(screen.getByText('Slide 1 / 6')).toBeInTheDocument();
		// Jump straight to slide 4 (the quote) via its navigator chip.
		await user.click(screen.getByRole('button', { name: 'Slide 4 — quote' }));
		expect(await screen.findByText('Slide 4 / 6')).toBeInTheDocument();
	});
});

describe('StudioShell — responsive layout', () => {
	it('mobile: collapses to one swappable Edit/Preview pane', async () => {
		setViewport('mobile');
		const user = setup();
		// Preview is the default pane — its slide nav is visible, the editor's
		// Markdown badge is not (the panes never co-exist on mobile).
		expect(await screen.findByText(/Slide \d+ \//)).toBeInTheDocument();
		expect(screen.queryByText('Markdown')).not.toBeInTheDocument();
		// Architect is NOT a persistent column on mobile.
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		// Swap to the editor pane.
		await user.click(screen.getByRole('button', { name: 'Edit' }));
		expect(await screen.findByText('Markdown')).toBeInTheDocument();
		expect(screen.queryByText(/Slide \d+ \//)).not.toBeInTheDocument();
	});

	it('mobile: the Architect opens as a slide-in sheet', async () => {
		setViewport('mobile');
		const user = setup();
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Toggle Architect' }));
		expect(await screen.findByText('Board-ready')).toBeInTheDocument();
	});

	it('tablet: panels are sheets, both closed by default', async () => {
		setViewport('tablet');
		const user = setup();
		// Both panes share the row; neither panel is docked open.
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		expect(screen.queryByText('this deck')).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Toggle Deck inspector' }));
		expect(await screen.findByText('this deck')).toBeInTheDocument();
	});
});

describe('StudioShell — topbar information architecture', () => {
	it('desktop: theme + light/dark are both directly on the bar (the Appearance segment)', () => {
		// jsdom defaults to the desktop tier — the grouped segment shows both controls.
		setup();
		expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
		// Desktop keeps the full bar — no ⋯ overflow, and Library/Workspace are primary.
		expect(screen.queryByRole('button', { name: 'More controls' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
		// The ⌘K pill is a desktop affordance.
		expect(screen.getByRole('button', { name: 'Search or run a command' })).toBeInTheDocument();
	});

	it('compact: secondary controls fold into ⋯ while mode + panel toggles stay primary', () => {
		setViewport('tablet');
		setup();
		// The mode toggle stays a direct 1-tap button; the panel toggles stay primary.
		expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Toggle Architect' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Toggle Deck inspector' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
		// The genuinely-secondary controls leave the bar: the theme picker, Library,
		// Workspace, and the desktop ⌘K pill are no longer direct bar buttons…
		expect(screen.queryByRole('button', { name: 'Theme' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Workspace settings' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Search or run a command' })).not.toBeInTheDocument();
		// …they live behind a single ⋯ overflow.
		expect(screen.getByRole('button', { name: 'More controls' })).toBeInTheDocument();
	});

	it('compact: ⋯ holds the theme picker (inline, not a side submenu), Library, Workspace, and a Search/commands row', async () => {
		setViewport('tablet');
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		expect(screen.getByRole('menuitem', { name: 'Library' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Workspace settings' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: /Search \/ commands/ })).toBeInTheDocument();
		// The theme swatches are inline in the SAME menu — a single scroll region, not a
		// side-opening submenu (which overflows a phone viewport). Picking one is one tap.
		expect(await screen.findByRole('menuitem', { name: 'Indaco' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Onyx' })).toBeInTheDocument();
	});

	it('compact: the ⋯ Search/commands row opens the command palette', async () => {
		setViewport('tablet');
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		await user.click(await screen.findByRole('menuitem', { name: /Search \/ commands/ }));
		// The cmdk palette surfaces — its search box is the proof the row is wired.
		expect(await screen.findByPlaceholderText(/Search|command/i)).toBeInTheDocument();
	});

	it('compact: opening ⋯ then resizing to desktop and back leaves it closed (H4)', async () => {
		// A matchMedia that starts compact and can flip to desktop, firing the hook's
		// listeners so `compact` actually changes (the shared stub is a no-op on change).
		// Only the breakpoint media queries feed `listeners` (other consumers — e.g.
		// CodeMirror's print listener — get a no-op so firing a resize can't crash them).
		const listeners = new Set<(e: { type: string; matches: boolean }) => void>();
		let isCompact = true;
		window.matchMedia = ((q: string) => {
			const isBp = /699|1099/.test(q);
			return {
				get matches() { return isCompact ? isBp : false; },
				media: q,
				onchange: null,
				addEventListener: (_: string, cb: (e: { type: string; matches: boolean }) => void) => { if (isBp) listeners.add(cb); },
				removeEventListener: (_: string, cb: (e: { type: string; matches: boolean }) => void) => { listeners.delete(cb); },
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			};
			// Deliberate partial MediaQueryList mock: the typed `change` listeners drive
			// the breakpoint hook, so the shape can't structurally match the full DOM
			// overloads — go through `unknown` (as the compiler itself suggests for this cast).
		}) as unknown as typeof window.matchMedia;
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		expect(await screen.findByRole('menuitem', { name: 'Library' })).toBeInTheDocument();
		// Resize to desktop → ⋯ unmounts; resize back to compact → ⋯ returns CLOSED
		// (the breakpoint effect reset its open state, so it doesn't reopen stale).
		const flip = (compact: boolean) => act(() => { isCompact = compact; for (const cb of listeners) cb({ type: 'change', matches: compact }); });
		await flip(false);
		await waitFor(() => expect(screen.queryByRole('button', { name: 'More controls' })).not.toBeInTheDocument());
		await flip(true);
		expect(await screen.findByRole('button', { name: 'More controls' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Library' })).not.toBeInTheDocument();
	});
});
