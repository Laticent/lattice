import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudioShell from './StudioShell';

// A DeckPreview stub that surfaces the theme-wiring props as data-attributes, so a
// test can assert that selecting a saved theme threads it into the live preview
// (and that Fabricate's specimen honors the light/dark mode override).
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label, paletteOverride, extraTheme, modeOverride }: { 'aria-label'?: string; paletteOverride?: string; extraTheme?: { name: string }; modeOverride?: string }) => (
		<div data-testid="deck-preview" data-label={label} data-palette-override={paletteOverride ?? ''} data-extra-theme={extraTheme?.name ?? ''} data-mode-override={modeOverride ?? ''}>
			{label}
		</div>
	),
}));

// A stateful in-memory stand-in for the shared Workbench library (the real one is
// IndexedDB, absent in jsdom). slugify stays real; save/list/delete mutate a
// hoisted store so the full save → list → select loop runs end-to-end.
const { themeStore } = vi.hoisted(() => ({ themeStore: [] as Array<{ id: string; name: string; label: string; css: string; essentials: Record<string, string> }> }));
vi.mock('./theme-library', async (orig) => {
	const actual = (await orig()) as Record<string, unknown>;
	return {
		...actual,
		saveStudioTheme: vi.fn(async (input: { id?: string; name: string; label: string; css: string; essentials: Record<string, string> }) => {
			// Mirror the real name resolution (trust a valid slug name, else the label
			// slug) so the mock's stored name matches production.
			const name = /^[a-z][a-z0-9-]*$/.test(input.name) ? input.name : (actual.slugify as (s: string) => string)(input.label) || input.name;
			// KEYED ON `id` WHEN THERE IS ONE, exactly as `putAsset` is — and this mock
			// used to key on NAME alone, which meant it could not exhibit id-pinning at
			// all. A save that overwrote the wrong record in place looked identical here
			// to one that created a new theme, so the test suite was blind to the whole
			// class of defect the Edit path introduces.
			const t = { id: input.id ?? `t_${name}`, name, label: input.label, css: input.css, essentials: input.essentials };
			const i = input.id ? themeStore.findIndex((x) => x.id === input.id) : themeStore.findIndex((x) => x.name === t.name);
			if (i >= 0) themeStore[i] = t;
			else themeStore.unshift(t);
			return t;
		}),
		listStudioThemes: vi.fn(async () => [...themeStore]),
		deleteStudioTheme: vi.fn(async (id: string) => {
			const i = themeStore.findIndex((x) => x.id === id);
			if (i >= 0) themeStore.splice(i, 1);
		}),
	};
});

import { saveStudioTheme } from './theme-library';

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };

beforeEach(() => {
	themeStore.length = 0;
	// Fabricate is an advanced surface, hidden from the launcher for a fresh
	// newcomer. Seed onboarded:true so these depth tests can open it.
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ validation: true, pageNumbers: true, headerFooter: false, onboarded: true }));
});
afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
	localStorage.clear();
});

function openFabricate(user: ReturnType<typeof userEvent.setup>) {
	return (async () => {
		await user.click(screen.getByRole('button', { name: 'Workspace launcher' }));
		await user.click(await screen.findByText('Fabricate'));
		// Fabricate is code-split (React.lazy) out of the initial Studio island, so
		// its subtree arrives a tick after the click via Suspense — wait for the
		// Theme Studio specimen before the callers assert against it.
		await waitFor(() => {
			if (!document.querySelector('[data-label="Theme specimen"]')) throw new Error('Fabricate not loaded yet');
		});
	})();
}

