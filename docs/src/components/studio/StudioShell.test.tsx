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
		// 'Edit' / 'Preview' appear in the pane header AND its collapse rail (rails
		// are ALWAYS rendered, visibility-gated by the split's 0px track) — assert
		// the panes are present, not that the label is unique.
		expect(screen.getAllByText('Edit').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
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

	it('Present navigates the deck; an untagged deck shows a static "Full deck" (no reader-view switcher)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		const dialog = await screen.findByRole('dialog', { name: 'Present' });
		const d = within(dialog);
		// Full deck, started on slide 1 of 6.
		expect(d.getByText('1 / 6')).toBeInTheDocument();
		await user.click(d.getAllByRole('button', { name: 'Next slide' })[0]);
		expect(d.getByText('2 / 6')).toBeInTheDocument();
		// The old author-blind exec/onepager heuristics are retired. A deck with no `lenses:` registry has
		// nothing to switch to, so Present shows a static "Full deck" label, not a reader-view dropdown.
		expect(d.getByText('Full deck')).toBeInTheDocument();
		expect(d.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
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
		// PDF now opens the pre-export Options step first; Download runs the exporter.
		await user.click(sheet.getByText('PDF'));
		await user.click(sheet.getByRole('button', { name: /download pdf/i }));
		expect(shareSpies.sharePdf).toHaveBeenCalled();
		// G8: the export must receive a REAL onStatus (7th arg) — the Studio used to
		// pass `undefined`, so a multi-second export gave no per-slide progress.
		expect(typeof shareSpies.sharePdf.mock.calls.at(-1)?.[6]).toBe('function');
		// Back to the format list for the remaining formats.
		await user.click(sheet.getByRole('button', { name: /all formats/i }));
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

	it('the settings panel opens to a scope from the rail and collapses from the header chevron', async () => {
		const user = setup();
		// Closed by default → no scope echo showing.
		expect(screen.queryByText('Editing the whole deck')).not.toBeInTheDocument();
		// The rail's "Deck" scope button opens the column in deck scope (loud echo).
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		expect(await screen.findByText('Editing the whole deck')).toBeInTheDocument();
		// The inspector is settings-only now; the Running-marks group is a stable
		// marker that the deck-scope body rendered.
		expect(screen.getByText('Running marks')).toBeInTheDocument();
		// The header collapse chevron closes it back to the rail.
		await user.click(screen.getByRole('button', { name: 'Collapse settings' }));
		expect(screen.queryByText('Editing the whole deck')).not.toBeInTheDocument();
		// The rail's scope buttons remain (the switch is always present).
		expect(screen.getByRole('button', { name: 'Deck scope' })).toBeInTheDocument();
	});

	it('the Inspector "Inline validation" toggle has real teeth', async () => {
		const user = setup();
		// Deck-wide Authoring controls live in Deck scope — open it from the rail.
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
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

	// The Q3 deck's components, classified so the (no-AI) suggester can propose a Bottom-line set.
	const q3Catalog = [
		{ name: 'title', bucket: 'anchor', description: '', skeleton: '', function: 'anchor', form: 'bookend' },
		{ name: 'agenda', bucket: 'progression', description: '', skeleton: '', function: 'progression', form: 'list' },
		{ name: 'kpi', bucket: 'evidence', description: '', skeleton: '', function: 'evidence', form: 'metric' },
		{ name: 'quote', bucket: 'connect', description: '', skeleton: '', function: 'statement', form: 'pull' },
		{ name: 'stats', bucket: 'evidence', description: '', skeleton: '', function: 'evidence', form: 'metric' },
		{ name: 'closing', bucket: 'anchor', description: '', skeleton: '', function: 'anchor', form: 'bookend' },
	];

	it('previewing a reader view reshapes the Compose preview, and clears back to full', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} components={q3Catalog} />);
		expect(screen.getByText('Slide 1 / 6')).toBeInTheDocument();
		// Build a Bottom-line view (suggester-proposed members) and preview it — the Compose preview
		// reshapes to that view's slides (a strict subset). Author-side preview needs no approval.
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		await user.click(await screen.findByRole('button', { name: 'Accept all' }));
		await user.click(screen.getAllByRole('button', { name: /^Preview$/ }).at(-1) as HTMLElement);
		// A Clear affordance appears and the deck is reshaped to fewer than the full 6 slides.
		const clear = await screen.findByRole('button', { name: 'Clear reader lens' });
		expect(screen.queryByText('Slide 1 / 6')).not.toBeInTheDocument();
		// Clearing returns to the full deck.
		await user.click(clear);
		expect(await screen.findByText('Slide 1 / 6')).toBeInTheDocument();
	});

	// The whole point, end to end at the reader surface: a reader can open a view ONLY after the author
	// approved it — and the author can only approve after previewing. The suggester proposes, the author
	// accepts + previews + approves, and only THEN does Present offer the view to a reader.
	it('the human-in-the-loop gate: Present offers a reader view ONLY after the author approves it', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} components={q3Catalog} />);

		// Add a Bottom-line reader view and accept the suggester's proposal (it becomes a DRAFT).
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		await user.click(await screen.findByRole('button', { name: 'Accept all' }));

		// A DRAFT view is NOT reader-eligible → Present has NO reader-view switcher (just a static
		// "Full deck"), so a reader is never even offered it. (The legacy exec/onepager heuristics that
		// used to fill this picker are retired.)
		await user.click(screen.getByRole('button', { name: 'Present' }));
		let dialog = within(await screen.findByRole('dialog', { name: 'Present' }));
		expect(dialog.getByText('Full deck')).toBeInTheDocument();
		expect(dialog.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: /Bottom line/ })).not.toBeInTheDocument();
		await user.keyboard('{Escape}'); // close Present
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Present' })).not.toBeInTheDocument());

		// Back in the panel: preview (the approval gate) then approve.
		await user.click(screen.getAllByRole('button', { name: /^Preview$/ }).at(-1) as HTMLElement);
		await user.click(await screen.findByRole('button', { name: /Approve for readers/ }));

		// NOW the view is reader-eligible → Present shows a real switcher offering it. The gate opened
		// only on the human's approval.
		await user.click(screen.getByRole('button', { name: 'Present' }));
		dialog = within(await screen.findByRole('dialog', { name: 'Present' }));
		await user.click(dialog.getByRole('button', { name: 'Reader view' }));
		expect(await screen.findByRole('menuitem', { name: /Bottom line/ })).toBeInTheDocument();
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
	it('mobile: one swappable Edit/Preview pane — both stay MOUNTED, the inactive one inert', async () => {
		setViewport('mobile');
		const user = setup();
		// Both panes are mounted so a swap is instant (no iframe remount) and the hidden preview
		// keeps rendering live — but only the ACTIVE one is interactive; the other is `inert`
		// (hidden + out of the a11y/tab tree). Preview is the default active pane.
		const inertWrap = (id: string) => document.querySelector(`#${id}`)?.closest('[inert]') ?? null;
		expect(await screen.findByText(/Slide \d+ \//)).toBeInTheDocument(); // preview slide nav present
		expect(inertWrap('studio-pane-preview')).toBeNull(); // preview active
		expect(inertWrap('studio-pane-editor')).not.toBeNull(); // editor mounted but inert
		// Architect is NOT a persistent column on mobile.
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		// Swap to the editor pane — the inert flips, nothing remounts.
		await user.click(screen.getByRole('button', { name: 'Edit' }));
		expect(inertWrap('studio-pane-editor')).toBeNull(); // editor now active
		expect(inertWrap('studio-pane-preview')).not.toBeNull(); // preview now inert (still mounted)
	});

	it('mobile: the Architect opens as a slide-in sheet', async () => {
		setViewport('mobile');
		const user = setup();
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Toggle Architect' }));
		expect(await screen.findByText('Board-ready')).toBeInTheDocument();
	});

	it('tablet: the inspector is a docked non-blocking column (not a dimming sheet)', async () => {
		setViewport('tablet');
		const user = setup();
		// Nothing docked open by default; the deck stays visible.
		expect(screen.queryByText('Board-ready')).not.toBeInTheDocument();
		expect(screen.queryByText('Editing the whole deck')).not.toBeInTheDocument();
		// Tablet keeps the docked column (in-panel segment, no rail) — the toolbar
		// "Settings" toggle opens Deck scope in the column, no overlay that dims the deck.
		await user.click(screen.getByRole('button', { name: 'Settings' }));
		expect(await screen.findByText('Editing the whole deck')).toBeInTheDocument();
	});
});

