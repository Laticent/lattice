// The Studio side of the `preset:` register — a named look that sets the backdrop, alignment and accent
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
// The only things added here are the human layer — a label and a blurb per preset — and the
// sample deck each picker tile renders live (`PRESET_SAMPLE`, `presetSampleDeck`).
// Rot-guard: deck-preset.test.ts.

import frontMatterKey from '../../../../lib/core/front-matter-key.js';
import { frontMatterKeySpan, getFrontMatterName, writeFrontMatterLine } from '../../lib/front-matter';

type PresetTable = Record<string, { label: string; desc: string; values: Record<string, string> }>;
const ENGINE = frontMatterKey as unknown as {
	PRESETS: PresetTable;
	PRESET_NAMES: readonly string[];
	PRESET_KEYS: readonly string[];
	PRESET_DEFAULTS: Record<string, string>;
	presetEffective: (name: string, key: string) => string | null;
	isKnownPreset: (value: unknown) => boolean;
	frontMatterScalar: (raw: string) => string;
	presetValue: (name: string, key: string) => string | null;
};

export const PRESET_KEYS: readonly string[] = ENGINE.PRESET_KEYS;

/**
 * The preset keys that are the AUTHOR'S to keep: a preset RECOMMENDS a palette and a color mode
 * (engineering/decisions/2026-11-20-deck-preset-study.md §5 D1), but a deck that names its own has made a
 * choice the look picker must not undo. So these never count as drift from the preset, Reset never
 * clears them, and a picker tile keeps them — the tile shows the preset in the deck's own palette.
 */
export const AUTHOR_KEYS: readonly string[] = ['theme', 'color-mode'];

/** Keys the engine reads at COLUMN 0 only (`topLevelRegisterValue`): an indented line is someone else's key. */
const TOP_LEVEL_KEYS = new Set(['theme', 'color-mode', 'backdrop']);
/** Keys whose value is more than one word (`marks: etch vivid`, `backdrop: 40 clear`): read whole, not as a bare name. */
const MULTI_WORD_KEYS = new Set(['marks', 'backdrop']);
/** Keys read case-sensitively: a saved palette is matched by its name as written. */
const CASE_KEPT_KEYS = new Set(['theme']);
export const PRESET_NAMES: readonly string[] = ENGINE.PRESET_NAMES;
/** The preset a deck with no `preset:` key is on — the house default, named. */
export const DEFAULT_PRESET = 'classic';

export type PresetEntry = { name: string; label: string; blurb: string };

/** The picker's entries, in the engine's order. */
export const PRESET_ENTRIES: PresetEntry[] = PRESET_NAMES.map((name) => ({
	name,
	label: ENGINE.PRESETS[name].label,
	blurb: ENGINE.PRESETS[name].desc,
}));

/** The deck's preset — its `preset:` key when that names a known preset, else the default.
 *  An unknown name reads as the default here because the engine resolves it to nothing. */
export function presetOf(source: string): string {
	// Column 0 only, as the engine reads it (`topLevelFrontMatterValue`): an indented
	// `preset:` is someone else's nested key, and the picker could not rewrite it anyway.
	const span = frontMatterKeySpan(source, 'preset');
	const raw = span && !span.indent ? (getFrontMatterName(source, 'preset') || '').toLowerCase() : '';
	return ENGINE.isKnownPreset(raw) ? raw : DEFAULT_PRESET;
}

/**
 * What the deck's preset RECOMMENDS for an author key (`theme`, `color-mode`) that the deck leaves to it,
 * or null: the deck writes its own, the preset recommends nothing, or (color mode) the deck pins a scheme in
 * `class:` or with a `-dark` theme, which a recommendation never overrides (lib/core/resolve-color-mode.js
 * `deckColorModeValue`). A control's Auto choice FOLLOWS the preset (the coordinator's ruling on P0), so its
 * label names this value: `Auto — preset: Brina`, never a bare Auto that hides what renders.
 */
