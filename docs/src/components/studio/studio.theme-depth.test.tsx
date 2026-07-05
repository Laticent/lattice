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
		saveStudioTheme: vi.fn(async (input: { name: string; label: string; css: string; essentials: Record<string, string> }) => {
			// Mirror the real name resolution (trust a valid slug name, else the label
			// slug) so the mock's stored name matches production.
			const name = /^[a-z][a-z0-9-]*$/.test(input.name) ? input.name : (actual.slugify as (s: string) => string)(input.label) || input.name;
			const t = { id: `t_${name}`, name, label: input.label, css: input.css, essentials: input.essentials };
			const i = themeStore.findIndex((x) => x.name === t.name);
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

		// A categorical fill is mode-independent — one "value" well, no light/dark split.
		await user.click(screen.getByRole('button', { name: 'Categorical 1 · fill' }));
		expect(screen.getByLabelText('Categorical 1 · fill value')).toBeTruthy();
		expect(screen.queryByLabelText('Categorical 1 · fill dark')).toBeNull();
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
		await user.click(await screen.findByRole('button', { name: 'Choose theme' }));
		// …and selecting it threads the saved theme into the live deck preview.
		await user.click(await screen.findByRole('menuitem', { name: 'Ocean' }));
		const preview = document.querySelector('[data-label="Live deck preview"]') as HTMLElement;
		await waitFor(() => expect(preview.getAttribute('data-extra-theme')).toBe('ocean'));
		expect(preview.getAttribute('data-palette-override')).toBe('ocean');
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
		await user.click(await screen.findByRole('button', { name: 'Choose theme' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Ocean' }));
		await user.click(await screen.findByRole('button', { name: 'Delete Ocean' }));
		// The entry is dropped and the deck falls back to a built-in palette.
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Ocean' })).toBeNull());
		const preview = document.querySelector('[data-label="Live deck preview"]') as HTMLElement;
		expect(preview.getAttribute('data-extra-theme')).toBe('');
	});
});
