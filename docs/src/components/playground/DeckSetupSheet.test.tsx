import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Spy on the vanilla panel factory — this suite is about what the HOST hands it, not
// about the rows it draws (those are test/unit/playground/deck-config.test.js).
const createConfigPanel = vi.fn(() => ({ render: () => {}, syncTrigger: () => {} }));
vi.mock('@/playground/deck-config.js', () => ({
	createConfigPanel: (...args: unknown[]) => createConfigPanel(...(args as [])),
	CONFIG_PROFILES: { noTheme: ['mode', 'color-mode', 'finish'] },
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
		const opts = createConfigPanel.mock.calls.at(-1)?.[0] as unknown as { modes?: string[]; fields?: string[] };
		expect(opts.modes, 'the host must hand the panel its mode vocabulary').toBeTruthy();
		expect((opts.modes ?? []).length).toBeGreaterThan(0);
		// …and every name is a real register value, not a label — the panel writes these
		// straight into `mode:` front matter.
		for (const name of opts.modes ?? []) expect(name).toMatch(/^[a-z][a-z-]*$/);
		// The row is only reachable if the profile still lists it, so pin both halves.
		expect(opts.fields).toContain('mode');
	});
});
