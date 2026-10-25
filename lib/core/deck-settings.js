/**
 * lib/core/deck-settings.js — THE table of deck front-matter keys.
 *
 * One row per key a deck's front matter may carry: what kind of value it takes, where its
 * accepted values come from, which lint rule reports a wrong one, where the Studio shows it,
 * and the one-line description the editor, the reference page and the JSON Schema print.
 *
 * Until 2026-10-16 the same surface was listed in four hand-written places that checked only
 * each other: the Studio's key list (docs/src/components/studio/front-matter-keys.ts), the
 * reference page's table (docs/src/lib/front-matter-docs.ts), LFM 1.1 §2.3 and
 * lib/base/base.registers.docs.md. None of them was engine-side, so the linter could not
 * tell a typo from a key: `finsh: halo` and `themee: x` linted clean while the deck silently
 * lost its finish and theme. Those two Studio files are now views of this table, the linter
 * reads it (`unknown-key`, and `unknown-<key>` for a value), and `tools/build-front-matter-schema.js`
 * derives a JSON Schema from it. Record: engineering/decisions/2026-10-15-conformance-harness.md
 * §9 phase 1.
 *
 * The rows hold FACTS only. Their words (the description, the Studio location, the per-slide form,
 * the scope, the free-form value text) live beside them in lib/core/deck-settings.prose.js, joined
 * by `withProse`: lint-core needs none of the words, and it ships in a route-budgeted browser chunk.
 *
 * A LEAF, deliberately: no `require`. The docs dev server serves `lib/` CommonJS to the
 * browser only when it requires nothing (docs/src/plugins/vite-cjs-lib-dev.mjs), and the
 * Studio imports this file. So a value list that lives in a resolver is named, not copied:
 * `vocab: 'ruleNames'` points at the lint vocab field `lib/authoring/lint.js` `buildVocab`
 * fills from `lib/core/resolve-rule.js` `RULE_NAMES`. A list no resolver exports sits here
 * as `values`.
 *
 * Fields:
 *   key       the key, as written before the colon
 *   kind      register (one word from a list) · axis (one word per axis) · flag · text ·
 *             number · path · css · list · map · directive (a Marpit directive applied to
 *             every slide) · marp (Marp metadata Lattice accepts and ignores) · retired
 *             (a dedicated rule reports it)
 *   vocab     the lint vocab field holding the accepted values
 *   values    the accepted values, when no resolver exports them
 *   complete  values the editor offers when the reader is looser than a closed list
 *   rule      the lint rule that reports a wrong value (or, for `retired`, the key itself)
 *   caseSensitive  true when the key's reader compares the value exactly (`theme:`, `size:`,
 *             `player-motion:`), so lint must not fold case either
 *   onUnknown what a wrong value does, when it is not "uses the default"
 *   generic   true when that rule is the table-driven one in lint-core
 *             (`findUnknownSettingValues`), false/absent when a dedicated rule owns it
 *   spec      the LFM 1.1 section that specifies the key
 *   offer     false to keep the key out of autocomplete and the reference page (default true)
 *   docs      for a key the reference page does not list: the doc that describes it
 *   group · default   the reference page's group and default column
 *   (info · studio · slide · scope · valuesText live in deck-settings.prose.js)
 *
 * Plugin-declared registers (`icon:`, `avatar:`) are NOT rows: a plugin adds them as data
 * (lib/plugins/registers.generated.js), so `withPluginRegisters` appends them, and a new
 * plugin register enrolls itself.
 */

/**
 * @typedef {object} DeckSetting
 * @property {string} key
 * @property {string} kind
 * @property {string} group
 * @property {string} info
 * @property {string} default
 * @property {string} [vocab]
 * @property {ReadonlyArray<string>} [values]
 * @property {ReadonlyArray<string>} [complete]
 * @property {string} [rule]
 * @property {boolean} [generic]
 * @property {boolean} [caseSensitive]
 * @property {string} [onUnknown]
 * @property {string} [spec]
 * @property {boolean} [offer]
 * @property {string} [docs]
 * @property {string} [studio]
 * @property {string} [slide]
 * @property {string} [scope]
 * @property {string} [valuesText]
 * @property {string|null} [plugin]
 */

