import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// What the sheet mounts, not the rows' own behavior (DeckConfigPanel.test.tsx). The panel is
// lazy, so these tests wait for it to arrive, which is also what a reader's first tap does.
vi.mock('@/playground/debug-overlay.js', () => ({ deckDebugOn: () => false }));
vi.mock('@/playground/debug-prefs.js', () => ({
	debugEffectiveOn: (d: boolean) => d,
	onDebugOverrideChange: () => () => {},
	setDebugOverride: () => {},
}));

import { DeckSetupSheet } from './DeckSetupSheet';

async function open() {
	const user = userEvent.setup();
	render(<DeckSetupSheet getSource={() => '# Deck'} setSource={() => {}} palettes={['cuoio', 'indaco']} finishes={['atrium']} configured={false} />);
	await user.click(screen.getByRole('button', { name: 'Deck settings' }));
	return screen.findByRole('combobox', { name: 'Choose theme' }, { timeout: 5000 });
}

describe('DeckSetupSheet — the panel it mounts', () => {
	it('draws the Theme row, and its Auto head names the site palette', async () => {
		// The defect this pins: the sheet once passed a profile (`noTheme`) that was every field
		// MINUS `theme`, on the reasoning that "the top-bar palette picker owns theme on this
		// surface". That picker is hidden below the `lg` breakpoint (PaletteControls'
		// `compact`), so on a phone the Playground had no theme control anywhere.
		document.documentElement.setAttribute('data-palette', 'indaco');
		const theme = await open();
		expect(theme).toHaveTextContent('Auto — follow the site (Indaco)');
		// The Mode row needs the mode vocabulary to draw (the 2026-08-18 coverage audit §4.2).
		expect(screen.getByRole('combobox', { name: 'Choose mode' })).toBeInTheDocument();
	});

	it('does not arm a form control by merely opening', async () => {
		// Radix focuses the first focusable descendant on open. That was the first row's
		// control, and iOS Safari opens a native select's picker on the tap that GIVES it
		// focus — so a pre-focused one swallowed the first tap.
		await open();
		const active = document.activeElement;
		expect(['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON']).not.toContain(active?.tagName);
		expect(active?.closest('[data-slot="sheet-content"]'), 'focus still lands inside the sheet').toBeTruthy();
	});
});
