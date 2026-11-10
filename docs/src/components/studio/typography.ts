// The deck `typography:` register in the Studio — Look → Typography.
//
// The set list is read from the engine (lib/core/resolve-typography.js), not copied (HARD RULE
// #15). It comes through a DEFAULT import because the module is CommonJS outside the docs root
// (the same reason deck-preset.ts imports front-matter-key.js that way). A preset carries a set,
// so the value shown and the line written go through deck-preset.ts's `registerValue` /
// `writeRegister`: picking the set the preset already gives removes the line rather than
// restating it. Rot-guard: typography.test.ts.

import typographyCore from '../../../../lib/core/resolve-typography.js';
import { registerValue, writeRegister } from './deck-preset';

type TypographySet = { label: string; desc: string; display: string; body: string; cls: string };
const ENGINE = typographyCore as unknown as {
	TYPOGRAPHY_SETS: Record<string, TypographySet>;
	TYPOGRAPHY_NAMES: readonly string[];
	TYPOGRAPHY_DEFAULT: string;
};

export type TypographyOption = { value: string; label: string; faces: string; desc: string };

/** The curated sets, in panel order: the value, its label, the two faces and the one-line blurb. */
export const TYPOGRAPHY_OPTIONS: readonly TypographyOption[] = ENGINE.TYPOGRAPHY_NAMES.map((name) => {
	const set = ENGINE.TYPOGRAPHY_SETS[name];
	return { value: name, label: set.label, faces: `${set.display} + ${set.body}`, desc: set.desc };
});

/** The set a deck renders in: its own `typography:`, else its preset's, else classic. */
export function deckTypography(source: string): string {
	const v = registerValue(source, 'typography').toLowerCase();
	return ENGINE.TYPOGRAPHY_NAMES.includes(v) ? v : ENGINE.TYPOGRAPHY_DEFAULT;
}

/** Write the deck's set; the line is dropped when it equals what the preset already gives. */
export function withTypography(source: string, value: string): string {
	return writeRegister(source, 'typography', value);
}
