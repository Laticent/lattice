import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Most flows here exercise the FULL-density Studio against the original deck set
// (the 6-slide "Q3 Board Review" active). Seed a returning-user state — the saved
// deck index without the newcomer welcome deck, plus the Build posture — which is
// the real shape for anyone who works with every panel docked. The fresh first-run
// state (welcome deck, calm Write surface, no banner) is covered separately below.
function seedReturningUser() {
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
		{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
		{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
	]));
	// lensDefaults:false so these manual-add / approval flows (written before workspace inheritance) start
	// from an EMPTY reader-view slate — the inherited-starters behavior gets its own block below.
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, posture: 'build', lensDefaults: false }));
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
		// Panels start closed at every stop (Build shows the activity-bar launcher; panels
		// open on demand — posture never force-opens one). Dock the Coach to assert its cards.
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
		expect(screen.getByText('Lattice')).toBeInTheDocument();
		expect(screen.getByText('Q3 Board Review')).toBeInTheDocument();
		// The Coach is its own panel now (its header names it), not a tab in "Architect".
		expect(screen.getByText('Board readiness')).toBeInTheDocument();
		// 'Edit' / 'Preview' appear in the pane header AND its collapse rail (rails
		// are ALWAYS rendered, visibility-gated by the split's 0px track) — assert
		// the panes are present, not that the label is unique.
		expect(screen.getAllByText('Edit').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
		// Present is a verb (button), not a persistent tab.
		expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument();
	});
});