/** Every key a deck's front matter may carry, in the Studio's panel order. @type {ReadonlyArray<DeckSetting>} */
const DECK_SETTINGS = Object.freeze([
  { key: 'title', kind: 'text', group: 'general', default: 'the first heading' },
  { key: 'theme', kind: 'register', vocab: 'themeNames', rule: 'unknown-theme', generic: true, caseSensitive: true, onUnknown: 'the command line stops with "palette not found"; other surfaces use the default palette', group: 'look', default: 'indaco' },
  { key: 'lang', kind: 'text', group: 'general', default: 'en' },
  { key: 'ai-lang', kind: 'text', group: 'general', default: 'follows lang' },
  { key: 'size', kind: 'register', vocab: 'sizeNames', rule: 'unknown-size', generic: true, caseSensitive: true, group: 'look', default: 'hd' },
  { key: 'split', kind: 'register', rule: 'unknown-split', spec: '2.3', vocab: 'splitNames', group: 'general', default: 'headings' },
  { key: 'profile', kind: 'text', complete: ['general', 'teaching', 'mission'], group: 'developer', default: 'general' },
  { key: 'inline-code', kind: 'register', rule: 'unknown-inline-code', spec: '2.3', vocab: 'inlineCodeNames', group: 'general', default: 'rich' },
  { key: 'glossary', kind: 'register', values: ['auto', 'off'], rule: 'unknown-glossary', generic: true, group: 'general', default: 'off' },
  { key: 'class', kind: 'list', group: 'general', default: 'none' },
  { key: 'validate', kind: 'flag', complete: ['on', 'off'], group: 'developer', default: 'on' },
  { key: 'preset', kind: 'register', rule: 'unknown-preset', spec: '2.3', vocab: 'presetNames', group: 'look', default: 'classic' },
  { key: 'color-mode', kind: 'register', rule: 'unknown-color-mode', spec: '2.3', vocab: 'colorModeNames', group: 'look', default: 'the theme’s own' },
  { key: 'mode', kind: 'register', rule: 'unknown-mode', spec: '2.3', vocab: 'modeNames', group: 'look', default: 'boardroom' },
  { key: 'finish', kind: 'register', rule: 'unknown-finish', spec: '2.3', vocab: 'finishNames', group: 'look', default: 'none' },
  { key: 'finish-override', kind: 'map', group: 'look', default: 'none' },
  { key: 'backdrop', kind: 'axis', rule: 'unknown-backdrop', spec: '2.3', vocab: 'backdropNames', group: 'look', default: 'the finish\'s own' },
  { key: 'tag', kind: 'axis', rule: 'unknown-tag', spec: '2.3', vocab: 'tagNames', group: 'look', default: 'the component\'s own' },
  { key: 'image-card', kind: 'axis', rule: 'unknown-image-card', spec: '2.3', vocab: 'imageCardNames', group: 'look', default: 'bottom-left solid md regular' },
  { key: 'lift', kind: 'register', rule: 'unknown-lift', spec: '2.3', vocab: 'liftNames', group: 'look', default: 'off' },
  { key: 'chart-finish', kind: 'register', rule: 'unknown-chart-finish', spec: '2.3', vocab: 'chartFinishNames', group: 'look', default: 'off' },
  { key: 'venue', kind: 'register', rule: 'unknown-venue', spec: '2.3', vocab: 'venueNames', group: 'look', default: 'laptop' },
  { key: 'cards', kind: 'register', rule: 'unknown-cards', spec: '2.3', vocab: 'cardsNames', group: 'look', default: 'each component decides' },
  { key: 'corners', kind: 'register', rule: 'unknown-corners', spec: '2.3', vocab: 'cornersNames', group: 'look', default: 'square' },
  { key: 'claim', kind: 'register', rule: 'unknown-claim', spec: '2.3', vocab: 'claimNames', group: 'look', default: 'framed' },
  { key: 'fit', kind: 'register', rule: 'unknown-fit', spec: '2.3', vocab: 'fitNames', group: 'look', default: 'heal' },
  { key: 'header', kind: 'text', group: 'chrome', default: 'none' },
  { key: 'footer', kind: 'text', group: 'chrome', default: 'none' },
  { key: 'paginate', kind: 'flag', complete: ['true', 'false'], rule: 'paginate-unsupported-value', group: 'chrome', default: 'true' },
  { key: 'meta', kind: 'text', group: 'chrome', default: 'none' },
  { key: 'logo', kind: 'path', spec: '2.3', group: 'chrome', default: 'none' },
  { key: 'logo-finish', kind: 'axis', rule: 'unknown-logo-finish', spec: '2.3', vocab: 'logoFinishNames', group: 'chrome', default: 'top-right auto md all' },
  { key: 'logo-style', kind: 'retired', offer: false, rule: 'retired-logo-key', group: 'chrome', default: 'none' },
  { key: 'logo-on', kind: 'retired', offer: false, rule: 'retired-logo-key', group: 'chrome', default: 'none' },
  { key: 'logo-scale', kind: 'retired', offer: false, rule: 'retired-logo-key', group: 'chrome', default: 'none' },
  { key: 'logo-x', kind: 'retired', offer: false, rule: 'retired-logo-key', group: 'chrome', default: 'none' },
  { key: 'logo-y', kind: 'retired', offer: false, rule: 'retired-logo-key', group: 'chrome', default: 'none' },
  { key: 'spectrum', kind: 'register', rule: 'unknown-spectrum', spec: '2.3', vocab: 'spectrumNames', group: 'accent', default: 'on' },
  { key: 'spectrum-edge', kind: 'register', rule: 'unknown-spectrum-edge', spec: '2.3', vocab: 'spectrumEdgeNames', group: 'accent', default: 'top' },
  { key: 'spectrum-card', kind: 'register', rule: 'unknown-spectrum-card', spec: '2.3', vocab: 'spectrumCardNames', group: 'accent', default: 'off' },
  { key: 'spectrum-card-edge', kind: 'register', rule: 'unknown-spectrum-card-edge', spec: '2.3', vocab: 'spectrumCardEdgeNames', group: 'accent', default: 'left' },
  { key: 'spectrum-trim', kind: 'register', rule: 'unknown-spectrum-trim', spec: '2.3', vocab: 'spectrumTrimNames', group: 'accent', default: 'off' },
  { key: 'rule', kind: 'register', rule: 'unknown-rule', spec: '2.3', vocab: 'ruleNames', group: 'accent', default: 'auto' },
  { key: 'eyebrow', kind: 'register', rule: 'unknown-eyebrow', spec: '2.3', vocab: 'eyebrowNames', group: 'accent', default: 'plain' },
  { key: 'headline', kind: 'register', rule: 'unknown-headline', spec: '2.3', vocab: 'headlineNames', group: 'accent', default: 'auto' },
  { key: 'stamp', kind: 'register', rule: 'unknown-stamp', spec: '2.3', vocab: 'stampStyleNames', group: 'accent', default: 'tab' },
  { key: 'tone', kind: 'register', rule: 'unknown-tone', spec: '2.3', vocab: 'toneStyleNames', group: 'accent', default: 'rail' },
  { key: 'motion', kind: 'register', values: ['on', 'off'], rule: 'unknown-motion', generic: true, group: 'motion', default: 'off' },
  { key: 'motion-style', kind: 'register', values: ['build', 'together', 'rise'], rule: 'unknown-motion-style', generic: true, group: 'motion', default: 'build' },
  { key: 'motion-speed', kind: 'register', values: ['auto', 'slow', 'normal', 'fast'], rule: 'unknown-motion-speed', generic: true, group: 'motion', default: 'auto' },
  { key: 'player-motion', kind: 'register', values: ['off'], rule: 'unknown-player-motion', generic: true, caseSensitive: true, group: 'motion', default: 'follows motion' },
  { key: 'pace', kind: 'register', rule: 'unknown-pace', spec: '2.3', vocab: 'paceNames', group: 'speech', default: 'natural' },
  { key: 'delivery', kind: 'register', rule: 'unknown-delivery', spec: '2.3', vocab: 'deliveryNames', group: 'speech', default: 'restrained' },
  { key: 'lexicon', kind: 'map', group: 'speech', default: 'none' },
  { key: 'acronyms', kind: 'map', group: 'speech', default: 'none' },
  { key: 'say', kind: 'map', group: 'speech', default: 'none' },
  { key: 'style', kind: 'css', group: 'raw', default: 'none' },
  { key: 'color', kind: 'css', group: 'raw', default: 'the theme’s' },
  { key: 'backgroundColor', kind: 'css', group: 'raw', default: 'the theme’s' },
  { key: 'backgroundImage', kind: 'css', group: 'raw', default: 'none' },
  { key: 'backgroundPosition', kind: 'css', group: 'raw', default: 'center' },
  { key: 'backgroundRepeat', kind: 'css', group: 'raw', default: 'no-repeat' },
  { key: 'backgroundSize', kind: 'css', group: 'raw', default: 'cover' },
  { key: 'debug', kind: 'list', rule: 'unknown-debug-facet', group: 'developer', default: 'off' },
  { key: 'present', kind: 'flag', complete: ['true', 'false'], rule: 'bad-render-target-value', group: 'export', default: 'false' },
  { key: 'read', kind: 'flag', complete: ['true', 'false'], rule: 'bad-render-target-value', group: 'export', default: 'false' },
  { key: 'fluid', kind: 'flag', complete: ['true', 'false'], rule: 'bad-render-target-value', group: 'export', default: 'false' },
  { key: 'images', kind: 'register', values: ['optimized', 'original'], rule: 'unknown-images', generic: true, group: 'export', default: 'optimized' },
  { key: 'images-quality', kind: 'text', group: 'export', default: '88' },
  { key: 'player', kind: 'flag', complete: ['true', 'false'], rule: 'bad-render-target-value', group: 'export', default: 'false' },
  // Keys the Studio's key list did not carry. Found by reading every front-matter reader
  // (2026-10-16 inventory); each is read by the engine, a surface or the linter.
  { key: 'plugins', kind: 'list', vocab: 'pluginNames', rule: 'unknown-plugin', spec: '2.3', group: 'general', default: 'the built-in set' },
  { key: 'greeting', kind: 'text', rule: 'unknown-bookend-placeholder', spec: '2.3', group: 'speech', default: 'none', complete: ['true', 'off'] },
  { key: 'closing', kind: 'text', rule: 'unknown-bookend-placeholder', spec: '2.3', group: 'speech', default: 'none', complete: ['true', 'off'] },
  { key: 'code', kind: 'text', group: 'look', default: 'none' },
  { key: 'build', kind: 'directive', offer: false, group: 'raw', default: 'none', docs: 'lib/base/base.docs.md' },
  { key: 'focus', kind: 'directive', offer: false, group: 'raw', default: 'none', docs: 'lib/base/base.docs.md' },
  { key: 'focusStyle', kind: 'directive', offer: false, group: 'raw', default: 'none', docs: 'lib/base/base.docs.md' },
  { key: 'track', kind: 'directive', offer: false, group: 'raw', default: 'none', docs: 'lib/components/anchor/topic/topic.docs.md' },
  { key: 'lenses', kind: 'map', offer: false, group: 'developer', default: 'none', docs: 'design/skills/lens.md' },
  { key: 'lens-default', kind: 'text', offer: false, group: 'developer', default: 'none', docs: 'design/skills/lens.md' },
  { key: 'lens-defaults', kind: 'text', offer: false, group: 'developer', default: 'on', docs: 'design/skills/lens.md' },
  // Marp metadata. A Marp deck carries these; Lattice reads none of them, and a warning on
  // a valid Marp key would teach authors to ignore the warning.
  { key: 'marp', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'headingDivider', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'math', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'description', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'author', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'keywords', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'url', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'transition', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  { key: 'image', kind: 'marp', offer: false, group: 'raw', default: 'none' },
  // Retired keys. Each has its own rule that names the migration, so `unknown-key` stays
  // quiet about them rather than saying "check the spelling" of a correctly spelled key.
  { key: 'guards', kind: 'retired', offer: false, rule: 'guards-renamed', group: 'look', default: 'none' },
  { key: 'autosplit', kind: 'retired', offer: false, rule: 'autosplit-retired', group: 'look', default: 'none' },
  { key: 'captions', kind: 'retired', offer: false, rule: 'caption-key-retired', group: 'speech', default: 'none' },
  { key: 'form', kind: 'retired', offer: false, rule: 'retired-form-key', group: 'look', default: 'none' },
  { key: 'overflow-marker', kind: 'retired', offer: false, rule: 'stray-overflow-marker', group: 'developer', default: 'none' },
]);

/**
 * The rows plus one per plugin-declared register (`icon:`, `avatar:`), built from the
 * plugin registry's data — `[{ key, plugin, axes: [{ axis, names }] }]`, the shape of
 * lib/plugins/registers.generated.js `PLUGIN_REGISTERS` and of the lint vocab's
 * `pluginRegisters` (`{ key, names, axes: { axis: names } }`); both are accepted.
 *
 * @param {ReadonlyArray<any>} [pluginRegisters]
 * @returns {ReadonlyArray<DeckSetting>}
 */
function withPluginRegisters(pluginRegisters) {
  const own = new Set(DECK_SETTINGS.map((r) => r.key));
  const added = [];
  for (const r of pluginRegisters || []) {
    if (!r || own.has(r.key)) continue;
    own.add(r.key);
    const axes = Array.isArray(r.axes) ? r.axes.map((a) => [a.axis, [...a.names]]) : Object.entries(r.axes || {}).map(([a, n]) => [a, [...n]]);
    const names = axes.flatMap(([, n]) => n);
    const axisText = axes.map(([a, n]) => `${a} (${n.join(' / ')})`).join(', ');
    added.push(Object.freeze({
      key: r.key, kind: 'axis', values: names, rule: `unknown-${r.key}`, spec: '2.3', plugin: r.plugin || null,
      group: 'look', default: axes.map(([, n]) => n[0]).join(' '), slide: `_class: ${r.key}-<value>`,
      valuesText: `up to one word per axis: ${axisText}`,
      info: `The deck's default for inline ${r.key}s — up to one word per axis: ${axisText}.`,
    }));
  }
  return Object.freeze([...DECK_SETTINGS, ...added]);
}

const BY_KEY = new Map(DECK_SETTINGS.map((r) => [r.key, r]));

/** The row for `key`, or null. @returns {DeckSetting|null} */
function deckSetting(key) {
  return BY_KEY.get(key) || null;
}

/** True when `key` is a known front-matter key (a plugin register counts when its list is passed). @param {string} key @param {ReadonlyArray<any>} [pluginRegisters] */
function isDeckSettingKey(key, pluginRegisters) {
  if (BY_KEY.has(key)) return true;
  return (pluginRegisters || []).some((r) => r && r.key === key);
}

/**
 * The accepted values of a row: its own `values`, or the named lint vocab field. Null when the
 * key takes free text, or when the vocab does not carry the field (a reduced vocab, as in a test).
 * @param {DeckSetting|null} row
 * @param {Record<string, unknown>|null|undefined} vocab
 * @returns {ReadonlyArray<string>|null}
 */
function settingValues(row, vocab) {
  if (!row) return null;
  if (Array.isArray(row.values)) return row.values;
  if (row.vocab && vocab && Array.isArray(vocab[row.vocab])) return /** @type {string[]} */ (vocab[row.vocab]);
  return null;
}

module.exports = { DECK_SETTINGS, withPluginRegisters, deckSetting, isDeckSettingKey, settingValues };
