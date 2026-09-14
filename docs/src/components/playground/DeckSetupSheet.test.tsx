import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Spy on the vanilla panel factory — this suite is about what the HOST hands it, not
// about the rows it draws (those are test/unit/playground/deck-config.test.js).
type PanelOpts = { modes?: string[]; fields?: string[] | null; palettes?: string[]; finishes?: string[]; getDefaultTheme?: () => string };
const createConfigPanel = vi.fn((_opts: PanelOpts) => ({ render: () => {}, syncTrigger: () => {} }));
vi.mock('@/playground/deck-config.js', () => ({
	createConfigPanel: (opts: PanelOpts) => createConfigPanel(opts),
	// `author` is null in the real module — "every field", which is how the theme row
	// reaches this surface. `noTheme` is kept here only so a regression back to it would
	// fail loudly on the profile assertions below rather than silently pass.
	CONFIG_PROFILES: { author: null, noTheme: ['mode', 'color-mode', 'finish'] },
	readFrontMatter: () => ({ configured: false }),
}));
vi.mock('@/playground/debug-overlay.js', () => ({ deckDebugOn: () => false }));
vi.mock('@/playground/debug-prefs.js', () => ({
	debugEffectiveOn: (d: boolean) => d,
	onDebugOverrideChange: () => () => {},
	setDebugOverride: () => {},
}));

import { DeckSetupSheet } from './DeckSetupSheet';

describe('DeckSetupSheet — what it hands the vanilla config panel', () => {
	it('passes MODE NAMES, so the Mode row actually renders', async () => {
		// The defect this pins (2026-08-18 coverage audit §4.2): `mode` was in the noTheme
		// profile, but deck-config gates the row on `modes.length` and this host passed
		// none — so the Playground's Mode row was in the config and never drawn. A profile
		// entry is not enough on its own; the names have to arrive too.
		const user = userEvent.setup();
		render(
			<DeckSetupSheet
				getSource={() => '# Deck'}
				setSource={() => {}}
				palettes={['cuoio', 'indaco']}
				finishes={['atrium']}
				configured={false}
			/>,
		);
		await user.click(screen.getByRole('button', { name: 'Deck Setting' }));
		await waitFor(() => expect(createConfigPanel).toHaveBeenCalled());
		const opts = createConfigPanel.mock.calls.at(-1)?.[0] as PanelOpts;
		expect(opts.modes, 'the host must hand the panel its mode vocabulary').toBeTruthy();
		expect((opts.modes ?? []).length).toBeGreaterThan(0);
		// …and every name is a real register value, not a label — the panel writes these
		// straight into `mode:` front matter.
		for (const name of opts.modes ?? []) expect(name).toMatch(/^[a-z][a-z-]*$/);
		// The row is only reachable if the profile admits it, so pin both halves. `null`
		// is the full-field profile; an array has to name `mode` explicitly.
		expect(opts.fields === null || (opts.fields ?? []).includes('mode')).toBe(true);
	});

	it('uses a profile that ADMITS theme, and tells the panel what the site palette is', async () => {
		// The defect this pins: the sheet passed `noTheme`, which is the full field set
		// MINUS `theme`, on the stated reasoning that "the top-bar palette picker owns
		// theme on this surface". That picker is hidden below the `lg` breakpoint
		// (PaletteControls' `compact`), so on a phone the near control was withheld in
		// favor of a far one that was not rendered — the Playground had no theme control
		// anywhere. A profile that lists every field except this one is the shape to
		// catch, so assert on `theme` specifically rather than on the profile's name.
		const user = userEvent.setup();
		render(
			<DeckSetupSheet
				getSource={() => '# Deck'}
				setSource={() => {}}
				palettes={['cuoio', 'indaco']}
				finishes={['atrium']}
				configured={false}
			/>,
		);
		await user.click(screen.getByRole('button', { name: 'Deck Setting' }));
		await waitFor(() => expect(createConfigPanel).toHaveBeenCalled());
		const opts = createConfigPanel.mock.calls.at(-1)?.[0] as PanelOpts;
		expect(opts.fields === null || (opts.fields ?? []).includes('theme'), 'the deck-theme row must be reachable here').toBe(true);
		// The row's Automatic stop names the palette an un-pinned deck falls back to, so
		// the host owes the panel that value — a row is not enough on its own.
		expect(typeof opts.getDefaultTheme).toBe('function');
		document.documentElement.setAttribute('data-palette', 'burgundy');
		expect(opts.getDefaultTheme?.()).toBe('burgundy');
	});

	it('does not arm a form control by merely opening', async () => {
		// Radix focuses the first focusable descendant on open. That was the first row's
		// <select>, and iOS Safari opens a select's picker on the tap that GIVES it focus
		// — so a pre-focused one swallowed the first tap and the row looked dead until you
		// touched something else and came back.
		const user = userEvent.setup();
		render(
			<DeckSetupSheet
				getSource={() => '# Deck'}
				setSource={() => {}}
				palettes={['cuoio']}
				finishes={['atrium']}
				configured={false}
			/>,
		);
		await user.click(screen.getByRole('button', { name: 'Deck Setting' }));
		await waitFor(() => expect(createConfigPanel).toHaveBeenCalled());
		const active = document.activeElement;
		expect(['SELECT', 'INPUT', 'TEXTAREA']).not.toContain(active?.tagName);
		expect(active?.closest('[data-slot="sheet-content"]'), 'focus still lands inside the sheet').toBeTruthy();
	});
});
