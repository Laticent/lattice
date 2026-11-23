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
 * HOW IT RESOLVES — one kernel, every path (HARD RULE #1). `frontMatterValue`
 * (lib/core/front-matter-key.js) is the reader every RENDER path resolves a register through — the
 * markdown-it plugins, the browser runtime and the `resolve-*` kernels — and when a key in
 * `PRESET_KEYS` is ABSENT (or written empty) it answers with the preset's value instead of null.
 * Three keys are read at column 0 instead (`theme:`, `color-mode:`, `backdrop:`), and their render
 * readers go through `topLevelRegisterValue`, which falls back by the same rule: the palette
 * (resolve-palette.js, and the engine's own `theme` directive, lib/engine/index.js `deckDirectives`),
 * the color mode (resolve-color-mode.js `deckColorModeValue`) and the backdrop restraint
 * (resolve-backdrop.js). Readers outside them, each on purpose:
 *   · the linter's `findUnknown*` finders check only what the deck WROTE (a preset's value
 *     is known-good);
 *   · the Studio cannot import this CJS reader by name, so
 *     docs/src/components/studio/deck-preset.ts mirrors the rule (deck-preset.test.ts pins
 *     the two), slide-provenance.ts reads the deck's finish through that mirror, and
 *     docs/src/lib/deck-theme.ts resolves the preview's palette and mode through the table;
 *   · the Playground's deck sheet (docs/src/playground/deck-config.js) reads the table's
 *     `presetEffective` for the keys it edits (`finish`, `lift`, `mode`, the look rows);
 *   · Export-to-Marp writes a preset's `theme:` into the bundle's front matter
 *     (lib/export/bundle-front-matter.js), because Marp, not Lattice, picks the bundle's theme.
 * So `preset: editorial` reads exactly as if the deck had written `rule: full`, `eyebrow: bar`, … and
 * every downstream kernel stamps the same class tokens it always did. An explicit key always wins over
 * the preset, which is what makes the per-register dials overrides. `finish:` and `headline:` joined
 * the family in round two of the design, because they are what visibly changes a title slide (the
 * note's §7).
 *
 * A preset lists only the keys it changes FROM the engine default, so `classic` is empty:
 * it is the house default, named. `PRESET_DEFAULTS` holds those engine defaults for callers
 * that need the value a key resolves to when neither the deck nor the preset sets it (the
 * Studio's "Editorial · 2 changes" count).
 *
 * WHAT A PRESET SETS, AND WHAT IT DOES NOT. Since engineering/decisions/2026-11-20-deck-preset-study.md
 * §5 D1, a preset also RECOMMENDS the palette (`theme:`), the color mode (`color-mode:`), the
 * rendering hand (`mode:`), the mark finish (`marks:`) and the finish restraint (`backdrop:`). This
 * reverses the September rule that kept `theme:` and `mode:` out ("the palette is a separate choice"):
 * a look is not coherent without them. They stay recommendations, three ways: a key the deck writes
 * wins; a deck that pins its scheme the legacy way (`class: dark`, a `-dark` theme) keeps it; and the
 * Studio never strips an author's `theme:` or `color-mode:` on a preset pick or a Reset. A preset
 * still does NOT set `claim:` / `cards:` (how a layout composes — they do not even ride a split page,
 * see surface-registers.js), `stamp:` / `tone:` (only decks that carry badges care), or any content
 * key (header, footer, logo, language).
 *
 * A PRESET IS ALSO A CLASS, which reverses "a preset is not a class token" (D10). A deck on any
 * preset but `classic` stamps `preset-<name>` on every section (`presetClassFromFrontMatter`, called
 * beside every other deck register in lib/integrations/markdown-it/plugins.js and
 * lib/runtime/index.js). The class carries the preset's INTERNAL design tokens — custom properties no
 * author key exposes (a rule weight, a rail weight) — and those live in a real stylesheet,
 * lib/presets/<name>/<name>.css, never in this table: the engine stamps a class, and CSS styles it. No
 * script writes a style (test/unit/core/preset-plumbing.test.js holds the stylesheet to the table:
 * every rule names a shipped preset and declares only custom properties). A preset with no rule there
 * stamps a class nothing reads, so it renders exactly as before. `classic` is the default and stamps
 * nothing, as every register's default does.
 *
 * The table itself lives in lib/core/front-matter-key.js — that module must stay a leaf
 * (see its § Presets), and it is the reader that needs the table. This module is the
 * register's named home, like every other `resolve-*`.
 */

const {
  PRESETS, PRESET_NAMES, PRESET_KEYS, PRESET_DEFAULTS, isPresetKey, isKnownPreset, presetValue, presetEffective,
  frontMatterName, topLevelFrontMatterValue,
} = require('./front-matter-key');

/** Extract the raw `preset:` value from a deck source's front matter, or null. */
function readFrontMatterPreset(md) {
  if (!md) return null;
  const m = md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return null;
  return frontMatterName(m[1], 'preset');
}

/**
 * The class a deck on preset `name` stamps on every section — `preset-<name>` — or '' for `classic`
 * (the default stamps nothing) and for an unknown name.
 */
function presetClass(name) {
  if (!isKnownPreset(name)) return '';
  const key = name.trim().toLowerCase();
  return key === 'classic' ? '' : `preset-${key}`;
}

/** True when `token` is the class some preset in the table stamps. */
function isPresetClass(token) {
  const t = String(token || '');
  return t.startsWith('preset-') && presetClass(t.slice('preset-'.length)) === t;
}

/**
 * The preset class a deck stamps on every section (`preset-<name>`), from a front-matter BODY,
 * as a list of zero or one token — the shape every deck-register reader in the render paths returns.
 * TOP-LEVEL, as `frontMatterValue` reads `preset:` for the fallback.
 */
function presetClassFromFrontMatter(fm) {
  const token = presetClass(topLevelFrontMatterValue(fm, 'preset') || '');
  return token ? [token] : [];
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
  presetClass,
  isPresetClass,
  presetClassFromFrontMatter,
};
