/**
 * resolve-preset.js — the deck-level `preset:` register: one word that sets a family of
 * look registers at once — the backdrop, headline alignment and the accent dials.
 *
 * WHY. The Accent and Look sections of the Studio's deck panel grew to ten dials that each
 * open on "Auto" or "None" — bar, bar placement, card rail, its placement, trim, heading
 * rule, eyebrow, headline, card lift, corners. An author choosing a look had to know which
 * of the ten mattered. A preset names a coherent look instead (`preset: editorial`), and the
 * dials become overrides of it. engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md.
 *
 * HOW IT RESOLVES — one kernel, every path (HARD RULE #1). A preset is NOT a class token and
 * has no CSS of its own. `frontMatterValue` (lib/core/front-matter-key.js) is the reader every
 * RENDER path resolves a register through — the markdown-it plugins, the browser runtime and
 * the `resolve-*` kernels — and when a key in `PRESET_KEYS` is ABSENT (or written empty) it
 * answers with the preset's value instead of null. Readers outside it, each on purpose:
 *   · the linter's `findUnknown*` finders and its `bookend-finish-contrast` note check only
 *     what the deck WROTE (a preset's value is known-good, and its backdrop is a look the
 *     author picked whole);
 *   · the Studio cannot import this CJS reader by name, so
 *     docs/src/components/studio/deck-preset.ts mirrors the rule (deck-preset.test.ts pins
 *     the two), and slide-provenance.ts reads the deck's finish through that mirror;
 *   · the Playground's deck sheet (docs/src/playground/deck-config.js) reads the table's
 *     `presetEffective` for the two family keys it edits, `finish` and `lift`. So `preset: editorial` reads exactly as
 * if the deck had written `rule: short`, `eyebrow: bar`, … and every downstream kernel stamps
 * the same class tokens it always did. An explicit key always wins over the preset, which is
 * what makes the per-register dials overrides. `finish:` and `headline:` joined the family in round two
 * of the design, because they are what visibly changes a title slide (the note's §7).
 *
 * A preset lists only the keys it changes FROM the engine default, so `classic` is empty:
 * it is the house default, named. `PRESET_DEFAULTS` holds those engine defaults for callers
 * that need the value a key resolves to when neither the deck nor the preset sets it (the
 * Studio's "Editorial · 2 changes" count).
 *
 * What a preset deliberately does NOT set: `theme:` (the palette — a separate choice),
 * `mode:` (the rendering hand), `claim:` / `cards:` (how a layout composes — they do not even ride a split page, see
 * surface-registers.js), `stamp:` / `tone:` (only decks that carry badges care), and every
 * content key (header, footer, logo, language).
 *
 * The table itself lives in lib/core/front-matter-key.js — that module must stay a leaf
 * (see its § Presets), and it is the reader that needs the table. This module is the
 * register's named home, like every other `resolve-*`.
 */

const {
  PRESETS, PRESET_NAMES, PRESET_KEYS, PRESET_DEFAULTS, isPresetKey, isKnownPreset, presetValue, presetEffective,
  frontMatterName,
} = require('./front-matter-key');

/** Extract the raw `preset:` value from a deck source's front matter, or null. */
function readFrontMatterPreset(md) {
  if (!md) return null;
  const m = md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return null;
  return frontMatterName(m[1], 'preset');
}

module.exports = {
  PRESETS,
  PRESET_NAMES,
  PRESET_KEYS,
  PRESET_DEFAULTS,
  isPresetKey,
  isKnownPreset,
  presetValue,
  presetEffective,
  readFrontMatterPreset,
};
