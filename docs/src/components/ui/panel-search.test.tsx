import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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
// EVERY cmdk field on the site, not just the palette's. The Playground's component picker
// was the third surface to hit the identical bug and the second to hit it ON A REAL PHONE:
// it never adopted this convention at all, so the global `:focus-visible` outline — 2px at
// 2px offset, i.e. 4px OUTSIDE the input's border box — was clipped along its top edge by
// the popover's `overflow-hidden`. Measured with the keyboard up on a real WebKit iPhone:
// input y=172..212, so its ring wanted y=168..216, against a panel clipping at y=171.
// Reported from a real iPhone. Adding the surface here rather than writing it a private
// test is the point — the next cmdk field gets one line, and the convention holds.
const SURFACES = [
	{ file: '../studio/CommandPalette.tsx', name: 'CommandPalette.tsx' },
	{ file: '../playground/ComponentPicker.tsx', name: 'ComponentPicker.tsx' },
] as const;
const WRAPPER = '[&_[data-slot=command-input-wrapper]]:';

describe.each(SURFACES)('$name and PanelSearch stay in step', ({ file, name }) => {
	const SRC = fs.readFileSync(path.join(__dirname, file), 'utf8');

	it('every utility in PANEL_SEARCH_BOX has a literal twin on the wrapper', () => {
		const missing = PANEL_SEARCH_BOX.split(/\s+/).filter(Boolean).filter((u) => !SRC.includes(WRAPPER + u));
		expect(missing, `not mirrored in ${name}: ${missing.join(', ')}`).toEqual([]);
	});

	it('states its classes literally — no interpolated Tailwind', () => {
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

	it('lets the type set the field height instead of pinning it', () => {
		// `h-auto` + the wrapper's `py-2` means the box is the line box plus padding, so a
		// 16px field (the iOS zoom floor — anything smaller and Safari zooms the viewport on
		// focus) lands at ~44px on its own. A fixed height is how it goes wrong: an earlier
		// cut of the picker forced `h-10`, and 40px around a 25.6px line box is 7.2px of
		// slack top and bottom, which is what reads as cramped on a phone.
		expect(SRC).toContain('[&_[data-slot=command-input]]:h-auto');
		expect(SRC, 'a fixed h-<n> on the cmdk input overrides h-auto').not.toMatch(/\[&_\[data-slot=command-input\]\]:h-\d/);
		// …and not on the element either, which is how the picker did it.
		expect(SRC, 'a fixed height passed to <CommandInput> directly').not.toMatch(/<CommandInput[^>]*className="[^"]*\bh-\d/s);
	});
});
