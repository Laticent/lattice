// The Studio side of the `preset:` register — a named look that sets the accent + surface
// family at once (lib/core/resolve-preset.js, and the table in lib/core/front-matter-key.js).
//
// The ENGINE resolves a preset; this file only has to agree with it. Three things the deck
// panel needs that the engine does not:
//
//   · what a row SHOWS — the deck's own key if it wrote one, else the preset's value, else
//     the engine default (`registerValue`);
//   · what a row WRITES — nothing when the choice equals what the preset already gives, so
//     picking the preset's own value clears the override instead of restating it
//     (`writeRegister`);
//   · how far the deck has drifted from its preset — the "Editorial · 2 changes" count and
//     the Reset that clears them (`presetChanges`, `clearPresetOverrides`).
//
// The table is read from the engine, not copied (HARD RULE #15). It comes through a DEFAULT
// import because front-matter-key.js is CommonJS outside the docs root: Rollup resolves a
// default import off it, not named ones (see lib/core/resolve-motion.mjs, which does the same).
// The only thing added here is the human layer — a label, a blurb and a swatch per preset.
// Rot-guard: deck-preset.test.ts.

import frontMatterKey from '../../../../lib/core/front-matter-key.js';
import { getFrontMatter, getFrontMatterName, writeFrontMatterLine } from './front-matter';
import { activeSpectrum } from './spectrum-catalog';

type PresetTable = Record<string, { label: string; desc: string; values: Record<string, string> }>;
const ENGINE = frontMatterKey as unknown as {
	PRESETS: PresetTable;
	PRESET_NAMES: readonly string[];
	PRESET_KEYS: readonly string[];
	PRESET_DEFAULTS: Record<string, string>;
	presetEffective: (name: string, key: string) => string | null;
	isKnownPreset: (value: unknown) => boolean;
};

export const PRESET_KEYS: readonly string[] = ENGINE.PRESET_KEYS;
export const PRESET_NAMES: readonly string[] = ENGINE.PRESET_NAMES;
/** The preset a deck with no `preset:` key is on — the house default, named. */
export const DEFAULT_PRESET = 'classic';

const AC = 'var(--accent)';
// A swatch is a thumbnail of the look: a bar along the top edge, and a rule under a heading.
const RAINBOW = activeSpectrum('on').swatch.background;
// Sizes go in `backgroundSize`, never inside the `background` shorthand: a shorthand that holds
// a `var()` is parsed only at computed-value time, and SwatchChip's separate `backgroundSize`
// write then resets every layer's size to `auto` — measured, the Classic chip rendered as a
// full rainbow square instead of a bar.
const SWATCHES: Record<string, { background: string; backgroundSize: string }> = {
	classic: {
		background: `${RAINBOW} top no-repeat, linear-gradient(var(--border), var(--border)) 3px 60% no-repeat, var(--bg)`,
		backgroundSize: '100% 3px, calc(100% - 6px) 1px, auto',
	},
	editorial: {
		background: `linear-gradient(${AC}, ${AC}) 3px 60% no-repeat, linear-gradient(${AC}, ${AC}) 3px 30% no-repeat, var(--bg)`,
		backgroundSize: '40% 2px, 2px 20%, auto',
	},
	brand: {
		background: `linear-gradient(${AC}, ${AC}) top no-repeat, linear-gradient(${AC}, ${AC}) left no-repeat, linear-gradient(${AC}, ${AC}) 6px 60% no-repeat, var(--bg)`,
		backgroundSize: '100% 3px, 3px 100%, 30% 2px, auto',
	},
	minimal: { background: 'var(--bg)', backgroundSize: 'auto' },
};

export type PresetEntry = { name: string; label: string; blurb: string; swatch: { background: string; backgroundSize: string } };

/** The picker's entries, in the engine's order. */
export const PRESET_ENTRIES: PresetEntry[] = PRESET_NAMES.map((name) => ({
	name,
	label: ENGINE.PRESETS[name].label,
	blurb: ENGINE.PRESETS[name].desc,
	swatch: SWATCHES[name] ?? { background: 'var(--bg)', backgroundSize: 'auto' },
}));

/** The deck's preset — its `preset:` key when that names a known preset, else the default.
 *  An unknown name reads as the default here because the engine resolves it to nothing. */
export function presetOf(source: string): string {
	const raw = (getFrontMatterName(source, 'preset') || '').toLowerCase();
	return ENGINE.isKnownPreset(raw) ? raw : DEFAULT_PRESET;
}

/** What `key` resolves to under the preset alone, before any key the deck wrote. */
export function presetBaseline(source: string, key: string): string {
	return ENGINE.presetEffective(presetOf(source), key) ?? ENGINE.PRESET_DEFAULTS[key] ?? '';
}

/** What a deck-panel row shows for `key`: the deck's own value, else the preset's. */
export function registerValue(source: string, key: string): string {
	return getFrontMatter(source, key) || presetBaseline(source, key);
}

/** Write `key`, or clear it when `value` is what the preset already gives. */
export function writeRegister(source: string, key: string, value: string): string {
	return writeFrontMatterLine(source, key, value === presetBaseline(source, key) ? null : value);
}

/** The preset keys this deck sets to something OTHER than its preset's value. A key restated
 *  at the preset's own value is not a change, so it does not count. */
export function presetChanges(source: string): string[] {
	return PRESET_KEYS.filter((key) => {
		const own = getFrontMatter(source, key);
		return own !== undefined && own !== '' && own.trim().toLowerCase() !== presetBaseline(source, key);
	});
}

/** Remove every preset key the deck writes, so the preset renders exactly as named. */
export function clearPresetOverrides(source: string): string {
	return PRESET_KEYS.reduce((s, key) => writeFrontMatterLine(s, key, null), source);
}

/**
 * Switch the deck to preset `name`. Picking a preset is starting from that look, so it also
 * clears the overrides — otherwise a `rule: short` left over from Editorial would ride into
 * Minimal and the author would see neither the look they picked nor why. The caller offers
 * Undo; the count it reports is what was cleared.
 */
export function applyPreset(source: string, name: string): { source: string; cleared: number } {
	const cleared = presetChanges(source).length;
	const base = clearPresetOverrides(source);
	return { source: writeFrontMatterLine(base, 'preset', name === DEFAULT_PRESET ? null : name), cleared };
}
