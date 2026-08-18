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

	it('a new deck takes its name from the heading you type — no rename step (#deck-title-tracks-h1)', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		await user.click(await screen.findByText('New deck'));
		// It starts as "Untitled deck" — the starter template's own heading.
		expect(screen.getByRole('button', { name: /Untitled deck/ })).toBeInTheDocument();
		// Give it a real title the only way an author would: type it into the deck.
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('<!-- _class: title -->\n\n# Acme Board Pack\n\n');
		// The switcher (and everything else that shows a deck title) tracks it live.
		expect(await screen.findByRole('button', { name: /Acme Board Pack/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Untitled deck/ })).not.toBeInTheDocument();
		// …and the switcher's own list agrees, not just the trigger.
		await user.click(screen.getByRole('button', { name: /Acme Board Pack/ }));
		expect(await within(await screen.findByRole('menu')).findByText('Acme Board Pack')).toBeInTheDocument();
		// The debounced save mirrors the heading into the index for studio.astro's
		// pre-paint shell — and leaves the deck's creation label untouched.
		await waitFor(() => {
			const idx = JSON.parse(localStorage.getItem('lattice-studio-deck-index') ?? '[]') as { title: string; derived?: string }[];
			expect(idx.at(-1)?.derived).toBe('Acme Board Pack');
			expect(idx.at(-1)?.title).toBe('Untitled deck');
		});
	});

	it('Rename rewrites the deck HEADING, and never truncates or strips it', async () => {
		// Rename writes into the deck, so what it round-trips must be the RAW heading —
		// prefilling from the display title (stripped, capped at 60) silently deleted the
		// author's emphasis and everything past the cap from their cover slide.
		const user = setup();
		const long = 'Project Falcon — the FY26 operating plan and capital allocation review'; // 70 chars
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste(`<!-- _class: title -->\n\n# ${long}\n\nbody`);

		// The prompt is prefilled with the whole heading, not the 60-char display title.
		const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => `${long} II`);
		await user.click(screen.getByRole('button', { name: new RegExp(long.slice(0, 40)) }));
		await user.click(await screen.findByRole('menuitem', { name: /^Rename/ }));
		expect(prompt).toHaveBeenCalledWith(expect.any(String), long);

		// …and the deck's own heading carries the full new title — nothing lost off the end.
		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).toContain(`# ${long} II`));
		prompt.mockRestore();
	});

	it('the pre-paint MIRROR carries the override — driven through the real save path, not hand-fed', async () => {
		// The predecessor of this test hand-fed resolveTitle(...) straight to syncDerivedTitle,
		// so it asserted only that the store persists what you give it and passed unchanged with
		// the production wiring reverted (an independent checker caught it). This types an
		// override into the REAL editor and asserts what the debounced save actually mirrored —
		// which is what studio.astro paints before hydration.
		const user = setup();
		await user.click(screen.getByRole('button', { name: /Q3 Board Review/ }));
		await user.click(await screen.findByText('New deck'));
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('---\ntitle: Board pack — Q4 FY26\n---\n\n<!-- _class: title -->\n\n# Q4\n\n');
		await waitFor(() => {
			const idx = JSON.parse(localStorage.getItem('lattice-studio-deck-index') ?? '[]') as { title: string; derived?: string }[];
			// The OVERRIDE, not the cover heading — mirroring "Q4" here would flash the very name
			// the override exists to replace, then snap on hydration.
			expect(idx.at(-1)?.derived).toBe('Board pack — Q4 FY26');
			expect(idx.at(-1)?.title).toBe('Untitled deck'); // creation label still untouched
		});
	});

	it('the Deck setup "Deck name" field CREATES and CLEARS the override', async () => {
		// Rename never grows front matter on a deck that has none, so without this control the
		// override could only be reached by hand-writing YAML — in a drawer whose entire purpose
		// is front matter without the YAML. This is the feature's only entry point.
		const user = setup();
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('<!-- _class: title -->\n\n# Q4\n\nbody');
		expect(await screen.findByRole('button', { name: /Q4/ })).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'General' }));
		const field = await screen.findByRole('textbox', { name: 'Deck name' });
		await user.click(field);
		await user.type(field, 'Board pack — Q4 FY26 (final)');
		await user.tab(); // blur commits

		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).toContain('title: "Board pack — Q4 FY26 (final)"'));
		expect(await screen.findByRole('button', { name: /Board pack — Q4 FY26 \(final\)/ })).toBeInTheDocument();

		// Blank CLEARS it — the key is removed and heading derivation resumes.
		await user.clear(screen.getByRole('textbox', { name: 'Deck name' }));
		await user.tab();
		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).not.toContain('title:'));
		expect(await screen.findByRole('button', { name: /Q4/ })).toBeInTheDocument();
	});

	it('the Deck name control preserves front matter it did not come to change', async () => {
		// The gap that let the blocker through: the ORIGINAL version of this test drove a deck with
		// NO front matter — the one input where a whole-block rebuild has nothing to destroy. All
		// three trio lenses independently found that setting a Deck name shredded a real deck's
		// block. Drive a deck that HAS front matter, or this test proves nothing.
		const user = setup();
		const rich = ['---', '# author note — keep me', 'theme: indaco', '_class: lead', 'style: |', '  section { color: red; }', 'tags: [alpha, beta]', '---', '', '<!-- _class: title -->', '', '# Q4', '', 'body'].join('\n');
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste(rich);

		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'General' }));
		const field = await screen.findByRole('textbox', { name: 'Deck name' });
		await user.click(field);
		await user.type(field, 'Board pack');
		await user.tab();

		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).toContain('title: "Board pack"'));
		const src = screen.getByLabelText('Deck source').textContent ?? '';
		expect(src).toContain('# author note — keep me'); // the comment survives
		expect(src).toContain('_class: lead'); // the underscore key survives
		expect(src).toContain('section { color: red; }'); // the block scalar's BODY survives
		expect(src).toContain('tags: [alpha, beta]'); // the flow sequence is not stringified
		expect(src).not.toContain('style: "|"'); // …and the scalar was not reduced to a literal
		expect(await screen.findByRole('button', { name: /Board pack/ })).toBeInTheDocument();
	});

	it('the Deck name control does not eat slide 1 when the leading `---` is a separator', async () => {
		// FM_RE cannot tell a slide separator from front matter, so the whole-block rebuild
		// deleted the swallowed slide outright — demonstrated on the real built Studio.
		const user = setup();
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('---\n\n<!-- _class: title -->\n\n# Cover slide\n\nRevenue up 12 percent.\n\n---\n\n# Second slide\n');

		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'General' }));
		const field = await screen.findByRole('textbox', { name: 'Deck name' });
		await user.click(field);
		await user.type(field, 'Board pack');
		await user.tab();

		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).toContain('Board pack'));
		const src = screen.getByLabelText('Deck source').textContent ?? '';
		expect(src).toContain('# Cover slide');
		expect(src).toContain('Revenue up 12 percent.');
		expect(src).toContain('# Second slide');
	});

	it('a `title:` override names the deck, and Rename aims at the override — not the cover slide', async () => {
		// The whole point of the override is a shelf name the cover slide does not say. So the
		// switcher must show the override, and Rename — which writes back — must target the
		// override; rewriting the heading instead would look like Rename did nothing.
		const user = setup();
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste('---\ntitle: Board pack — Q4 FY26 (final)\n---\n\n<!-- _class: title -->\n\n# Q4\n\nbody');

		// The switcher trigger carries the override, not the cover heading.
		const trigger = await screen.findByRole('button', { name: /Board pack — Q4 FY26 \(final\)/ });
		const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => 'Board pack — Q4 FY26 (v3)');
		await user.click(trigger);
		await user.click(await screen.findByRole('menuitem', { name: /^Rename/ }));
		// Prefilled with the RAW override, and the prompt says what it is about to rewrite.
		expect(prompt).toHaveBeenCalledWith(expect.stringMatching(/front matter/), 'Board pack — Q4 FY26 (final)');

		await waitFor(() => {
			const src = screen.getByLabelText('Deck source').textContent ?? '';
			expect(src).toContain('title: "Board pack — Q4 FY26 (v3)"');
			expect(src).toContain('# Q4'); // the cover slide is untouched
		});
		prompt.mockRestore();
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
		// Blank tile inserts a blank slide, so the rail grows by one. `setup()` seeds no
		// component catalog, so the editor header's twin launcher is absent here and the
		// name resolves to exactly one control.
		await user.click(screen.getByRole('button', { name: 'Add slide' }));
		// "Add a slide" — every launcher and the gallery they open now say the same thing
		// (#1654). Five names for one door was the defect; this assertion is what stops it
		// drifting apart again.
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
		// Open the add-slide gallery from the editor header. With a catalog seeded there are
		// TWO controls named "Add slide" — the preview rail's `+` and the editor header's
		// button — because they are one door reached from two places (#1654). Deliberately
		// `getAllByRole`: asserting both exist is the fix, and either one opens the gallery.
		const launchers = screen.getAllByRole('button', { name: 'Add slide' });
		expect(launchers.length).toBe(2);
		await user.click(launchers[0]);
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
		// Switch to the second built-in deck, then back to the first. The edited deck is
		// now NAMED by the pasted heading — a deck's title is its first heading.
		await user.click(screen.getByRole('button', { name: /UNIQUE-MARKER-XYZ/ }));
		await user.click(await screen.findByText('FY26 Product Strategy'));
		expect(screen.getByLabelText('Deck source').textContent).not.toMatch(/UNIQUE-MARKER-XYZ/);
		await user.click(screen.getByRole('button', { name: /FY26 Product Strategy/ }));
		await user.click(await screen.findByText('UNIQUE-MARKER-XYZ'));
		// The edit is restored — not reset to the canonical source.
		await waitFor(() => expect(screen.getByLabelText('Deck source').textContent).toMatch(/UNIQUE-MARKER-XYZ/));
	});

	it('⌘K runs a command (Fabricate) and a theme', async () => {
		const user = setup();
		// AT DESKTOP ⌘K IS NO LONGER A DIALOG (#1707). The header's search pill expands in
		// place into a combobox and drops its list beneath itself, so there is no
		// `role="dialog"` named "Studio commands" to scope to any more — `matchMedia` is
		// polyfilled to 'desktop' in this suite, which is the tier that gets the inline
		// transport. The overlay still exists below 1100 and is covered by the tablet/mobile
		// cases; what this test is actually about is that ⌘K RUNS COMMANDS, so it now scopes
		// to the command list itself (cmdk gives it `role="listbox"`) rather than to the
		// container that happened to hold it.
		await user.keyboard('{Meta>}k{/Meta}');
		// The transport swap, asserted rather than implied — if a future change puts the
		// dialog back at desktop, that is a decision, and it should fail here first.
		expect(await screen.findByPlaceholderText(/Search or run a command/i)).toBeInTheDocument();
		expect(screen.queryByRole('dialog', { name: /Studio commands/i })).toBeNull();
		await user.click(within(await screen.findByRole('listbox')).getByText(/Fabricate/));
		expect(await screen.findByPlaceholderText(/Describe a look/i)).toBeInTheDocument();
		// Re-open and pick a theme command.
		await user.keyboard('{Meta>}k{/Meta}');
		await user.click(within(await screen.findByRole('listbox')).getByText('cuoio'));
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
		fireEvent.click(screen.getByRole('button', { name: 'Toggle Reader views' })); // open the Lenses panel (first-class now)
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
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
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
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
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
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
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
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
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
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
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

	// #1256 — the writer is unit-tested in front-matter.test.ts; what THESE pin is the
	// WIRING: that the real drawer controls call the lossless writer, on a real deck that
	// has something to lose. #1254's control test was vacuous in exactly this way — it drove
	// a deck with NO front matter, the one input where a whole-block rebuild destroys nothing.
	const RICH_DECK = ['---', '# legal signed off on this footer', 'theme: indaco', '_class: lead', 'style: |', '  section.title h1 { color: red; }', 'tags: [alpha, beta]', '---', '', '<!-- _class: title -->', '', '# Q4', '', 'body'].join('\n');

	/** Assert the deck source still carries every construct `parseFm`'s grammar cannot model. */
	function expectFrontMatterIntact(label: string) {
		const src = screen.getByLabelText('Deck source').textContent ?? '';
		expect(src, `${label}: the YAML comment`).toContain('# legal signed off on this footer');
		expect(src, `${label}: the _-prefixed key`).toContain('_class: lead');
		expect(src, `${label}: the block scalar's body`).toContain('section.title h1 { color: red; }');
		expect(src, `${label}: the flow sequence`).toContain('tags: [alpha, beta]');
		expect(src, `${label}: the block scalar was stringified`).not.toContain('style: "|"');
	}

	async function pasteRichDeck(user: ReturnType<typeof setup>) {
		const editor = screen.getByLabelText('Deck source');
		await user.click(editor);
		await user.paste(RICH_DECK);
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
	}

	it('the Size control preserves front matter it did not come to change', async () => {
		const user = setup();
		await pasteRichDeck(user);
		await user.click(await screen.findByRole('button', { name: /Widescreen|16 : 9/ }));
		await user.click(await screen.findByRole('menuitem', { name: /Square/ }));
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/size:\s*square/);
		expectFrontMatterIntact('Size');
	});

	it('the deck-theme dropdown SPLICES the existing theme: line, in place', async () => {
		// `theme:` is the one key this deck already carries, so it exercises the splice path
		// (the others insert). The whole-block rebuild also REORDERED the survivors, pushing
		// the edited key to the end — so the position is part of the claim, not decoration.
		const user = setup();
		await pasteRichDeck(user);
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		await user.click(await screen.findByRole('option', { name: /^Cuoio/ }));
		const src = screen.getByLabelText('Deck source').textContent ?? '';
		expect(src).toMatch(/theme:\s*cuoio/);
		expectFrontMatterIntact('Deck theme');
		// …and it stayed where the author put it — first key in the block, ahead of `_class:`
		// and the block scalar. (`textContent` on the editor drops the line breaks, so this
		// asserts ORDER by offset rather than by line index.)
		expect(src.indexOf('theme: cuoio')).toBeLessThan(src.indexOf('_class: lead'));
		expect(src.indexOf('theme: cuoio')).toBeLessThan(src.indexOf('tags: [alpha, beta]'));
	});

	it('the Header field preserves front matter it did not come to change', async () => {
		const user = setup();
		await pasteRichDeck(user);
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
		const header = await screen.findByRole('textbox', { name: 'Header' });
		await user.click(header);
		await user.type(header, 'Acme — Q3');
		await user.tab(); // blur commits
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/header:\s*"?Acme/);
		expectFrontMatterIntact('Header');
	});

	it('the Section-rail switch (a class-token write) preserves the rest of the block', async () => {
		// `mergeClassTokens` / `removeClassTokens` route through the same writer now — the card
		// scoped `class:` in with the 23 named directives, since it is the same flat scalar.
		const user = setup();
		await pasteRichDeck(user);
		await user.click(await screen.findByRole('tab', { name: 'Chrome' }));
		await user.click(await screen.findByRole('switch', { name: 'Section rail' }));
		expect(screen.getByLabelText('Deck source').textContent).toContain('class: no-progress');
		expectFrontMatterIntact('Section rail');
	});

	it('a text field shares its row with its label, in the same two columns every control uses', async () => {
		// jsdom has no layout, so this asserts the STRUCTURE the geometry rests on: label
		// column and control column as siblings in ONE row, with the help line beneath —
		// not stacked with the help line between them. The measured version (columns at a
		// shared x, right edges aligned, at 390/820/1440) runs against the built site.
		// This is what fails if someone reverts TextRow to a layout of its own instead of
		// routing through `Field`.
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'General' }));
		const field = await screen.findByRole('textbox', { name: /Deck name/ });
		const label = document.querySelector(`label[for="${field.id}"]`);
		expect(label).not.toBeNull();

		// ONE row: the label's column and the field's column are siblings of the same row.
		const labelCol = label?.parentElement;
		const controlCol = field.parentElement;
		const row = labelCol?.parentElement;
		expect(controlCol?.parentElement).toBe(row);

		// The 45/45 split is what aligns every control in the column at one x — without it
		// each row sizes to its own label and the column is a ragged edge. Both columns
		// carry it, so neither can drift alone.
		for (const col of [labelCol, controlCol]) {
			expect(col?.className, 'both columns share the row geometry').toMatch(/basis-\[45%\]/);
			expect(col?.className).toMatch(/flex-1/);
		}

		// Below ~320px of PANEL width the two columns stack, so the control gets the width
		// back instead of eating its own value. jsdom has no container-query engine, so what
		// is checkable here is the CONTRACT: the row carries the stacking variant, and some
		// ancestor actually declares the container it measures — a variant with no container
		// is dead CSS that fails silently. The behavior itself is verified on the real panel
		// (2026-08-18 decision note §7.1).
		expect(row?.className, 'the row stacks when the panel is narrow').toMatch(/@max-\[320px\]\/settings:flex-col/);
		expect(row?.closest('.\\@container\\/settings'), 'a container is declared for that query to measure').not.toBeNull();

		// …and the help line is BELOW that row, where every `Field` puts it — not between the
		// label and the input, which is what pushed the field under the keyboard.
		const desc = document.getElementById(field.getAttribute('aria-describedby') ?? '');
		expect(desc).not.toBeNull();
		expect(desc?.parentElement).toBe(row?.parentElement);
	});

	it('the Debug overlay control writes a `debug` directive to the source', async () => {
		const user = setup();
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: 'General' }));
		await user.click(await screen.findByText('Developer')); // the dev aids are General's "more" disclosure
		// The Debug overlay control is a preset menu with every value; picking the
		// verbose variant writes `debug: on-always verbose`.
		await user.click(await screen.findByRole('button', { name: 'Debug overlay' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Always on · verbose' }));
		// A multi-word value is YAML-quoted; the parser + lint both strip the quotes.
		expect(screen.getByLabelText('Deck source').textContent).toMatch(/debug:\s*"?on-always verbose"?/);
	});
});

