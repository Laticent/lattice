import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// Stub the live preview (its engine poller leaks a post-teardown timer in jsdom).
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

// These flows test the full-density Studio against the original deck set. Seed a
// returning-user state (saved deck index sans the newcomer welcome deck +
// onboarded:true) so the Architect/Inspector are docked and "Q3 Board Review" is
// active — the real shape for anyone who has used the Studio before.
beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-deck-index', JSON.stringify([
		{ id: 'q3-board', title: 'Q3 Board Review', builtin: true },
		{ id: 'product-strategy', title: 'FY26 Product Strategy', builtin: true },
	]));
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	localStorage.clear();
});

function setup() {
	const user = userEvent.setup();
	render(<StudioShell options={options} />);
	return user;
}

const CATALOG = [
	{ name: 'kpi', bucket: 'inventory', description: 'Key metrics as big numbers', skeleton: '<!-- _class: kpi -->\n\n## Metrics\n\n1. 100\n   - Done' },
	{ name: 'quote', bucket: 'statement', description: 'A pull quote', skeleton: '<!-- _class: quote -->\n\n> Words.\n\n— Someone' },
];
function setupWithCatalog() {
	const user = userEvent.setup();
	render(<StudioShell options={options} components={CATALOG} />);
	return user;
}

// A control-by-control sweep: every interactive surface that the flow tests don't
// already cover gets an explicit "click it → observe the effect" assertion, so a
// regression in any single affordance fails a named test.
describe('Studio — every top-bar control responds', () => {
	it('the palette dropdown applies a Studio theme to the document', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Theme' }));
		await user.click(await screen.findByRole('menuitem', { name: /burgundy/i }));
		expect(document.documentElement.getAttribute('data-palette')).toBe('burgundy');
	});

	it('the deck switcher creates a New deck (deck CRUD lives there, not in the launcher)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		await user.click(await screen.findByText('New deck'));
		expect(screen.getByRole('button', { name: /Untitled deck/ })).toBeInTheDocument();
	});

	it('imports a deck from a .md file (title from its heading)', async () => {
		const user = setup();
		// Drive the hidden file input directly (a real <input type=file> change).
		const input = document.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(['<!-- _class: title -->\n\n# Acme Annual Review\n\nThe year in numbers.'], 'acme.md', { type: 'text/markdown' });
		// jsdom File has no .text() by default in some setups — polyfill for the test.
		if (!file.text) Object.defineProperty(file, 'text', { value: () => Promise.resolve('<!-- _class: title -->\n\n# Acme Annual Review\n\nThe year in numbers.') });
		await user.upload(input, file);
		// The new deck is created, titled from the first heading, and made active.
		expect(await screen.findByRole('button', { name: /Acme Annual Review/ })).toBeInTheDocument();
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/Acme Annual Review/);
	});

	it('runs the REAL grammar linter when a lint vocabulary is provided', async () => {
		const user = userEvent.setup();
		const lintVocab = { names: ['cards-grid', 'kpi', 'title'], modifiers: [], mapRegions: {}, finishNames: [], splitNames: [], capacity: {} };
		render(<StudioShell options={options} lintVocab={lintVocab} />);
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.keyboard('{Control>}a{/Control}');
		// A card-style inline-title footgun the shared lint-core flags as an error.
		await user.paste('<!-- _class: cards-grid -->\n\n## Three bets\n\n- **Alpha.** the body text\n');
		// The lint-core finding surfaces as an inline diagnostic underline (async:
		// the authoring-core bundle is imported on first validation).
		await waitFor(() => expect(document.querySelector('.cm-lintRange')).toBeTruthy(), { timeout: 6000 });
	});

	it('the slide toolbar adds (via the gallery), duplicates, and deletes slides', async () => {
		const user = setup();
		const railCount = () => document.querySelector('nav[aria-label="Slide navigator"]')?.querySelectorAll('button').length ?? 0;
		const start = railCount();
		expect(start).toBeGreaterThan(1);
		// Add slide opens the unified add-slide gallery (the #1058 "one insert door"); its
		// Blank tile inserts a blank slide, so the rail grows by one.
		await user.click(screen.getByRole('button', { name: 'Add slide' }));
		const addDialog = await screen.findByRole('dialog', { name: /Add a slide/i });
		await user.click(within(addDialog).getByRole('button', { name: /Insert Blank/i }));
		expect(railCount()).toBe(start + 1);
		// Duplicate → grows again.
		await user.click(screen.getByRole('button', { name: 'Duplicate slide' }));
		expect(railCount()).toBe(start + 2);
		// Delete is a two-tap confirm: the first tap arms (no deletion yet)…
		await user.click(screen.getByRole('button', { name: 'Delete slide' }));
		expect(railCount()).toBe(start + 2);
		// …the armed button confirms on the second tap.
		await user.click(screen.getByRole('button', { name: 'Confirm delete slide' }));
		expect(railCount()).toBe(start + 1);
	});

	it('the add-slide gallery inserts a component as a new slide', async () => {
		const user = setupWithCatalog();
		const railCount = () => document.querySelector('nav[aria-label="Slide navigator"]')?.querySelectorAll('button').length ?? 0;
		const start = railCount();
		// Open the add-slide gallery from the editor header.
		await user.click(screen.getByRole('button', { name: /Insert/ }));
		const dialog = await screen.findByRole('dialog', { name: /Add a slide/i });
		// Search narrows to the quote component; clicking its tile adds a slide.
		await user.type(within(dialog).getByPlaceholderText(/Search/i), 'quote');
		await user.click(await within(dialog).findByText('quote'));
		expect(railCount()).toBe(start + 1);
		// The inserted slide carries the component's real skeleton class.
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/_class:\s*quote/);
	});

	it('edits survive a deck switch (persistence)', async () => {
		const user = setup();
		// Edit deck 1 — paste a unique marker into the source.
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('<!-- _class: title -->\n\n# UNIQUE-MARKER-XYZ\n\n');
		// Switch to the second built-in deck, then back to the first.
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		await user.click(await screen.findByText('FY26 Product Strategy'));
		expect(screen.queryByText(/UNIQUE-MARKER-XYZ/)).not.toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: /FY26 Product Strategy/ }));
		await user.click(await screen.findByText('Q3 Board Review'));
		// The edit is restored — not reset to the canonical source.
		expect(await screen.findByText(/UNIQUE-MARKER-XYZ/)).toBeInTheDocument();
	});

	it('⌘K runs a command (Fabricate) and a theme', async () => {
		const user = setup();
		await user.keyboard('{Meta>}k{/Meta}');
		const dialog = await screen.findByRole('dialog', { name: /Studio commands/i });
		await user.click(within(dialog).getByText(/Fabricate/));
		expect(await screen.findByPlaceholderText(/Describe a look/i)).toBeInTheDocument();
		// Re-open and pick a theme command.
		await user.keyboard('{Meta>}k{/Meta}');
		const d2 = await screen.findByRole('dialog', { name: /Studio commands/i });
		await user.click(within(d2).getByText('cuoio'));
		expect(document.documentElement.getAttribute('data-palette')).toBe('cuoio');
	});
});