describe('StudioShell — desktop activity bar', () => {
	it('launches scope from the bar; the Slide/Deck icons swap the ONE settings panel, click-active closes it', async () => {
		const user = setup(); // jsdom defaults to desktop
		// No tablet "Settings" toggle on desktop — the bar's Slide/Deck icons own scope.
		expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
		// The bar's Deck icon opens the settings panel at deck scope.
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		expect(await screen.findByText(/Editing the whole deck/)).toBeInTheDocument();
		// Switching to Slide swaps the one panel in place (grouped exclusivity).
		await user.click(screen.getByRole('button', { name: 'Slide settings' }));
		expect(await screen.findByText(/Editing Slide \d+ only/)).toBeInTheDocument();
		// Clicking the ACTIVE scope icon closes the panel — the one collapse rule.
		await user.click(screen.getByRole('button', { name: 'Slide settings' }));
		expect(screen.queryByText(/Editing Slide \d+ only/)).not.toBeInTheDocument();
	});

	it('the Architect stays independent of settings — the coach can be up WHILE you tune (grouped, not global)', async () => {
		const user = setup();
		// Ensure the coach is open (idempotent — a returning user starts with it up).
		const coach = screen.getByRole('button', { name: 'Toggle Architect' });
		if (coach.getAttribute('aria-pressed') !== 'true') await user.click(coach);
		expect(coach).toHaveAttribute('aria-pressed', 'true');
		// Opening deck settings does NOT close the coach — independent groups, not a
		// single mutually-exclusive sidebar.
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		expect(await screen.findByText(/Editing the whole deck/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Toggle Architect' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('carries persistent group labels + captions so the icons are self-evident (not hover-only)', () => {
		setup();
		const bar = screen.getByRole('navigation', { name: 'Studio panels' });
		expect(within(bar).getByText('AI')).toBeInTheDocument();
		expect(within(bar).getByText('Set')).toBeInTheDocument();
		// Each bar toggle shows a persistent caption under its glyph.
		expect(within(bar).getByRole('button', { name: 'Toggle Architect' })).toHaveTextContent('Coach');
		expect(within(bar).getByRole('button', { name: 'Deck scope' })).toHaveTextContent('Deck');
		expect(within(bar).getByRole('button', { name: 'Slide settings' })).toHaveTextContent('Slide');
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
		expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
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
		// Tablet keeps the mode toggle ON the bar — no duplicate row inside ⋯.
		expect(screen.queryByRole('menuitem', { name: /Switch to (dark|light) mode/ })).not.toBeInTheDocument();
	});

	it('mobile: the deck actions stay inline on the pane bar (icon Edit/Preview toggle, no ⋯ hiding)', async () => {
		setViewport('mobile');
		const user = setup();
		// The deck actions live one-tap on the pane toolbar (row 2), not behind a ⋯ —
		// an icon-only Edit/Preview toggle reclaims the width to keep them inline.
		const paneBar = screen.getByRole('toolbar', { name: 'Deck actions' });
		expect(within(paneBar).getByRole('button', { name: 'Present' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Share' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Toggle Architect' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
		// The icon toggle keeps its accessible names.
		expect(within(paneBar).getByRole('button', { name: 'Preview' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		// The header keeps the launcher, the deck switcher, the 1-tap mode flip, and ⋯.
		expect(screen.getByRole('button', { name: 'Workspace launcher' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Q3 Board Review/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'More controls' })).toBeInTheDocument();
		// The pane toggles still work from the pane bar. On mobile the Inspector opens
		// as a Sheet, but it hosts the SAME Slide-first scope switch + echo as the
		// desktop/tablet column — opening from "Settings" lands on deck scope.
		await user.click(within(paneBar).getByRole('button', { name: 'Settings' }));
		expect(await screen.findByText('Editing the whole deck')).toBeInTheDocument();
		// The Slide-first segment is present, so a user can flip to this-slide scope
		// without leaving the sheet — the deterministic scope switch, one surface.
		const scopeSheet = screen.getByRole('dialog');
		await user.click(within(scopeSheet).getByRole('button', { name: 'Slide scope' }));
		expect(await within(scopeSheet).findByText(/Editing Slide \d+ only/)).toBeInTheDocument();
	});

	it('the launcher and deck switcher no longer duplicate "New deck" (deck CRUD lives in the switcher)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		expect(await screen.findByRole('menuitem', { name: /Import deck/ })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'New deck' })).not.toBeInTheDocument();
		await user.keyboard('{Escape}');
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		expect(await screen.findByRole('menuitem', { name: 'New deck' })).toBeInTheDocument();
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