// The registers the coverage audit found the Inspector never offered — each one the
// engine already read, reachable only by hand-writing YAML. See
// engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.2.
//
// Every case asserts the SAME contract the older rows keep: picking a value writes the
// key, and returning to the register's own baseline CLEARS it, so a default deck carries
// no front matter at all. A control that only ever writes is how a deck accretes keys
// that say nothing.
describe('Studio — Inspector covers the registers that had no control', () => {
	// CodeMirror's textContent joins lines without newlines, so these patterns are
	// deliberately unanchored — `/^key: value$/m` can never match here.
	const source = () => screen.getByLabelText('Deck source').textContent ?? '';

	async function openDeckTab(user: ReturnType<typeof setup>, tab: string) {
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('tab', { name: tab }));
	}
	/** Open a tab's collapsed "more" disclosure by its summary text. */
	async function openMore(user: ReturnType<typeof setup>, label: string) {
		await user.click(await screen.findByText(label));
	}
	/** Pick `option` from the CatalogSelect named `name`. */
	async function pick(user: ReturnType<typeof setup>, name: string, option: RegExp | string) {
		await user.click(await screen.findByRole('combobox', { name }));
		await user.click(await screen.findByRole('option', { name: option }));
	}

	it('Corners writes and clears the `corners:` register', async () => {
		const user = setup();
		await openDeckTab(user, 'Look');
		await openMore(user, 'More look settings');
		await pick(user, 'Choose corners', 'Rounded');
		await waitFor(() => expect(source()).toMatch(/corners: rounded/));
		await pick(user, 'Choose corners', 'Square'); // back to the baseline → no key
		await waitFor(() => expect(source()).not.toMatch(/corners:/));
	});

	it('Claim writes and clears the `claim:` register', async () => {
		const user = setup();
		await openDeckTab(user, 'Look');
		await openMore(user, 'More look settings');
		await pick(user, 'Choose claim', 'Bleed');
		await waitFor(() => expect(source()).toMatch(/claim: bleed/));
		await pick(user, 'Choose claim', 'Framed');
		await waitFor(() => expect(source()).not.toMatch(/claim:/));
	});

	it('the Logo field writes `logo:` — and its modifiers stay hidden until there is one', async () => {
		const user = setup();
		await openDeckTab(user, 'Chrome');
		// The four modifiers are meaningless without a logo, so an empty deck must not
		// open this tab on four dead rows.
		expect(screen.queryByRole('combobox', { name: 'Choose which slides carry the logo' })).not.toBeInTheDocument();
		const field = await screen.findByRole('textbox', { name: 'Logo' });
		// `paste`, not `type`: every keystroke re-renders the whole Inspector, so typing a
		// 16-character path is ~16 full renders and made this the slowest case in the file —
		// enough to time out under a loaded suite. The commit path is the same (blur).
		await user.click(field);
		await user.paste('./brand/mark.svg');
		await user.tab();
		await waitFor(() => expect(source()).toMatch(/logo: \.\/brand\/mark\.svg/));
		// …and now they appear.
		await pick(user, 'Choose which slides carry the logo', 'Title slide only');
		await waitFor(() => expect(source()).toMatch(/logo-on: title/));
	});

	it('the Meta line writes `meta:`, and clearing the field removes the key', async () => {
		const user = setup();
		await openDeckTab(user, 'Chrome');
		const field = await screen.findByRole('textbox', { name: 'Meta line' });
		await user.click(field);
		await user.paste('Q3 FY26 · Board review');
		await user.tab();
		await waitFor(() => expect(source()).toMatch(/meta: "Q3 FY26 · Board review"/));
		await user.clear(screen.getByRole('textbox', { name: 'Meta line' }));
		await user.tab();
		await waitFor(() => expect(source()).not.toMatch(/meta:/));
	});

	it('New slide on / Deck chrome / Auto-glossary write their registers', async () => {
		const user = setup();
		await openDeckTab(user, 'General');
		await pick(user, 'Choose how slides split', /dividers only/);
		await waitFor(() => expect(source()).toMatch(/split: rule/));

		// `form:` is inverted — standard is the default, so only the OFF state writes.
		await user.click(await screen.findByRole('switch', { name: 'Deck chrome' }));
		await waitFor(() => expect(source()).toMatch(/form: off/));

		// `glossary:` writes the canonical `auto`, not `on`/`true`.
		await user.click(await screen.findByRole('switch', { name: 'Auto-glossary' }));
		await waitFor(() => expect(source()).toMatch(/glossary: auto/));
	});

	it('the Default slide class field never shows or eats the Section rail token', async () => {
		const user = setup();
		// Turn the rail OFF first — that stamps `no-progress` into the same `class:` key
		// this field writes. A naive text field would show the token, and any edit would
		// silently flip a control in another tab.
		await openDeckTab(user, 'Chrome');
		await user.click(await screen.findByRole('switch', { name: 'Section rail' }));
		await waitFor(() => expect(source()).toMatch(/class: no-progress/));

		await user.click(await screen.findByRole('tab', { name: 'General' }));
		const field = await screen.findByRole('textbox', { name: 'Default slide class' });
		expect((field as HTMLInputElement).value).toBe(''); // the rail's token is not shown
		await user.click(field);
		await user.type(field, 'no-note');
		await user.tab();
		// Both survive: the author's modifier AND the rail token the toggle owns. The
		// value is YAML-quoted because it contains a space — every reader unquotes it
		// (deckClassTokensFromFrontMatter parses both spellings to the same two tokens).
		await waitFor(() => expect(source()).toMatch(/class: "?no-note no-progress"?/));
	});

	it('Pace writes the `pace:` register and clears at the default', async () => {
		const user = setup();
		await openDeckTab(user, 'Speech');
		await pick(user, 'Choose pace', 'Deliberate');
		await waitFor(() => expect(source()).toMatch(/pace: deliberate/));
		await pick(user, 'Choose pace', /Natural/);
		await waitFor(() => expect(source()).not.toMatch(/pace:/));
	});
});
