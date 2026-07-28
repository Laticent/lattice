import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PANEL_SEARCH_BOX } from './panel';

// The command palette cannot USE `PanelSearch` — cmdk owns its own input element — so
// it re-states the same box as descendant-variant classes on the `Command` wrapper.
// Two things can rot there, and both did once:
//
//   1. The two drift apart, and the palette's field stops matching the Library's. That
//      is the defect this pair exists to prevent (a focused palette field drew a second
//      rounded box inside the first; reported from a real Android phone).
//   2. Someone "DRYs" it by interpolating `PANEL_SEARCH_BOX` into the variant prefix.
//      That type-checks, lints, and generates NO CSS — Tailwind's scanner reads source
//      text, not evaluated template literals. The same trap shipped every mobile panel
//      at content height earlier in this branch, and it is invisible to every test that
//      does not read the source.
//
// So this test reads the SOURCE, not the DOM: it asserts every utility in the shared
// box has a literal descendant-variant twin in CommandPalette.tsx, and that the file
// contains no interpolated variant.
const SRC = fs.readFileSync(path.join(__dirname, '../studio/CommandPalette.tsx'), 'utf8');
const WRAPPER = '[&_[data-slot=command-input-wrapper]]:';

describe('the palette field and PanelSearch stay in step', () => {
	it('every utility in PANEL_SEARCH_BOX has a literal twin on the palette wrapper', () => {
		const missing = PANEL_SEARCH_BOX.split(/\s+/).filter(Boolean).filter((u) => !SRC.includes(WRAPPER + u));
		expect(missing, `not mirrored in CommandPalette.tsx: ${missing.join(', ')}`).toEqual([]);
	});

	it('the palette states its classes literally — no interpolated Tailwind', () => {
		// A `${…}` anywhere inside a variant prefix means the class never reaches the
		// scanner. Catch the shape, not one spelling of it.
		expect(SRC).not.toMatch(/\[&_\[data-slot=command-input[^\]]*\]\]:\$\{/);
		expect(SRC).not.toContain('PANEL_SEARCH_BOX.split');
	});

	it('the input inside the box is chromeless — the box owns the border and the ring', () => {
		// The reported defect: cmdk's input kept its own `rounded-md` and focus outline
		// inside a bordered wrapper, so focusing drew 44px of box inside 46px of box.
		expect(SRC).toContain('[&_[data-slot=command-input]]:rounded-none');
		// The app's global focus ring is UNLAYERED (styles/native-widgets.css) and Tailwind's
		// utilities are layered, so unlayered wins at any specificity — no `outline-none`
		// class of any specificity can turn it off. The opt-out is an attribute.
		expect(SRC).toContain('data-focus-ring="container"');
	});
});
