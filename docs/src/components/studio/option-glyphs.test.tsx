// @vitest-environment node
// Builds React elements but mounts none, so it needs no DOM.
import { describe, expect, it } from 'vitest';
import { PROFILE_NAMES } from '../../../../lib/authoring/deck-profiles.js';
import deckSettings from '../../../../lib/core/deck-settings.js';
import { DELIVERY_NAMES } from '../../../../lib/core/delivery-names.mjs';
import { PACE_NAMES } from '../../../../lib/core/resolve-pace.mjs';
import { STAMP_STYLE_NAMES } from '../../../../lib/core/resolve-stamp.js';
import { TONE_STYLE_NAMES } from '../../../../lib/core/resolve-tone-style.js';
import { CARD_ROWS } from './card-row-catalog';
import { CORNERS } from './corners-catalog';
import { GUARDS } from './guards-catalog';
import { HEADLINES } from './headline-catalog';
import { logoFinishOptions } from './logo-finish';
import { MOTION_SPEED_ENTRIES } from './motion-catalog';
import { DEFAULT_STAMP, DEFAULT_TONE, type GlyphAxis, optionGlyph } from './option-glyphs';
import { CARD_TAG_AXES, imageCardWords } from './slide-provenance';
import { SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';
import { SPECTRUM_EDGES } from './spectrum-edge-catalog';
import { VENUES } from './venue';

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
	['tagColor', CARD_TAG_AXES.color],
	['tagPlacement', CARD_TAG_AXES.placement],
	['stamp', STAMP_STYLE_NAMES],
	['tone', TONE_STYLE_NAMES],
	['delivery', DELIVERY_NAMES],
	['venue', VENUES.map((v) => v.value)],
	['logoPlacement', logoFinishOptions('placement')],
	['logoColor', logoFinishOptions('color')],
	['logoSize', logoFinishOptions('size')],
	['logoScope', logoFinishOptions('scope')],
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
		expect(DEFAULT_STAMP).toBe(deckSettings.deckSetting('stamp')?.default);
		expect(DEFAULT_TONE).toBe(deckSettings.deckSetting('tone')?.default);
	});
});
