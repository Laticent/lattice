// @vitest-environment node
// Builds React elements but mounts none, so it needs no DOM.
import { describe, expect, it } from 'vitest';
import { PROFILE_NAMES } from '../../../../lib/authoring/deck-profiles.js';
import deckSettings from '../../../../lib/core/deck-settings.js';
import { DELIVERY_NAMES } from '../../../../lib/core/delivery-names.mjs';
import { PACE_NAMES } from '../../../../lib/core/resolve-pace.mjs';
import { STAMP_SHAPE_NAMES } from '../../../../lib/core/resolve-stamp-shape.js';
import { TONE_STYLE_NAMES } from '../../../../lib/core/resolve-tone-style.js';
import { MOTION_SPEED_ENTRIES } from '../../lib/motion-catalog';
import { ALIGN_HORIZONTAL, ALIGN_VERTICAL } from './align-catalog';
import { CARD_SPECTRUM_EDGES } from './card-spectrum-edge-catalog';
import { FIT } from './fit-catalog';
import { HEADLINE_ALIGNS } from './headline-align-catalog';
import { logoWordOptions } from './logo-words';
import { DEFAULT_STAMP_SHAPE, DEFAULT_TONE, type GlyphAxis, optionGlyph } from './option-glyphs';
import { SLIDE_CORNERS } from './slide-corners-catalog';
import { CARD_TAG_AXES, imageCardWords } from './slide-provenance';
import { SPECTRUM_EDGES } from './spectrum-edge-catalog';
import { VENUES } from './venue';

// Rot-guard: an axis that draws library icons draws one for EVERY value. A value added to a
// catalog without a glyph would render as the one bare row in an otherwise iconed list.
const covered: [GlyphAxis, readonly string[]][] = [
	['edge', SPECTRUM_EDGES.map((e) => e.name)],
	['edge', CARD_SPECTRUM_EDGES.map((e) => e.name)],
	['align', HEADLINE_ALIGNS.map((e) => e.name)],
	['align', CARD_TAG_AXES.align],
	['alignV', ALIGN_VERTICAL.map((e) => e.name)],
	['alignH', ALIGN_HORIZONTAL.map((e) => e.name)],
	['slide-corners', SLIDE_CORNERS.map((e) => e.name)],
	['fit', FIT.map((e) => e.name)],
	['speed', MOTION_SPEED_ENTRIES.map((e) => e.name)],
	['pace', PACE_NAMES],
	['split', ['headings', 'rule']],
	['tagSize', CARD_TAG_AXES.size],
	['imagePlacement', imageCardWords('placement')],
	['imageInk', imageCardWords('ink')],
	['imageSize', imageCardWords('size')],
	['imageDensity', imageCardWords('density')],
	['imageShape', imageCardWords('shape')],
	['tagColor', CARD_TAG_AXES.color],
	['tagPlacement', CARD_TAG_AXES.placement],
	['stamp-shape', STAMP_SHAPE_NAMES],
	['tone', TONE_STYLE_NAMES],
	['delivery', DELIVERY_NAMES],
	['venue', VENUES.map((v) => v.value)],
	['logoPlacement', logoWordOptions('placement')],
	['logoColor', logoWordOptions('color')],
	['logoSize', logoWordOptions('size')],
	['logoScope', logoWordOptions('scope')],
	['profile', PROFILE_NAMES],
	// The debug overlay's four values (StudioShell DEBUG_OPTIONS; `debug:` in deck-settings.js).
	['debug', ['on-hover', 'on-hover verbose', 'on-always', 'on-always verbose']],
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

// The stamp and tone pickers' Auto heads name these; the engine's table is the truth.
describe('the mirrored stamp and tone defaults', () => {
	it('match the engine default in lib/core/deck-settings.js', () => {
		expect(DEFAULT_STAMP_SHAPE).toBe(deckSettings.deckSetting('stamp-shape')?.default);
		expect(DEFAULT_TONE).toBe(deckSettings.deckSetting('tone')?.default);
	});
});