export function presetRecommendation(source: string, key: string): string | null {
	if (ownValue(source, key) !== undefined) return null;
	if (key === 'color-mode') {
		const span = frontMatterKeySpan(source, 'class');
		const classLine = span && !span.indent ? source.slice(span.start, span.end) : '';
		const tokens = ENGINE.frontMatterScalar(classLine.slice(classLine.indexOf(':') + 1)).split(/\s+/);
		if (classLine && tokens.some((t) => COLOR_AXIS.has(t))) return null;
		if (/-dark$/.test(ownValue(source, 'theme') ?? '')) return null;
	}
	const span = frontMatterKeySpan(source, 'preset');
	if (!span || span.indent) return null;
	const name = (getFrontMatterName(source, 'preset') ?? '').toLowerCase();
	return name ? ENGINE.presetValue(name, key) : null;
}

/** The text an Auto head names for `key`: `preset: <label>` while the preset's recommendation applies, else
 *  `fallback` (what Auto resolves to without one). `labelOf` turns a value into its display label. */
export function presetAutoLabel(source: string, key: string, fallback: string, labelOf: (value: string) => string = (v) => v): string {
	const rec = presetRecommendation(source, key);
	return rec ? `preset: ${labelOf(rec)}` : fallback;
}

/** The engine's color-axis class tokens (lib/core/color-mode.js `COLOR_MODE_TOKENS`). */
const COLOR_AXIS = new Set(['dark', 'light', 'color-light', 'color-system', 'color-inherited', 'print']);

/** What `key` resolves to under the preset alone, before any key the deck wrote. */
export function presetBaseline(source: string, key: string): string {
	return ENGINE.presetEffective(presetOf(source), key) ?? ENGINE.PRESET_DEFAULTS[key] ?? '';
}

/**
 * What the deck ITSELF says about `key`, read the way the engine reads it
 * (`frontMatterValue` in lib/core/front-matter-key.js):
 *   · `undefined` — absent, or written empty / comment-only (`rule:`, `rule: # todo`), so the
 *     preset applies;
 *   · `''` — written, but not a name the engine accepts, so the engine renders the default;
 *   · otherwise the value, lower-cased, with any trailing comment stripped.
 * Reading with `getFrontMatter` instead kept the comment (`short  # house` counted as a
 * change from Editorial) and treated an empty key differently from the render.
 */
function ownValue(source: string, key: string): string | undefined {
	const span = frontMatterKeySpan(source, key);
	if (!span || (span.indent && TOP_LEVEL_KEYS.has(key))) return undefined;
	const line = source.slice(span.start, span.end);
	const raw = line.slice(line.indexOf(':') + 1).trim();
	if (raw === '' || raw.startsWith('#')) return undefined;
	// A multi-word value through the engine's own scalar rule (quotes, a trailing comment), its words
	// single-spaced: a bare-name read drops `etch vivid` to '' and the row would show the default.
	if (MULTI_WORD_KEYS.has(key)) return ENGINE.frontMatterScalar(raw).trim().split(/\s+/).join(' ').toLowerCase();
	const name = getFrontMatterName(source, key) ?? '';
	return CASE_KEPT_KEYS.has(key) ? name : name.toLowerCase();
}

/** The old `chart-finish:` key's value, read like `marks:`, or undefined. */
function legacyMarks(source: string): string | undefined {
	const span = frontMatterKeySpan(source, 'chart-finish');
	if (!span) return undefined;
	const line = source.slice(span.start, span.end);
	const raw = line.slice(line.indexOf(':') + 1).trim();
	if (raw === '' || raw.startsWith('#')) return undefined;
	return ENGINE.frontMatterScalar(raw).trim().split(/\s+/).join(' ').toLowerCase();
}