describe('Studio — Architect + editor controls respond', () => {
	it('"Fix all" clears an unknown component flagged inline', async () => {
		const user = setup();
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' })); // panels start closed now — the Architect "Fix all" banner needs the coach open
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('<!-- _class: bogus-zzz -->\n# Oops\n\n---\n\n');
		// The unknown component surfaces as an inline issue.
		expect(await screen.findByText(/\d+ issue/)).toBeInTheDocument();
		// Fix all (Architect banner or Edit header — both fix) clears it.
		await user.click(screen.getAllByRole('button', { name: 'Fix all' })[0]);
		expect(screen.queryByText(/\d+ issue/)).not.toBeInTheDocument();
	});

	it('the Lenses panel adds a reader view and gates it behind approval (deterministic, real)', async () => {
		const user = setup();
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Lenses' })); // open the Lenses panel (first-class now)
		// The Lenses panel: add a Bottom-line reader view…
		await user.click(screen.getByRole('button', { name: /Add a reader view/ }));
		await user.click(screen.getByRole('button', { name: /Bottom line/ }));
		// …it lands as a real `lenses:` block and the row shows it starts EMPTY — hidden from readers
		// until the author tags slides in and approves (the human-in-the-loop gate). The new row
		// auto-expands, so its guidance + gated Approve are visible immediately.
		const row = await screen.findByRole('button', { name: /Bottom line/ });
		expect(row).toHaveTextContent(/Empty/);
		expect(await screen.findByText(/No slides yet/i)).toBeInTheDocument();
		// An empty view can't be approved — the Approve action is withheld.
		expect(screen.queryByRole('button', { name: /Approve for readers/ })).not.toBeInTheDocument();
	});

	it('the Architect Chat thread sends a message and degrades honestly offline', async () => {
		const user = setup();
		// Chat is its own panel now (own toolbar icon) — no tab-switching.
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Chat' }));
		const box = await screen.findByRole('textbox', { name: 'Message the Architect' });
		await user.type(box, 'Tighten slide 1');
		await user.click(screen.getByRole('button', { name: 'Send' }));
		// The user turn is in the thread…
		expect(await screen.findByText('Tighten slide 1')).toBeInTheDocument();
		// …and with no model connected the assistant degrades honestly (no fake edit).
		expect(await screen.findByText(/Connect a model in Workspace/i, undefined, { timeout: 6000 })).toBeInTheDocument();
	});

	it('the deterministic Coach chips work with no model connected', async () => {
		const user = setup();
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Coach' })); // panels start closed now — open the coach
		// The Coach's value is deterministic (Coach-vs-Converse): the "quick reads" chips
		// compute a result card from the deck with NO model — they must work offline, not
		// point at Workspace. (The model-gated AI fix is what degrades; covered elsewhere.)
		await user.click(await screen.findByRole('button', { name: 'Structure' }));
		expect(await screen.findByText(/Structure check/i, undefined, { timeout: 5000 })).toBeInTheDocument();
	});
});