describe('StudioShell — the posture dial (persona experiences)', () => {
	it('a fresh visitor lands on the Read home — the sample deck + one "Edit this slide", no banner', () => {
		localStorage.clear(); // a true fresh visitor — no seed, no prior use
		render(<StudioShell options={options} />);
		// The crafted intro deck is the active deck, shown full-bleed.
		expect(screen.getByText('Welcome to Lattice')).toBeInTheDocument();
		// Read is calm: no docked coach, no activity-bar launcher.
		expect(screen.queryByText('Board readiness')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		// The one primary verb + the one-time element-attached hint (NOT a recurring banner nag).
		expect(screen.getByRole('button', { name: 'Edit this slide' })).toBeInTheDocument();
		expect(screen.getByText(/This sample deck is/)).toBeInTheDocument();
		expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
		// The dial is present with Read the lit stop; the boot stop is persisted once (R1).
		expect(screen.getByRole('group', { name: 'Workspace density' })).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('read');
	});

	it('"Edit this slide" steps the newcomer from Read into Write and retires the hint', async () => {
		localStorage.clear();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await user.click(screen.getByRole('button', { name: 'Edit this slide' }));
		// Now at Write: the editor|preview surface, no "Edit this slide" overlay, hint gone for good.
		expect(screen.queryByRole('button', { name: 'Edit this slide' })).not.toBeInTheDocument();
		expect(screen.queryByText(/This sample deck is/)).not.toBeInTheDocument();
		const saved = JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}');
		expect(saved.posture).toBe('write');
		expect(saved.readHintSeen).toBe(true);
	});

	it('moving the dial to Build raises the chrome ceiling (activity-bar launcher) and persists the stop', async () => {
		localStorage.clear();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// Write hides the activity-bar launcher (its globals render only in Build).
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Build — every panel' }));
		// Build reveals the launcher — every panel is now reachable (panels open on demand;
		// the dial raises the ceiling, it doesn't force a panel open — T2 §4.5 orthogonality).
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
		// The choice is persisted (written only by the explicit dial move).
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('build');
	});

	it('the move is reversible — Build back to Write returns to the calm surface, no ceremony', async () => {
		localStorage.clear();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await user.click(screen.getByRole('button', { name: 'Build — every panel' }));
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Write — editor + preview' }));
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
	});

	it('Write keeps deck navigation — the switcher (Switch + New deck) rides the slim header; Read stays a calm label', async () => {
		localStorage.clear();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// Read (fresh boot): the deck is a calm label, not a switcher — no deck-CRUD affordance.
		expect(document.querySelector('[data-demo="deck-switcher"]')).toBeNull();
		// Dial to Write: the switcher appears. Deck-switching + New deck are the Write persona's
		// most basic navigation — not strippable chrome (they used to be reachable NOWHERE in Write:
		// not the slim header, and New deck wasn't even in ⌘K).
		await user.click(screen.getByRole('button', { name: 'Write — editor + preview' }));
		const switcher = document.querySelector('[data-demo="deck-switcher"]') as HTMLElement | null;
		expect(switcher).not.toBeNull();
		await user.click(switcher as HTMLElement);
		expect(screen.getByRole('menuitem', { name: 'New deck' })).toBeInTheDocument();
	});

	it('mobile: a fresh phone visitor gets Read — "Edit this slide" swaps to the editor + persists Write', async () => {
		localStorage.clear();
		setViewport('mobile');
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// The phone newcomer (persona A on their most-likely device) gets the Read verb + hint.
		const edit = screen.getByRole('button', { name: 'Edit this slide' });
		expect(edit).toBeInTheDocument();
		expect(screen.getByText(/This sample deck is/)).toBeInTheDocument();
		await user.click(edit);
		// Tapping it steps Read→Write (persisted) AND swaps to the editor pane — assert the
		// swap directly (the button vanishing alone would follow from the posture change).
		expect(screen.queryByRole('button', { name: 'Edit this slide' })).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
		const editorWrap = document.getElementById('studio-pane-editor')?.parentElement;
		const previewWrap = document.getElementById('studio-pane-preview')?.parentElement;
		expect(editorWrap?.className).not.toContain('invisible'); // editor pane now active
		expect(previewWrap?.className).toContain('invisible'); // preview pane swapped out
	});

	it('a returning user boots straight into Build — the full surface, no cue', () => {
		// beforeEach seeds the Build posture (the migration target for a legacy engaged
		// user; the onboarded→posture migration itself is covered in studio-store.test.ts).
		render(<StudioShell options={options} />);
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
		expect(screen.queryByText(/New here\?/)).not.toBeInTheDocument();
		expect(screen.getByText('Board readiness')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Workspace settings' })).toBeInTheDocument();
	});

	it('a Build faculty summoned from Write reveals Build transiently — docks the panel, never persists Build, recedes on close', async () => {
		localStorage.clear();
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, posture: 'write' }));
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		// At Write there's no activity-bar launcher (a Build-only faculty isn't docked).
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		// Summon "Reshape for a reader" (a Build faculty) from ⌘K.
		await user.keyboard('{Meta>}k{/Meta}');
		const dialog = await screen.findByRole('dialog', { name: /Studio commands/i });
		await user.click(within(dialog).getByText(/Reshape for a reader/));
		// The surface transiently REVEALS Build — the launcher appears and the Lenses
		// panel (its own first-class panel now) opens, since "Reshape for a reader"
		// targets reader views directly.
		expect(await screen.findByRole('button', { name: 'Open Library' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Toggle Lenses' })).toHaveAttribute('aria-pressed', 'true');
		// …but the SAVED posture is untouched: reaching a Build tool never persists Build.
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
		// The dial marks the lit Build as TRANSIENT ("showing temporarily") so clicking it
		// to persist is deliberate, never a silent no-op on a seemingly-selected segment.
		expect(screen.getAllByRole('button', { name: /Build — every panel, showing temporarily/ }).length).toBeGreaterThan(0);
		// Closing the summoned Lenses panel recedes to Write — launcher gone, posture still Write.
		await user.click(screen.getByRole('button', { name: 'Toggle Lenses' }));
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument());
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
		// …and the dial no longer marks any stop transient (Build is no longer even shown).
		expect(screen.queryByRole('button', { name: /showing temporarily/ })).not.toBeInTheDocument();
	});

	it('Esc dismisses a transiently-summoned panel — it does NOT resurrect on the next Build visit (trio R4)', async () => {
		// A summon (⌘K → Reshape) + Esc is one "never mind" episode: the transiently-revealed
		// Lenses panel must CLOSE, not linger open-but-hidden and pop back when the user later
		// dials up to Build. (Contrast: a panel opened at a PERSISTENT Build stop is preserved
		// across a Build↔Write dip — that orthogonality is intentional and untouched here.)
		localStorage.clear();
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, posture: 'write' }));
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await user.keyboard('{Meta>}k{/Meta}');
		const dialog = await screen.findByRole('dialog', { name: /Studio commands/i });
		await user.click(within(dialog).getByText(/Reshape for a reader/));
		expect(await screen.findByRole('button', { name: 'Toggle Lenses' })).toHaveAttribute('aria-pressed', 'true');
		// Esc recedes the transient reveal — back to Write (launcher gone), posture untouched.
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Toggle Lenses' })).not.toBeInTheDocument());
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
		// Dial UP to a persistent Build: the summoned-then-dismissed panel stays CLOSED (no orphan).
		await user.click(screen.getByRole('button', { name: 'Build — every panel' }));
		expect(await screen.findByRole('button', { name: 'Toggle Lenses' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('the ⌘K "Library" command reveals Build and opens the Library from Write — never a dead click', async () => {
		// Regression: Library is a Build-only docked panel now, so opening it from ⌘K at a
		// non-Build stop must transiently reveal Build (like "Reshape"), or the command fires
		// into a panel that never renders. (maker-checker F1.)
		localStorage.clear();
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, posture: 'write' }));
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		expect(screen.queryByRole('button', { name: 'Open Library' })).not.toBeInTheDocument();
		await user.keyboard('{Meta>}k{/Meta}');
		const dialog = await screen.findByRole('dialog', { name: /Studio commands/i });
		await user.click(within(dialog).getByText(/Library — saved themes/));
		// Build is revealed (launcher present) and the Library slot is open (its launcher lit).
		expect(await screen.findByRole('button', { name: 'Open Library' })).toHaveAttribute('aria-pressed', 'true');
		// …with the saved posture still Write (revealing Build never persists it).
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('write');
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

	it('the settings panel opens to a scope from the rail and closes from the header X', async () => {
		const user = setup();
		// Closed by default → no scope echo showing.
		expect(screen.queryByText('Editing the whole deck')).not.toBeInTheDocument();
		// The rail's "Deck" scope button opens the column in deck scope (loud echo).
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		expect(await screen.findByText('Editing the whole deck')).toBeInTheDocument();
		// The deck-scope body is pill-tabbed now; the Marks tab is a stable marker
		// that the deck-scope inspector rendered.
		expect(screen.getByRole('tab', { name: 'Marks' })).toBeInTheDocument();
		// The header close (a single X, chevron retired) collapses it back to the rail.
		await user.click(screen.getByRole('button', { name: 'Collapse settings' }));
		expect(screen.queryByText('Editing the whole deck')).not.toBeInTheDocument();
		// The rail's scope buttons remain (the switch is always present).
		expect(screen.getByRole('button', { name: 'Deck scope' })).toBeInTheDocument();
	});

	it('the Inspector "Inline validation" toggle has real teeth', async () => {
		const user = setup();
		// Deck-wide Authoring controls live in Deck scope — open it from the rail.
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByText('Developer')); // A.1: dev aids live in a footer disclosure now
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

	it('shows a live, deck-reactive Architect scorecard', async () => {
		setup();
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' }));
		expect(screen.getByText('Board readiness')).toBeInTheDocument();
		// The REAL engine scorecard renders its per-dimension read (async assessment,
		// debounced) — Structure/Clarity are always-present categories — with the honest
		// "deterministic" scope caption. (The toy 3-check heuristic was deleted.)
		expect(await screen.findByText('Structure')).toBeInTheDocument();
		expect(await screen.findByText('Clarity')).toBeInTheDocument();
		expect(screen.getByText(/deterministic/i)).toBeInTheDocument();
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
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
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
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)

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
		expect(screen.queryByText('Board readiness')).not.toBeInTheDocument();
		// Swap to the editor pane — the inert flips, nothing remounts. "Markdown source"
		// is the Eight-Cell Bar's Source cell (2026-07-26-studio-mobile-eight-cell-bar.md);
		// it replaces the old icon-only "Edit" toggle.
		await user.click(screen.getByRole('button', { name: 'Markdown source' }));
		expect(inertWrap('studio-pane-editor')).toBeNull(); // editor now active
		expect(inertWrap('studio-pane-preview')).not.toBeNull(); // preview now inert (still mounted)
	});

	it('mobile: tapping the Source cell from a fresh Read boot steps Read→Write (round-1 regression: a prior wiring spec carried this step on only ONE of the two edit-entry handlers)', async () => {
		localStorage.clear(); // a true fresh visitor — boots on Read, per the posture-dial block above
		setViewport('mobile');
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('read');
		await user.click(screen.getByRole('button', { name: 'Markdown source' }));
		const saved = JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}');
		expect(saved.posture).toBe('write');
		expect(saved.readHintSeen).toBe(true);
	});

	it('mobile: tapping the Compose cell from a fresh Read boot ALSO steps Read→Write — the same posture step, on the OTHER handler', async () => {
		localStorage.clear();
		setViewport('mobile');
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		expect(JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}').posture).toBe('read');
		await user.click(screen.getByRole('button', { name: 'Compose — rich editor' }));
		const saved = JSON.parse(localStorage.getItem('lattice-studio-settings') ?? '{}');
		expect(saved.posture).toBe('write');
		expect(saved.readHintSeen).toBe(true);
	});

	it('mobile: the Architect opens as a slide-in sheet', async () => {
		setViewport('mobile');
		const user = setup();
		expect(screen.queryByText('Board readiness')).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Toggle Coach' }));
		expect(await screen.findByText('Board readiness')).toBeInTheDocument();
	});

	it('tablet: the inspector is a docked non-blocking column (not a dimming sheet)', async () => {
		setViewport('tablet');
		const user = setup();
		// Nothing docked open by default; the deck stays visible.
		expect(screen.queryByText('Board readiness')).not.toBeInTheDocument();
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
		expect(await screen.findByText(/Editing Slide \d+/)).toBeInTheDocument();
		// Clicking the ACTIVE scope icon closes the panel — the one collapse rule.
		await user.click(screen.getByRole('button', { name: 'Slide settings' }));
		expect(screen.queryByText(/Editing Slide \d+/)).not.toBeInTheDocument();
	});

	it('the Architect stays independent of settings — the coach can be up WHILE you tune (grouped, not global)', async () => {
		const user = setup();
		// Ensure the coach is open (idempotent — a returning user starts with it up).
		const coach = screen.getByRole('button', { name: 'Toggle Coach' });
		if (coach.getAttribute('aria-pressed') !== 'true') await user.click(coach);
		expect(coach).toHaveAttribute('aria-pressed', 'true');
		// Opening deck settings does NOT close the coach — independent groups, not a
		// single mutually-exclusive sidebar.
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		expect(await screen.findByText(/Editing the whole deck/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Toggle Coach' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('carries persistent group labels + captions so the icons are self-evident (not hover-only)', () => {
		setup();
		const bar = screen.getByRole('navigation', { name: 'Studio panels' });
		expect(within(bar).getByText('Tools')).toBeInTheDocument();
		expect(within(bar).getByText('Set')).toBeInTheDocument();
		// Each bar toggle shows a persistent caption under its glyph.
		expect(within(bar).getByRole('button', { name: 'Toggle Coach' })).toHaveTextContent('Coach');
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
		expect(screen.getByRole('button', { name: 'Toggle Coach' })).toBeInTheDocument();
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

	it('mobile: the deck actions stay inline on the Eight-Cell Bar (captioned cells, no ⋯ hiding)', async () => {
		setViewport('mobile');
		const user = setup();
		// The six protected controls live one-tap on the pane toolbar, not behind a ⋯ —
		// the Eight-Cell Bar (2026-07-26-studio-mobile-eight-cell-bar.md) reclaims width by
		// merging Markdown/Compose/Preview into one segment and dropping all gaps/padding,
		// not by hiding anything.
		const paneBar = screen.getByRole('toolbar', { name: 'Deck actions' });
		expect(within(paneBar).getByRole('button', { name: 'Present' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Share' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Toggle Coach' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
		// The merged pane segment keeps distinct accessible names for all three states.
		expect(within(paneBar).getByRole('button', { name: 'Preview' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Markdown source' })).toBeInTheDocument();
		expect(within(paneBar).getByRole('button', { name: 'Compose — rich editor' })).toBeInTheDocument();
		// Every cell carries a persistent visible caption, not just an aria-label.
		expect(within(paneBar).getByRole('button', { name: 'Markdown source' })).toHaveTextContent('Source');
		expect(within(paneBar).getByRole('button', { name: 'Toggle Coach' })).toHaveTextContent('Coach');
		expect(within(paneBar).getByRole('button', { name: 'Settings' })).toHaveTextContent('Settings');
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
		expect(await within(scopeSheet).findByText(/Editing Slide \d+/)).toBeInTheDocument();
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

	it('mobile: a drawer row that opens NO sheet must not arm the drawer-reopen flag', async () => {
		// REGRESSION (shipped CI-green in eb8e734, fixed in 89e914e). The drawer reopens
		// itself when a sheet IT opened is closed. That flag was armed by EVERY drawer row
		// — including the two that open no sheet at all ("Fix all issues" runs an editor
		// method; a tour just starts). With nothing to close, the flag stayed armed
		// indefinitely, so the NEXT close of ANY wrapped sheet, from ANY entry point,
		// sprang the drawer open on top of the user.
		setViewport('mobile');
		// A FRESH visitor, not the seeded returning user: the shipped welcome deck carries
		// real lint findings, so "Fix all issues" is ENABLED and its tap actually lands.
		// The seeded Q3 deck is clean, which leaves that row disabled and the tap a no-op —
		// the test would then pass for the wrong reason.
		localStorage.clear();
		const user = setup();
		// The Edit block (which hosts Fix all issues) renders only on the edit pane.
		await user.click(screen.getByRole('button', { name: 'Markdown source' }));
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		const fixAll = await screen.findByRole('button', { name: 'Fix all issues' });
		expect(fixAll).toBeEnabled(); // the seed did its job; otherwise this proves nothing
		await user.click(fixAll);
		await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0), { timeout: 3000 });
		// Drive a wrapped sheet from a path that is NOT the drawer (⌘K), then close it.
		await user.keyboard('{Meta>}k{/Meta}');
		expect(await screen.findByPlaceholderText(/Search|command/i)).toBeInTheDocument();
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByPlaceholderText(/Search|command/i)).not.toBeInTheDocument(), { timeout: 3000 });
		// The drawer must stay shut — it never opened this palette. Pre-fix it reopened here.
		expect(screen.queryAllByRole('dialog')).toHaveLength(0);
	});

	it('mobile: the drawer PUSHES a door in place and pops back to the index', async () => {
		// The Two Doors rewrite added a second level inside the SAME sheet (Themes, Show me)
		// and had ZERO coverage of it — no test entered a door, returned from one, or checked
		// that the level resets. That gap is exactly how the rewrite shipped with the phone's
		// only path to a guided tour silently broken in the e2e tier.
		setViewport('mobile');
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		const sheet = await screen.findByRole('dialog');

		// Push: the door's own row is replaced by the door's contents, IN PLACE — still one
		// dialog, not a second stacked sheet.
		await user.click(within(sheet).getByRole('button', { name: 'Show me' }));
		expect(screen.queryAllByRole('dialog')).toHaveLength(1);
		await within(sheet).findByRole('button', { name: 'Back to Studio' });
		// The tour cards live here and ONLY here — the drawer is the phone's sole tour entry.
		expect(sheet.querySelector('[data-tour]')).not.toBeNull();

		// Pop: back to the index, and the door row is reachable again.
		await user.click(within(sheet).getByRole('button', { name: 'Back to Studio' }));
		await within(sheet).findByRole('button', { name: 'Show me' });
		expect(sheet.querySelector('[data-tour]')).toBeNull();

		// Reopening always lands on the index — nobody returns to a screen they forgot.
		await user.click(within(sheet).getByRole('button', { name: 'Show me' }));
		await within(sheet).findByRole('button', { name: 'Back to Studio' });
		await user.keyboard('{Escape}'); // in a door, Escape pops rather than closing
		await within(sheet).findByRole('button', { name: 'Show me' });
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0), { timeout: 3000 });
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Show me' });
	});

	it('mobile: a drawer-opened palette that LAUNCHES another surface does not resurface the drawer under it', async () => {
		// REGRESSION (Munger inversion, F7). The reopen used to hang off each sheet's own
		// `onOpenChange`, which fires on the CLOSING sheet and cannot see what opened in the
		// same commit. CommandPalette's `run` is `onOpenChange(false); fn()` — so drawer →
		// "Search / commands" → "Library" re-opened the drawer as the palette closed, and the
		// Library that arrived a beat later lost the race for the mobile assistant slot. What
		// the user got for picking "Library" was the drawer they started from. Measured, not
		// theorized: pre-fix this lands on the drawer dialog, post-fix on the Library.
		setViewport('mobile');
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		await user.click(await screen.findByRole('button', { name: 'Search / commands' }));
		// The palette's OWN placeholder, not /Search/ — the Library it launches has a search
		// field too, so a loose match would still be satisfied by the wrong surface.
		const PALETTE = 'Search or run a command…';
		await user.type(await screen.findByPlaceholderText(PALETTE), 'Library');
		await screen.findByRole('option', { name: /Library/i });
		await user.keyboard('{Enter}'); // cmdk's canonical selection path

		// Exactly one surface is up, and it is the LIBRARY. Assert which one, not how many:
		// pre-fix there was also exactly one dialog — the drawer, resurfaced, with the
		// Library the user actually asked for nowhere on screen.
		await waitFor(() => expect(screen.queryByPlaceholderText(PALETTE)).not.toBeInTheDocument(), { timeout: 3000 });
		const dialogs = screen.queryAllByRole('dialog');
		expect(dialogs).toHaveLength(1);
		expect(dialogs[0]).toHaveTextContent('Saved themes, components');
	});

	it('mobile: running a command the drawer knows NOTHING about still leaves the drawer shut', async () => {
		// The companion to the test above, and the harder half. The drawer's return can only
		// be derived from surfaces it can name; the palette can reach ~31 commands, most of
		// which land somewhere the drawer has never heard of (Present, Share, Fabricate, a
		// deck switch, a guided tour). The red team drove four of them and got the drawer
		// back on top of the result every time — over a LIVE tour in one case, whose "click
		// anywhere to take over" tap the drawer's own modal overlay then swallowed. So
		// running a command now disarms the return outright: it is a deliberate departure,
		// not a dismissal. "Present" stands in for the whole unlistable tail.
		setViewport('mobile');
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		await user.click(await screen.findByRole('button', { name: 'Search / commands' }));
		const PALETTE = 'Search or run a command…';
		await user.type(await screen.findByPlaceholderText(PALETTE), 'Present');
		await screen.findByRole('option', { name: /Present/i });
		await user.keyboard('{Enter}');

		await waitFor(() => expect(screen.queryByPlaceholderText(PALETTE)).not.toBeInTheDocument(), { timeout: 3000 });
		// Whatever Present put on screen, the drawer is not part of it.
		expect(screen.queryByRole('button', { name: 'Search / commands' })).not.toBeInTheDocument();
		expect(screen.queryAllByRole('dialog').some((d) => d.textContent?.includes('Editor actions, guided tours'))).toBe(false);
	});

	it('mobile: opening the StudioDrawer then resizing to desktop and back leaves it closed (H4)', async () => {
		// A matchMedia that starts compact and can flip to desktop, firing the hook's
		// listeners so `compact` actually changes (the shared stub is a no-op on change).
		// Only the breakpoint media queries feed `listeners` (other consumers — e.g.
		// CodeMirror's print listener — get a no-op so firing a resize can't crash them).
		// NOTE: this mock matches BOTH the 699 and the 1099 queries while compact, and
		// useBreakpoint checks 699 first — so it resolves to MOBILE, not tablet, and this
		// test exercises the StudioDrawer (Sheet + plain buttons), not the tablet
		// DropdownMenu. The tablet path gets its own twin test below (round-2 mobile-
		// toolbar competition, graft from "The Verb Row & the View Row": the prior single
		// test's regex made it silently exercise only one tier, never the other).
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
		expect(await screen.findByRole('button', { name: 'Library' })).toBeInTheDocument();
		// Resize to desktop → ⋯ unmounts; resize back to compact → ⋯ returns CLOSED
		// (the breakpoint effect reset its open state, so it doesn't reopen stale).
		const flip = (compact: boolean) => act(() => { isCompact = compact; for (const cb of listeners) cb({ type: 'change', matches: compact }); });
		await flip(false);
		await waitFor(() => expect(screen.queryByRole('button', { name: 'More controls' })).not.toBeInTheDocument());
		await flip(true);
		expect(await screen.findByRole('button', { name: 'More controls' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
	});

	it('tablet: opening ⋯ then flipping to mobile and back leaves it closed (H4, tablet twin — the mobile↔tablet reset gap the round-2 competition found: `compact` alone never fires across that flip)', async () => {
		// Matches ONLY the 1099 query, never 699 — useBreakpoint resolves TABLET here, so
		// this exercises the real tablet DropdownMenu/menuitem path the previous single
		// test's regex accidentally never reached.
		const listeners = new Set<(e: { type: string; matches: boolean }) => void>();
		let tier: 'tablet' | 'mobile' = 'tablet';
		window.matchMedia = ((q: string) => {
			const is699 = q.includes('699');
			const is1099 = q.includes('1099');
			return {
				get matches() { return tier === 'mobile' ? is699 || is1099 : is1099; },
				media: q,
				onchange: null,
				addEventListener: (_: string, cb: (e: { type: string; matches: boolean }) => void) => { if (is699 || is1099) listeners.add(cb); },
				removeEventListener: (_: string, cb: (e: { type: string; matches: boolean }) => void) => { listeners.delete(cb); },
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			};
		}) as unknown as typeof window.matchMedia;
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'More controls' }));
		expect(await screen.findByRole('menuitem', { name: 'Library' })).toBeInTheDocument();
		// Flip straight to mobile (both `compact` AND `bp` change: tablet→mobile is exactly
		// the transition `compact` alone can't see, since it's true on both sides of it) —
		// the tablet DropdownMenu must not survive as a stale open mobile StudioDrawer.
		const flip = (next: 'tablet' | 'mobile') => act(() => { tier = next; for (const cb of listeners) cb({ type: 'change', matches: true }); });
		flip('mobile');
		await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Library' })).not.toBeInTheDocument());
		flip('tablet');
		expect(await screen.findByRole('button', { name: 'More controls' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: 'Library' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
	});
});

// The Option B behavior at the shell: with the "Default reader views" setting ON, every deck INHERITS
// the two starter views from the workspace — they show up in the Lenses panel without being written into
// the deck, and stay reader-invisible until the human approves one (the same fail-closed gate as a
// hand-added view). These assert the inheritance is live AND still human-gated end to end.
describe('StudioShell — workspace-inherited reader views (B)', () => {
	beforeEach(() => {
		localStorage.clear();
		localStorage.setItem('lattice-studio-deck-index', JSON.stringify([{ id: 'q3-board', title: 'Q3 Board Review', builtin: true }]));
		// lensDefaults:true (also the app default) → the deck inherits Bottom line + The evidence.
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true, lensDefaults: true }));
	});

	it('a fresh deck inherits both starter views as rows, and the Add menu no longer offers them', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
		// Both inherited starters appear in the Lenses panel without the author adding anything.
		expect(screen.getByText('Bottom line')).toBeInTheDocument();
		expect(screen.getByText('The evidence')).toBeInTheDocument();
		// Each carries a "Starter" provenance badge — they're workspace suggestions, not views the author built.
		expect(screen.getAllByText('Starter')).toHaveLength(2);
		// The Add menu offers only the archetypes NOT already inherited (The story / The ask).
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		expect(screen.getByRole('button', { name: /The story/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /The ask/ })).toBeInTheDocument();
		// "Bottom line" resolves to the inherited ROW (a heading button), never a second Add-menu entry.
		expect(screen.getAllByRole('button', { name: /Bottom line/ })).toHaveLength(1);
	});

	it('the empty inherited "Bottom line" cannot be previewed (no blank-rail flash / lying toast)', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
		// Expand Bottom line (base:none, 0 members) — its Preview button is disabled until a slide is tagged.
		await user.click(screen.getByText('Bottom line'));
		const preview = screen.getAllByRole('button', { name: /^Preview$/ }).at(-1) as HTMLButtonElement;
		expect(preview).toBeDisabled();
	});

	it('an inherited view is reader-invisible until approved — the same human gate (fail closed)', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
		// The inherited "The evidence" (base:all) already has every slide as a member, but it is UNAPPROVED,
		// so Present must not offer it to a reader.
		await user.click(screen.getByRole('button', { name: 'Present' }));
		let dialog = within(await screen.findByRole('dialog', { name: 'Present' }));
		expect(dialog.getByText('Full deck')).toBeInTheDocument();
		expect(dialog.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Present' })).not.toBeInTheDocument());

		// Expand the inherited "The evidence" row, preview (the approval gate), then approve.
		await user.click(screen.getByText('The evidence'));
		await user.click(screen.getAllByRole('button', { name: /^Preview$/ }).at(-1) as HTMLElement);
		await user.click(await screen.findByRole('button', { name: /Approve for readers/ }));

		// NOW Present offers it — the gate opened only on the human's approval.
		await user.click(screen.getByRole('button', { name: 'Present' }));
		dialog = within(await screen.findByRole('dialog', { name: 'Present' }));
		await user.click(dialog.getByRole('button', { name: 'Reader view' }));
		expect(await screen.findByRole('menuitem', { name: /The evidence/ })).toBeInTheDocument();
	});

	it('a view the deck has TAGGED sheds its Starter badge — it is being worked on (#993)', () => {
		// Seed a deck whose source already tags a slide into the inherited "Bottom line" (stored JSON-encoded,
		// the shape loadSource reads).
		localStorage.setItem('lattice-studio-src-q3-board', JSON.stringify('<!-- _class: title -->\n<!-- _lens: +brief -->\n\n# Q3\n\n---\n\n## Detail'));
		render(<StudioShell options={options} />);
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
		expect(screen.getByText('Bottom line')).toBeInTheDocument();
		expect(screen.getByText('The evidence')).toBeInTheDocument();
		// brief is tagged → no longer an untouched Starter; only the untouched evidence keeps its badge.
		expect(screen.getAllByText('Starter')).toHaveLength(1);
	});
});