/** What a deck-panel row shows for `key`: the deck's own value, else the preset's. */
export function registerValue(source: string, key: string): string {
	// The legacy `chart-finish:` still speaks for `marks:` when `marks:` is absent, and beats the preset
	// (lib/core/front-matter-key.js PRESET_KEY_ALIASES; lib/core/resolve-marks.js `marksFromFrontMatter`).
	const own = key === 'marks' ? (ownValue(source, 'marks') ?? legacyMarks(source)) : ownValue(source, key);
	if (own === undefined) return presetBaseline(source, key);
	return own || ENGINE.PRESET_DEFAULTS[key] || '';
}

/** Write `key`, or clear it when `value` is what the preset already gives. */
export function writeRegister(source: string, key: string, value: string): string {
	return writeFrontMatterLine(source, key, value === presetBaseline(source, key) ? null : value);
}

/** The preset keys whose rendered value differs from what the preset alone would give. A key
 *  restated at the preset's own value is not a change, so it does not count. */
export function presetChanges(source: string): string[] {
	return PRESET_KEYS.filter(
		(key) => !AUTHOR_KEYS.includes(key) && ownValue(source, key) !== undefined && registerValue(source, key) !== presetBaseline(source, key),
	);
}

/** Remove every preset key the deck writes, so the preset renders exactly as named — except the
 *  author's own palette and color mode (`AUTHOR_KEYS`), which a Reset never strips. */
export function clearPresetOverrides(source: string): string {
	return PRESET_KEYS.filter((key) => !AUTHOR_KEYS.includes(key)).reduce((s, key) => writeFrontMatterLine(s, key, null), source);
}

/**
 * Switch the deck to preset `name`, KEEPING every key the author wrote. The picker is a
 * radiogroup, and a radiogroup selects on arrow-key focus (Radix, like a native radio), so a
 * keyboard user moving through the four previews picks each one in turn. The first build
 * also cleared the family's overrides on every pick, which turned "look at the options" into
 * "lose your settings" one arrow press at a time. Now a pick only writes `preset:`; any key
 * that still differs shows as "N changes" with a Reset, which is the one place overrides are
 * removed, and only when asked.
 */
export function applyPreset(source: string, name: string): string {
	return writeFrontMatterLine(source, 'preset', name === DEFAULT_PRESET ? null : name);
}

/**
 * The one sample slide every preset tile in the picker renders. A row of three cards under a
 * kicker and a heading, because that single slide carries every surface a preset changes that a
 * small picture can still show: the page edge (bar, backdrop), the heading (alignment, rule),
 * the kicker (eyebrow) and the cards (lift, rails). Measured against a title slide and a table:
 * the title hid the bar, the rule and the cards; the table hid the cards.
 */
export const PRESET_SAMPLE = `
<!-- _class: cards-grid three -->

\`Q4 · Review\`

## Capacity plan

- Build ahead
  - Weekends.
- Re-route
  - Line 1.
- Extend
  - Shift two.
`;

/**
 * The sample deck for preset `name`'s tile: the deck's OWN front matter — so the tile renders in
 * the deck's theme and color mode — with `preset:` set to `name` and every preset-family key the
 * author wrote removed, so each tile shows the preset rather than the author's overrides of it.
 * The author's `theme:` and `color-mode:` stay (`AUTHOR_KEYS`, through `clearPresetOverrides`): they
 * beat a preset's recommendation on the real deck too, so the tile shows what a pick would render.
 * `size:` is dropped too: every tile box is 16:9 and the frame scales by width, so a portrait or
 * square deck would show only the top of the sample, cutting off the cards it was chosen for.
 * `fm` is the deck's front-matter block (`---…---`), or '' for a deck with none.
 */
export function presetSampleDeck(fm: string, name: string): string {
	const base = fm ? `${fm.replace(/\n*$/, '')}\n` : '';
	const withPreset = writeFrontMatterLine(base, 'preset', name === DEFAULT_PRESET ? null : name);
	const block = writeFrontMatterLine(clearPresetOverrides(withPreset), 'size', null);
	return `${block.replace(/\n*$/, '')}\n${PRESET_SAMPLE}`;
}