describe('Studio — Fabricate + Present dock respond', () => {
	it('Fabricate switches Theme/Component tabs and exports', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		expect(await screen.findByPlaceholderText(/Describe a look/i)).toBeInTheDocument();
		// The shared header Export (theme tab) confirms via toast.
		await user.click(screen.getByRole('button', { name: /Export/ }));
		expect(await screen.findByText(/Exported/)).toBeInTheDocument();
		// Switch to the Component tab — the REAL component studio appears (the shared
		// header now reads the component Name + the live gate), the theme studio leaves.
		await user.click(screen.getByRole('button', { name: /Component/ }));
		expect(await screen.findByLabelText('Component name')).toBeInTheDocument();
		expect(screen.queryByPlaceholderText(/Describe a look/i)).not.toBeInTheDocument();
	});

	it('Component tab: the shared header Save + Export ride the real gate', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		await user.click(screen.getByRole('button', { name: /Component/ }));
		// The starter is gate-clean → the SAME header Save the theme tab uses is enabled.
		expect(await screen.findByText(/Gate — all clear/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
		// A hex literal trips the real layout gate → finding shows + Save disables.
		fireEvent.change(screen.getByLabelText('Component CSS'), { target: { value: 'section.callout { color: #ff0000; }' } });
		expect(await screen.findByText(/use a palette token/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});

	it('Component tab: the Manifest JSON view two-way syncs and guards invalid JSON', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		await user.click(screen.getByRole('button', { name: /Component/ }));
		// Switch the manifest panel to the raw-JSON view.
		await user.click(screen.getByRole('button', { name: 'JSON' }));
		const json = await screen.findByLabelText('Manifest JSON');
		// Invalid JSON → a finding surfaces and Save disables (can't silently save a broken edit).
		fireEvent.change(json, { target: { value: '{ not json' } });
		expect((await screen.findAllByText(/Manifest JSON is invalid/i)).length).toBeGreaterThan(0);
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		// Valid JSON changing an axis → clean again, and the Fields view reflects it (two-way).
		fireEvent.change(json, { target: { value: JSON.stringify({ name: 'callout', function: 'comparison', form: 'canvas', substance: 'prose', bucket: 'comparison', tags: ['a', 'b', 'c'], description: 'd', adapt: { mode: 'native' }, capacity: { sweet: 1, soft: 2, hard: 3 } }) } });
		await user.click(screen.getByRole('button', { name: 'Fields' }));
		// Bucket is a shadcn (Radix) Select now — open it and assert the checked option.
		await user.click(screen.getByRole('combobox', { name: 'Bucket' }));
		expect(await screen.findByRole('option', { name: 'comparison', selected: true })).toBeInTheDocument();
	});

	it('Fabricate derives a REAL token contract + WCAG audit from the engine', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		// The token tree lists the real derived contract (12 roles) + the ten
		// essentials (the three ink roles are unique to the essentials group) —
		// proof the theme engine ran, not a mock.
		expect(await screen.findByText(/Contract · 12 roles/)).toBeInTheDocument();
		for (const ink of ['Heading ink', 'Body ink', 'Muted ink']) expect(screen.getByRole('button', { name: ink })).toBeInTheDocument();
		// Selecting the Accent contract role opens its light + dark wells in the inspector.
		const accentRows = screen.getAllByRole('button', { name: 'Accent' });
		await user.click(accentRows[accentRows.length - 1]);
		expect(await screen.findByLabelText('Accent light')).toBeInTheDocument();
		expect(screen.getByLabelText('Accent dark')).toBeInTheDocument();
		// The WCAG audit renders real computed rows: a role with an `N.N : 1` ratio
		// and a tier badge (AAA/AA/FAIL) — auditBoth output, not a static list.
		expect(screen.getByText(/WCAG audit/)).toBeInTheDocument();
		expect(screen.getAllByText(/\d+\.\d+ : 1/).length).toBeGreaterThan(0);
		// Picking a curated starter reseeds the core colors and re-derives.
		await user.click(screen.getByRole('button', { name: /Start from Ember/ }));
		expect(await screen.findByText(/Contract · 12 roles/)).toBeInTheDocument();
	});

	it('Present Play/Pause toggles and shows the live teleprompter', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		const dialog = await screen.findByRole('dialog', { name: 'Present' });
		// One Play (2026-07-12 redesign): narrates + advances. Captions run even muted.
		const dock = within(dialog).getByRole('button', { name: 'Play the presentation' });
		await user.click(dock);
		expect(within(dialog).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
		// The teleprompter (caption status region) announces the current slide's prose so the
		// read-along is real — captions even with Voice muted (the default silent cadence).
		const prompter = within(dialog).getByRole('status');
		expect(prompter.textContent?.trim().length ?? 0).toBeGreaterThan(0);
		// Pausing returns the play affordance.
		await user.click(within(dialog).getByRole('button', { name: 'Pause' }));
		expect(within(dialog).getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument();
	});

	it('Present → Rehearse mode (Practice) surfaces pacing + coaching', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Present' }));
		const dialog = await screen.findByRole('dialog', { name: 'Present' });
		const d = within(dialog);
		await user.click(d.getByRole('button', { name: 'Rehearse' }));
		// The transport becomes a rehearsal clock, with an on-pace indicator.
		expect(d.getByRole('button', { name: 'Start rehearsal' })).toBeInTheDocument();
		expect(d.getByText('On pace')).toBeInTheDocument();
		// Starting the rehearsal surfaces REAL per-slide coaching from the planner
		// (the opening slide's delivery beat), not a canned cycling string.
		await user.click(d.getByRole('button', { name: 'Start rehearsal' }));
		expect(await d.findByText(/eye contact|Set the frame|signpost/i)).toBeInTheDocument();
	});
});

