// @vitest-environment node
// Builds React elements but mounts none, so it needs no DOM.
import { describe, expect, it } from 'vitest';
import { PACE_NAMES } from '../../../../lib/core/resolve-pace.mjs';
import { CARD_ROWS } from './card-row-catalog';
import { CORNERS } from './corners-catalog';
import { GUARDS } from './guards-catalog';
import { HEADLINES } from './headline-catalog';
import { MOTION_SPEED_ENTRIES } from './motion-catalog';
import { type GlyphAxis, optionGlyph } from './option-glyphs';
import { CARD_TAG_AXES, imageCardWords } from './slide-provenance';
import { SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';
import { SPECTRUM_EDGES } from './spectrum-edge-catalog';

// Rot-guard: an axis that draws library icons draws one for EVERY value. A value added to a
// catalog without a glyph would render as the one bare row in an otherwise iconed list.
const covered: [GlyphAxis, readonly string[]][] = [
	['edge', SPECTRUM_EDGES.map((e) => e.name)],
	['edge', SPECTRUM_CARD_EDGES.map((e) => e.name)],
	['align', HEADLINES.map((e) => e.name)],
	['align', CARD_TAG_AXES.align],
	['cardRows', CARD_ROWS.map((e) => e.name)],
	['corners', CORNERS.map((e) => e.name)],
	['fit', GUARDS.map((e) => e.name)],
	['speed', MOTION_SPEED_ENTRIES.map((e) => e.name)],
	['pace', PACE_NAMES],
	['split', ['headings', 'rule']],
	['tagSize', CARD_TAG_AXES.size],
	['imagePlacement', imageCardWords('placement')],
	['imageInk', imageCardWords('ink')],
	['imageSize', imageCardWords('size')],
	['imageDensity', imageCardWords('density')],
	['imageShape', imageCardWords('shape')],
];

describe('option glyphs cover every value of their axis', () => {
	for (const [axis, values] of covered) {
		it(`${axis}: ${values.join(', ')}`, () => {
			for (const v of values) expect(optionGlyph(axis, v), `${axis} has no glyph for "${v}"`).toBeDefined();
		});
	}

	it('an unknown value draws nothing rather than a wrong icon', () => {
		expect(optionGlyph('edge', 'diagonal')).toBeUndefined();
	});
});
