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
 * So `preset: editorial` reads exactly as if the deck had written `rule: short`, `eyebrow: bar`, … and
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
 * still does NOT set `claim:` / `align:` (how a layout composes — they do not even ride a split page,
 * see surface-registers.js), `stamp:` / `tone:` (only decks that carry badges care), or any content
 * key (header, footer, logo, language).
 *
 * A PRESET MAY CARRY TOKENS, which reverses "a preset is not a class token" (D10). Internal design
 * tokens no author key exposes (a rule weight, a rail weight, a cover composition) ride an optional
 * `tokens` map on the table entry. A deck on such a preset stamps `preset-<name>` on every section
 * (`presetTokenClassFromFrontMatter`, called beside every other deck register in
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js), and tools/build-css.js generates
 * the `section.preset-<name>` rule from the same table (`presetTokensCss`, below — kept out of
 * front-matter-key.js, which the Studio and the Playground load up front and which needs none of it). A preset with no tokens
 * stamps nothing, so the four shipped presets render exactly as before.
 *
 * The table itself lives in lib/core/front-matter-key.js — that module must stay a leaf
 * (see its § Presets), and it is the reader that needs the table. This module is the
 * register's named home, like every other `resolve-*`.
 */

const {
  PRESETS, PRESET_NAMES, PRESET_KEYS, PRESET_DEFAULTS, isPresetKey, isKnownPreset, presetValue, presetEffective,
  presetTable,
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
 * PRESET TOKENS (engineering/decisions/2026-11-20-deck-preset-study.md §5 D10). A preset may also set
 * INTERNAL design tokens — custom properties no author key exposes (a rule weight, a rail weight, a
 * cover composition) — through an optional `tokens` map on its table entry: `{ '--rule-w': '2px' }`.
 * The render paths stamp `preset-<name>` on every section of a deck on such a preset
 * (`presetTokenClass`), and tools/build-css.js generates one `section.preset-<name> { … }` rule per
 * preset from the same table (`presetTokensCss`). A preset with no `tokens` stamps nothing and adds no
 * CSS, which is why the four shipped presets render byte-identically.
 *
 * The values are validated where they are read, so a table entry that breaks a house rule fails the
 * build rather than reaching a slide: a name is a custom property (`--x`) outside the 12-token type
 * scale (`--fs-*`, HARD RULE #4); a value is a plain CSS value with no hex literal (HARD RULE #3: a
 * color goes through `var(--token)`), and nothing that could end the rule or the `<style>` it is
 * written into (`{` `}` `;` `<` `>` `!` — HARD RULE #22).
 */
const PRESET_TOKEN_NAME = /^--[a-z][a-z0-9-]*$/;
const PRESET_TOKEN_UNSAFE = /[{};<>!\\]|\/\*|#[0-9a-f]{3,8}\b/i;

/** Why `[name, value]` may not be a preset token, or null when it may. */
function presetTokenProblem(name, value) {
  if (!PRESET_TOKEN_NAME.test(String(name))) return `\`${name}\` is not a custom-property name (--lower-kebab)`;
  if (String(name).startsWith('--fs-')) return `\`${name}\` is a type-scale token (HARD RULE #4); a preset picks a type set with \`typography:\``;
  if (typeof value !== 'string' || !value.trim()) return `\`${name}\` has no value`;
  if (PRESET_TOKEN_UNSAFE.test(value)) return `\`${name}: ${value}\` carries a hex literal or a character that could end the rule`;
  return null;
}

/** The validated `[name, value]` pairs `entry.tokens` sets, in authored order; throws on a bad one. */
function presetTokenPairs(presetName, entry) {
  const tokens = entry && entry.tokens;
  if (!tokens) return [];
  return Object.entries(tokens).map(([name, value]) => {
    const problem = presetTokenProblem(name, value);
    if (problem) throw new Error(`preset ${presetName}: ${problem}`);
    return [name, value.trim()];
  });
}


/**
 * The class token a deck on preset `name` stamps on every section — `preset-<name>` — or '' when the
 * preset is unknown or sets no tokens (so the four shipped presets stamp nothing). D10, above.
 */
function presetTokenClass(name) {
  if (!isKnownPreset(name)) return '';
  const key = name.trim().toLowerCase();
  return presetTokenPairs(key, presetTable()[key]).length ? `preset-${key}` : '';
}

/** True when `token` is a preset-token class some preset in the table stamps. */
function isPresetTokenClass(token) {
  const t = String(token || '');
  return t.startsWith('preset-') && presetTokenClass(t.slice('preset-'.length)) === t;
}

/**
 * The generated CSS for every preset that sets tokens: one `section.preset-<name> { … }` rule each, in
 * table order, or '' when none does. tools/build-css.js appends it to the bundle, so an empty answer
 * leaves dist/lattice.css byte-identical. `(0,1,1)` beats the bare `section { --token: … }` default a
 * token is declared with, wherever the default sits in the bundle or a theme.
 */
function presetTokensCss(table = presetTable()) {
  const rules = [];
  for (const [name, entry] of Object.entries(table)) {
    const pairs = presetTokenPairs(name, entry);
    if (!pairs.length) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`preset ${name}: a preset with tokens needs a lower-kebab name`);
    rules.push(`section.preset-${name} {\n${pairs.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`);
  }
  return rules.join('\n');
}


/**
 * The preset-token class a deck stamps on every section (`preset-<name>`), from a front-matter BODY,
 * as a list of zero or one token — the shape every deck-register reader in the render paths returns.
 * TOP-LEVEL, as `frontMatterValue` reads `preset:` for the fallback.
 */
function presetTokenClassFromFrontMatter(fm) {
  const token = presetTokenClass(topLevelFrontMatterValue(fm, 'preset') || '');
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
  presetTokenClass,
  isPresetTokenClass,
  presetTokensCss,
  presetTokenProblem,
  presetTokenClassFromFrontMatter,
};