describe('Studio — Inspector controls respond', () => {
	it('the Inspector deck-theme dropdown pins the deck theme, not the website palette', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		const sitePaletteBefore = document.documentElement.getAttribute('data-palette');
		// The Look group's grouped theme dropdown (Automatic / Curated / AA / More)
		// now writes the DECK's own `theme:` front matter — the website palette (the
		// chrome's `data-palette`) is untouched.
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		await user.click(await screen.findByRole('option', { name: /^Cuoio/ }));
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/theme:\s*cuoio/);
		expect(document.documentElement.getAttribute('data-palette')).toBe(sitePaletteBefore);
	});

	it('the Inspector deck-theme dropdown surfaces the AA color-blind-safe palettes', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		// An a11y/CVD palette is selectable and pins to the deck.
		await user.click(await screen.findByRole('option', { name: /Deuteranopia/ }));
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/theme:\s*a11y-deuteranopia/);
	});

	it('the Inspector deck-theme "Auto" clears the deck theme (follows the site)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		await user.click(await screen.findByRole('option', { name: /^Cuoio/ }));
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/theme:\s*cuoio/);
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		// The compact auto row reads "Auto" now (was "Automatic — match site").
		await user.click(await screen.findByRole('option', { name: /Auto/ }));
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/theme:\s*cuoio/);
	});

	it('the top-bar control toggles light / dark mode', async () => {
		const user = setup();
		document.documentElement.setAttribute('data-mode', 'light');
		// The top-bar mode toggle flips the document's data-mode (light-dark() resolves off it).
		await user.click((await screen.findAllByRole('button', { name: 'Switch to dark mode' }))[0]);
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
	});

	it('authoring a speaker note writes it into the slide source', async () => {
		const user = setup();
		// The speaker note lives in the per-slide "Slide settings" drawer now (not the
		// Inspector), opened from the editor row, under the Notes tab.
		await user.click(screen.getByRole('button', { name: 'Slide settings' }));
		await user.click(await screen.findByRole('tab', { name: 'Notes' }));
		const notes = await screen.findByRole('textbox', { name: 'Speaker note for this slide' });
		await user.click(notes);
		await user.type(notes, 'Open on the room, then the number.');
		await user.tab(); // blur commits the note
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/note: Open on the room, then the number\./);
	});

	it('version history saves a checkpoint and restores it', async () => {
		const user = setup();
		// History moved out of the inspector into its own sheet (an action, not a
		// deck setting), opened from the top-bar "Version history" button.
		await user.click(screen.getByRole('button', { name: 'Version history' }));
		// Save the current deck as a version.
		await user.click(await screen.findByRole('button', { name: /Save a version/ }));
		expect(await screen.findByText('Saved version')).toBeInTheDocument();
		// The sheet is modal — close it to edit the deck behind it.
		await user.keyboard('{Escape}');
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.keyboard('{Control>}a{/Control}');
		await user.paste('<!-- _class: title -->\n\n# TOTALLY DIFFERENT\n');
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/TOTALLY DIFFERENT/);
		// Reopen history and restore — the saved content comes back.
		await user.click(screen.getByRole('button', { name: 'Version history' }));
		await user.click(await screen.findByRole('button', { name: 'Restore' }));
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/TOTALLY DIFFERENT/);
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/Q3 Board Review/);
	});

	it('the Page-numbers switch writes paginate front-matter to the source', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'Marks' }));
		const sw = await screen.findByRole('switch', { name: 'Page numbers' });
		// Off by default (no front-matter); turning it on writes `paginate: true`.
		expect(sw).not.toBeChecked();
		await user.click(sw);
		expect(sw).toBeChecked();
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/paginate:\s*true/);
		// Turning it off removes the directive again.
		await user.click(screen.getByRole('switch', { name: 'Page numbers' }));
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/paginate/);
	});

	it('a settings change raises a one-click Undo toast that reverts it', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'Marks' }));
		const sw = await screen.findByRole('switch', { name: 'Page numbers' });
		await user.click(sw);
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/paginate:\s*true/);
		// The change surfaces a one-click Undo, labeled by what changed.
		const undo = await screen.findByRole('button', { name: 'Undo' });
		expect(screen.getByText('Page numbers on')).toBeInTheDocument();
		// One click reverts the source to before the change and dismisses the toast.
		await user.click(undo);
		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/paginate/));
		// Sonner dismisses the toast through an exit animation, so the button leaves the
		// DOM a beat after the click (the hand-rolled pill removed it synchronously).
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument());
	});

	it('the Undo toast steps aside once you edit after the change (never swallows your edits)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'Marks' }));
		await user.click(await screen.findByRole('switch', { name: 'Page numbers' }));
		expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
		// Edit the source AFTER the settings change — the pending Undo must bow out so it
		// can never revert (clobber) this edit. A whole-document restore would lose it.
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('<!-- keep-me-marker -->\n\n');
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument());
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/keep-me-marker/);
	});

	it('the Header/Footer fields declare running text into the source (blank clears it)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'Marks' }));
		// Header & footer are text DECLARATIONS, not toggles: typing text (committed
		// on blur) writes the directive; clearing the field removes it again.
		const header = await screen.findByRole('textbox', { name: 'Header' });
		await user.click(header);
		await user.type(header, 'Acme — Q3');
		await user.tab(); // blur commits
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/header:\s*"?Acme/);

		const footer = screen.getByRole('textbox', { name: 'Footer' });
		await user.click(footer);
		await user.type(footer, 'Confidential');
		await user.tab();
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/footer:\s*Confidential/);

		// Clearing the header field turns the band off — the directive is dropped.
		await user.clear(header);
		await user.tab();
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/header:/);
	});

	it('the Section-rail switch stamps and clears the deck-wide no-progress class', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'Marks' }));
		const sw = await screen.findByRole('switch', { name: 'Section rail' });
		// Rail is ON by default (no class token) — so the switch reads checked.
		expect(sw).toBeChecked();
		// Turning it OFF stamps `class: no-progress` deck-wide.
		await user.click(sw);
		expect(sw).not.toBeChecked();
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/class:\s*no-progress/);
		// Turning it back ON clears the token (and the now-empty class key).
		await user.click(screen.getByRole('switch', { name: 'Section rail' }));
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/no-progress/);
	});

	it('the Size control writes a `size` directive to the source', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		// The Size control opens a menu of real @size tokens; picking one writes it.
		await user.click(await screen.findByRole('button', { name: /Widescreen|16 : 9/ }));
		await user.click(await screen.findByRole('menuitem', { name: /Square/ }));
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/size:\s*square/);
	});

	it('the Debug overlay control writes a `debug` directive to the source', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByText('Developer')); // A.1: dev aids live in a footer disclosure now
		// The Debug overlay control is a preset menu with every value; picking the
		// verbose variant writes `debug: on-always verbose`.
		await user.click(await screen.findByRole('button', { name: 'Debug overlay' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Always on · verbose' }));
		// A multi-word value is YAML-quoted; the parser + lint both strip the quotes.
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/debug:\s*"?on-always verbose"?/);
	});
});