describe('Studio — Fabricate Theme Studio depth', () => {
	it('edits all ten essentials and auditions the derived theme in light AND dark', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);

		// All ten engine essentials are listed in the token tree (the three ink roles
		// are unique to the essentials group vs the contract's Heading/Body/Muted).
		for (const ink of ['Heading ink', 'Body ink', 'Muted ink']) expect(screen.getByRole('button', { name: ink })).toBeInTheDocument();

		const specimen = document.querySelector('[data-label="Theme specimen"]') as HTMLElement;
		expect(specimen.getAttribute('data-mode-override')).toBe('light');
		// Flip the specimen to dark — the SAME derived theme, rendered in the other
		// mode (the derivation emits light-dark() pairs; modeOverride resolves them).
		await user.click(screen.getByRole('button', { name: 'Dark specimen' }));
		await waitFor(() => expect(specimen.getAttribute('data-mode-override')).toBe('dark'));
		// It renders against the derived theme, not a built-in palette.
		expect(specimen.getAttribute('data-extra-theme')).toMatch(/^fab-/);
	});

	it('overrides a contract token side and re-derives the live specimen', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);

		const specimen = document.querySelector('[data-label="Theme specimen"]') as HTMLElement;
		const before = specimen.getAttribute('data-extra-theme');
		// Select the Accent contract role → the inspector exposes light AND dark wells (#48/#49).
		const accentRows = screen.getAllByRole('button', { name: 'Accent' });
		await user.click(accentRows[accentRows.length - 1]);
		const darkWell = screen.getByLabelText('Accent dark') as HTMLInputElement;
		fireEvent.input(darkWell, { target: { value: '#123456' } });
		// The override re-derives a fresh theme (content-hashed name changes), and the
		// specimen renders it — the edit is real, not cosmetic.
		await waitFor(() => expect(specimen.getAttribute('data-extra-theme')).not.toBe(before));
		expect(specimen.getAttribute('data-extra-theme')).toMatch(/^fab-/);
		// A reset affordance appears for the overridden role and clears the pin.
		await user.click(screen.getByRole('button', { name: /Reset role/ }));
		await waitFor(() => expect(specimen.getAttribute('data-extra-theme')).toBe(before));
	});

	it('edits the data-viz band on the live canvas — slide·chart·diagram previews + selectable strip', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);

		// The canvas shows all three live previews so a band edit shows everywhere.
		expect(document.querySelector('[data-label="Theme specimen"]')).toBeTruthy();
		expect(document.querySelector('[data-label="Chart specimen"]')).toBeTruthy();
		expect(document.querySelector('[data-label="Diagram specimen"]')).toBeTruthy();

		const slide = document.querySelector('[data-label="Theme specimen"]') as HTMLElement;
		const before = slide.getAttribute('data-extra-theme');
		// Pick a chart series from the band strip → it loads into the tray editor,
		// which exposes light + dark wells for a mode-varying token.
		await user.click(screen.getByRole('button', { name: 'Series 3' }));
		const darkWell = screen.getByLabelText('Series 3 dark') as HTMLInputElement;
		fireEvent.input(darkWell, { target: { value: '#0a0a0a' } });
		// The override re-derives — every preview re-renders against the new theme.
		await waitFor(() => expect(slide.getAttribute('data-extra-theme')).not.toBe(before));

		// A categorical fill now FLIPS with the canvas (the three-layer contract, #1089):
		// the tray exposes light + dark wells, not a single mode-independent value.
		await user.click(screen.getByRole('button', { name: 'Categorical 1 · fill' }));
		expect(screen.getByLabelText('Categorical 1 · fill light')).toBeTruthy();
		expect(screen.getByLabelText('Categorical 1 · fill dark')).toBeTruthy();
		expect(screen.queryByLabelText('Categorical 1 · fill value')).toBeNull();
	});

	it('requires a name before saving — no magic default (consistent with components)', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);
		// No pre-filled name, and Save is disabled until you name it — the name is a
		// first-class slug, IDENTICAL to the component tab (#57).
		const nameInput = screen.getByLabelText('Theme name') as HTMLInputElement;
		expect(nameInput.value).toBe('');
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		await user.type(nameInput, 'harbor');
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
	});

	it('saves a named theme to the library, then lets you pick it for the deck', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);

		// Name it and save → the real save path runs with the full ten-key essential
		// set + a serialized CSS (proof it's the engine derivation, not a stub).
		const nameInput = screen.getByLabelText('Theme name') as HTMLInputElement;
		await user.clear(nameInput);
		await user.type(nameInput, 'ocean');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(saveStudioTheme).toHaveBeenCalled());
		const arg = (saveStudioTheme as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { name: string; label: string; essentials: Record<string, string>; css: string };
		// The slug IS the name; the human display label is a titleized view of it.
		expect(arg.label).toBe('Ocean');
		expect(arg.name).toBe('ocean');
		expect(Object.keys(arg.essentials).sort()).toEqual(['accent', 'accentSoft', 'bg', 'bgAlt', 'fail', 'pass', 'textBody', 'textHeading', 'textMuted', 'warn']);
		expect(arg.css.length).toBeGreaterThan(100);
		// The serialized CSS's `@theme <name>` MUST match the record name, or the
		// engine registers it under the css name while the deck renders by record
		// name → a blank, unthemed render. (Regression guard for that exact bug.)
		expect(arg.css).toMatch(/@theme\s+ocean\b/);

		// Back to Compose, open the Inspector — the saved theme is offered in the
		// grouped theme dropdown under "Your themes"…
		await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		// …and selecting it threads the saved theme into the live deck preview.
		await user.click(await screen.findByRole('option', { name: 'Ocean' }));
		const preview = document.querySelector('[data-label="Live deck preview"]') as HTMLElement;
		await waitFor(() => expect(preview.getAttribute('data-extra-theme')).toBe('ocean'));
		expect(preview.getAttribute('data-palette-override')).toBe('ocean');
	});

	/**
	 * THE CSS VIEW — the hand-edited record BECOMES the model.
	 *
	 * These drive the STATE WIRING, which is what jsdom can carry: `CodeField`
	 * renders its `<textarea>` fallback here (CodeMirror cannot lay out without real
	 * geometry), so a real CodeMirror round trip belongs in `docs/e2e/fabricate.spec.ts`
	 * and is there. What is provable here is the part that decides whether an edit
	 * survives at all: does the record feed Save, does the derivation stop feeding it,
	 * and can anything re-derive over it without announcing itself (HARD RULE #23 —
	 * this is not a claim that the editor works).
	 */
	describe('the CSS view', () => {
		const openCss = async (user: ReturnType<typeof userEvent.setup>) => {
			await user.click(screen.getByRole('button', { name: 'CSS' }));
			return (await screen.findByLabelText('Theme CSS')) as HTMLTextAreaElement;
		};

		it('opens on the derived stylesheet and hands Save the AUTHOR\'s bytes, not a re-derivation', async () => {
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			const nameInput = screen.getByLabelText('Theme name') as HTMLInputElement;
			await user.clear(nameInput);
			await user.type(nameInput, 'harbor');

			const box = await openCss(user);
			expect(box.value).toMatch(/@theme\s+fab-/);

			// A hand edit the pickers could never produce: a comment, and a token that
			// is NOT in the 107-name contract. Re-serializing from the token map would
			// drop both — that is precisely the data loss `lib/theme/parse.js` exists
			// to prevent, and it would arrive here at the Save button.
			const edited = `${box.value}\n/* hand-written note */\n:root { --brand-bright: #4b2fd6; }\n`;
			fireEvent.change(box, { target: { value: edited } });
			expect(await screen.findByText('Hand-edited')).toBeInTheDocument();

			await user.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(saveStudioTheme).toHaveBeenCalled());
			const arg = (saveStudioTheme as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { css: string; essentials: Record<string, string> };
			expect(arg.css).toContain('/* hand-written note */');
			expect(arg.css).toContain('--brand-bright: #4b2fd6;');
			// Identity is reconciled and NOTHING else is: the `@theme` directive follows
			// the record name, byte-for-byte the only difference from what was typed.
			expect(arg.css).toMatch(/@theme\s+harbor\b/);
			expect(arg.css).toEqual(edited.replace(/@theme\s+fab-[0-9a-z]+/, '@theme harbor'));
		});

		it('reads the swatch essentials back out of the RECORD once it is hand-edited', async () => {
			// Four surfaces paint a theme from `essentials`. Left pointing at the
			// pickers they would show the palette the author walked away from.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await user.clear(screen.getByLabelText('Theme name'));
			await user.type(screen.getByLabelText('Theme name'), 'harbor');
			const box = await openCss(user);
			fireEvent.change(box, { target: { value: box.value.replace(/--accent:\s*[^;]+;/, '--accent: #4b2fd6;') } });

			await user.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(saveStudioTheme).toHaveBeenCalled());
			const arg = (saveStudioTheme as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { essentials: Record<string, string> };
			expect(arg.essentials.accent).toBe('#4b2fd6');
			expect(Object.keys(arg.essentials).sort()).toEqual(['accent', 'accentSoft', 'bg', 'bgAlt', 'fail', 'pass', 'textBody', 'textHeading', 'textMuted', 'warn']);
			// BITES: every value must be PAINTABLE. A derived theme's tokens are
			// `light-dark(a, b)` pairs, and `Library.tsx`'s swatch row filters on
			// `/^#|^oklch|^rgb|^hsl/` — so reading the record without resolving the
			// pair blanked the card outright (measured: 0 of 10 swatches survived).
			for (const [k, v] of Object.entries(arg.essentials)) {
				expect(v, `${k} must be paintable as a swatch`).toMatch(/^#|^oklch|^rgb|^hsl/i);
			}
		});

		it('BITES: the AI bar cannot silently re-derive over a hand edit', async () => {
			// `runDescribe` sets core + ramp and clears overrides — the same destructive
			// place as a re-derive button, reached from a text box. The design note calls
			// for the same explicit-overwrite affordance; here it is a disabled control
			// plus a guard behind it.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			// Assert on the PLACEHOLDER, not on `disabled`: no model is connected under
			// jsdom, so the bar is already disabled for an unrelated reason and a
			// disabled-state assertion would pass without the guard existing at all.
			const prompt = screen.getByLabelText('Describe a look') as HTMLInputElement;
			expect(prompt.placeholder).toMatch(/Describe a look/);

			const box = await openCss(user);
			fireEvent.change(box, { target: { value: `${box.value}\n:root { --brand-bright: #4b2fd6; }\n` } });
			await waitFor(() => {
				expect((screen.getByLabelText('Describe a look') as HTMLInputElement).placeholder).toMatch(/Hand-edited/);
			});
			expect(screen.getByLabelText('Describe a look')).toBeDisabled();
		});

		it('going back to Fields ARMS before it discards, and only when there are edits', async () => {
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await openCss(user);

			// Untouched: leaving is free, no confirmation.
			await user.click(screen.getByRole('button', { name: 'Fields' }));
			expect(screen.queryByLabelText('Theme CSS')).toBeNull();

			// Edited: the first click arms, the second discards.
			const box2 = await openCss(user);
			fireEvent.change(box2, { target: { value: `${box2.value}\n:root { --brand-bright: #4b2fd6; }\n` } });
			await user.click(screen.getByRole('button', { name: 'Fields' }));
			expect(await screen.findByRole('button', { name: 'Discard edits?' })).toBeInTheDocument();
			expect(screen.getByLabelText('Theme CSS')).toBeInTheDocument();
			await user.click(screen.getByRole('button', { name: 'Discard edits?' }));
			await waitFor(() => expect(screen.queryByLabelText('Theme CSS')).toBeNull());
			expect(screen.queryByText('Hand-edited')).toBeNull();
		});

		it('leaving the faculty ARMS over unsaved CSS edits, and typing disarms it', async () => {
			// A hand-edited stylesheet is the one thing here that cannot be reproduced
			// by clicking around again, so the in-app exit does not eat one silently.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			const box = await openCss(user);
			const base = box.value;
			fireEvent.change(box, { target: { value: `${base}\n:root { --brand-bright: #4b2fd6; }\n` } });

			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			expect(await screen.findByRole('button', { name: 'Leave and discard your CSS edits' })).toBeInTheDocument();
			expect(screen.getByLabelText('Theme CSS')).toBeInTheDocument();

			// Typing again is "I did not mean that".
			fireEvent.change(screen.getByLabelText('Theme CSS'), { target: { value: `${base}\n:root { --brand-bright: #123456; }\n` } });
			await waitFor(() => expect(screen.getByRole('button', { name: 'Back to Compose' })).toBeInTheDocument());

			// A second click on the armed control does leave.
			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			await user.click(await screen.findByRole('button', { name: 'Leave and discard your CSS edits' }));
			await waitFor(() => expect(screen.queryByLabelText('Theme CSS')).toBeNull());
		});

		/**
		 * THE EDIT PATH, END TO END — and the two-click destruction it opened.
		 *
		 * Reopening a saved theme seeds the record from `seed.css`, which arrives
		 * CLEAN: nothing has been typed. Arming on `handDirty` alone therefore let one
		 * click on Fields drop the author's stored stylesheet with no confirmation, and
		 * because Save is id-pinned the next Save wrote a re-derivation over that exact
		 * record — comments gone, non-contract tokens gone, no version history to undo
		 * it. Arming is on the record's ORIGIN, not on dirtiness.
		 */
		const saveThemeNamed = async (user: ReturnType<typeof userEvent.setup>, name: string, css?: (base: string) => string) => {
			await user.clear(screen.getByLabelText('Theme name'));
			await user.type(screen.getByLabelText('Theme name'), name);
			if (css) {
				const box = await openCss(user);
				fireEvent.change(box, { target: { value: css(box.value) } });
			}
			await user.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(saveStudioTheme).toHaveBeenCalled());
		};

		it('BITES: reopening a SAVED theme arms before it replaces the stored stylesheet', async () => {
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await saveThemeNamed(user, 'harbor', (base) => `${base}\n/* SIGNATURE-KEEP-ME */\n:root { --brand-bright: #4b2fd6; }\n`);
			expect(themeStore[0].css).toContain('SIGNATURE-KEEP-ME');

			// Leave, reopen through the Library — the only path back into a saved theme.
			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			await user.click(screen.getByRole('button', { name: 'Open Library' }));
			await user.click(await screen.findByRole('button', { name: 'Edit Harbor' }));
			const reopened = (await screen.findByLabelText('Theme CSS')) as HTMLTextAreaElement;
			expect(reopened.value).toContain('SIGNATURE-KEEP-ME');

			// ONE click on Fields must NOT discard it — nothing has been typed, so
			// `handDirty` is false, and that is exactly the state the bug lived in.
			await user.click(screen.getByRole('button', { name: 'Fields' }));
			expect(await screen.findByRole('button', { name: 'Replace saved CSS?' })).toBeInTheDocument();
			expect(screen.getByLabelText('Theme CSS')).toBeInTheDocument();
			// The stored record is still intact at this point.
			expect(themeStore[0].css).toContain('SIGNATURE-KEEP-ME');
		});

		it('the id-pinned save UPDATES the record it was opened on rather than adding a second', async () => {
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await saveThemeNamed(user, 'harbor', (base) => `${base}\n/* ONE */\n`);
			expect(themeStore).toHaveLength(1);
			const id = themeStore[0].id;

			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			await user.click(screen.getByRole('button', { name: 'Open Library' }));
			await user.click(await screen.findByRole('button', { name: 'Edit Harbor' }));
			const box = (await screen.findByLabelText('Theme CSS')) as HTMLTextAreaElement;
			fireEvent.change(box, { target: { value: box.value.replace('/* ONE */', '/* TWO */') } });
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(themeStore[0].css).toContain('/* TWO */'));
			expect(themeStore).toHaveLength(1);
			expect(themeStore[0].id).toBe(id);
		});

		it('refuses to save one theme onto ANOTHER saved theme\'s name', async () => {
			// Save is id-pinned, and `putAsset` skips its (kind, name) dedupe when an id
			// is given — so a rename onto a taken name writes two records with one name
			// and the picker resolves by name, leaving the older one unreachable.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await saveThemeNamed(user, 'harbor');
			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			await openFabricate(user);
			await saveThemeNamed(user, 'lagoon');
			expect(themeStore).toHaveLength(2);

			// Rename this one onto the other's name → Save goes away rather than
			// producing a second `harbor`.
			await user.clear(screen.getByLabelText('Theme name'));
			await user.type(screen.getByLabelText('Theme name'), 'harbor');
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
			expect(themeStore).toHaveLength(2);
		});

		it('BITES: a non-hex color in a saved record does not collapse the faculty on reopen', async () => {
			// `oklch()` is the exact case the design note predicts a hand-editor writes.
			// Round-tripped into `core` it hit `validateEssentials`, which THROWS on a
			// non-hex — blank specimen, empty tree, Save disabled, and no message.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			await saveThemeNamed(user, 'harbor', (base) => base.replace(/--accent:\s*[^;]+;/, '--accent: oklch(50% 0.1 250);'));
			for (const [k, v] of Object.entries(themeStore[0].essentials)) {
				expect(v, `${k} must be a hex the pickers can hold`).toMatch(/^#[0-9a-fA-F]{6}$/);
			}

			await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
			await user.click(screen.getByRole('button', { name: 'Open Library' }));
			await user.click(await screen.findByRole('button', { name: 'Edit Harbor' }));
			await user.click(await screen.findByRole('button', { name: 'Fields' }));
			await user.click(await screen.findByRole('button', { name: 'Replace saved CSS?' }));

			// The faculty is alive: the token tree renders and Save is available.
			expect(await screen.findByText(/Contract . \d+ roles/)).toBeInTheDocument();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});

		it('BITES: CSS that reaches off the device is withheld from the preview frame', async () => {
			// The `extraCss={cssBlocked ? '' : css}` pattern, applied to a theme. A
			// conformance error must NOT do this — see the next test.
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			const box = await openCss(user);
			const specimen = document.querySelector('[data-label="Theme specimen"]') as HTMLElement;
			expect(specimen.getAttribute('data-extra-theme')).toMatch(/^fab-/);

			fireEvent.change(box, { target: { value: `${box.value}\n:root { --leak: url(https://evil.example/?beacon); }\n` } });
			await waitFor(() => expect(specimen.getAttribute('data-extra-theme')).toBe(''));
			expect(await screen.findByText(/The preview is paused/)).toBeInTheDocument();
		});

		it('…but a merely non-conforming theme keeps rendering while you fix it', async () => {
			const user = userEvent.setup();
			render(<StudioShell options={options} />);
			await openFabricate(user);
			const box = await openCss(user);
			const specimen = document.querySelector('[data-label="Theme specimen"]') as HTMLElement;

			fireEvent.change(box, { target: { value: box.value.replace(/--spectrum:\s*[^;]+;/, '') } });
			await waitFor(() => expect(screen.queryByText(/is not declared/)).toBeInTheDocument());
			expect(specimen.getAttribute('data-extra-theme')).not.toBe('');
			expect(screen.queryByText(/The preview is paused/)).toBeNull();
		});
	});

	it('removes a saved theme and reverts the deck to a built-in palette', async () => {
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await openFabricate(user);
		const nameInput = screen.getByLabelText('Theme name') as HTMLInputElement;
		await user.clear(nameInput);
		await user.type(nameInput, 'ocean');
		await user.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(saveStudioTheme).toHaveBeenCalled());

		await user.click(screen.getByRole('button', { name: 'Back to Compose' }));
		await user.click(screen.getByRole('button', { name: 'Deck scope' }));
		// Select it via the grouped dropdown, then delete it from the "Manage saved" list.
		await user.click(await screen.findByRole('combobox', { name: 'Choose deck theme' }));
		await user.click(await screen.findByRole('option', { name: 'Ocean' }));
		await user.click(await screen.findByRole('button', { name: 'Delete Ocean' }));
		// The entry is dropped and the deck falls back to a built-in palette.
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Ocean' })).toBeNull());
		const preview = document.querySelector('[data-label="Live deck preview"]') as HTMLElement;
		expect(preview.getAttribute('data-extra-theme')).toBe('');
	});
});
