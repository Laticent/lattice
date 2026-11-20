/**
 * Read one KEY out of a deck's front matter — the linear-time way, in one place.
 *
 * The idiom this replaces was written twenty-odd times over:
 *
 *     fm.match(/^[ \t]*logo:[ \t]*["']?(.*?)["']?[ \t]*$/m)
 *
 * and it is polynomial. Three quantifiers — `[ \t]*`, the lazy `(.*?)`, and the
 * trailing `[ \t]*$` — can all match the same tab, so a long run of them makes the
 * engine try every split. Measured before this: a 128 KB run took 4.1 s in ONE
 * reader, and the runtime resolves ~20 of them. (An earlier round of this fix
 * bounded `\s` to `[ \t]`, which removed the NEWLINE dimension — the multiline
 * blowup — but left the single-line ambiguity behind. CodeQL was right to flag it
 * again.)
 *
 * The fix is the shape `lib/core/chart-narration.js` already uses and documents:
 * one GREEDY `(.*)` to end-of-line, which cannot fail and so never backtracks,
 * then trim and unquote in JS where those operations are linear by construction.
 *
 * The unquoting is deliberately two independent single-character strips, matching
 * the `["']?…["']?` it replaces: a value with one stray quote reads the same way it
 * always did, rather than newly failing to unquote.
 */

// ── Presets ──────────────────────────────────────────────────────────────────
//
// The `preset:` register's table lives HERE, not in resolve-preset.js, because this
// module must stay a LEAF: the docs dev server serves it verbatim to ESM importers
// (docs/src/plugins/vite-cjs-lib-dev.mjs refuses a lib module that requires anything
// but an import-free `.mjs` sibling, which it hoists to an `import`; the front-matter
// island below is one), and `frontMatterValue` below needs the table to resolve a preset.
// resolve-preset.js re-exports all of it and carries the why.

// THE KEYS ARE THE ISLAND'S (lib/core/front-matter-island.mjs): every reader here picks
// its line from the one key list, and only the picking differs between them.
const { frontMatterKeys, topLevelKey, looseKey } = require('./front-matter-keys.mjs');

/**
 * The keys a preset may set — the backdrop, alignment and accent family, in panel order, then the
 * type set (`typography:`, lib/core/resolve-typography.js). `minimal` names no set: its own
 * `minimal` set (Inter throughout) is not one of the first four, so it keeps classic type until
 * that set ships (engineering/decisions/2026-11-09-type-voices.md § Decided, item 3).
 *
 * Then the RECOMMENDATION keys (engineering/decisions/2026-11-20-deck-preset-study.md §5 D1): the
 * palette (`theme:`), the color mode (`color-mode:`), the rendering hand (`mode:`), the chart and
 * mark finish (`marks:`) and the finish restraint (`backdrop:`). A preset recommends them; a key
 * the deck writes still wins, exactly as for the family above. Three of them are TOP-LEVEL keys
 * (`theme`, `color-mode`, `backdrop`), so their readers resolve the preset through
 * `topLevelRegisterValue` below rather than `frontMatterValue`. Two take more than one word
 * (`marks: etch vivid`, `backdrop: 40 clear`), and `theme` is case-sensitive (a saved palette's
 * name is matched as written), so a preset's value is read verbatim, never lower-cased.
 */
const PRESET_KEYS = Object.freeze([
  'finish', 'spectrum', 'spectrum-edge', 'spectrum-card', 'spectrum-card-edge', 'spectrum-trim',
  'rule', 'eyebrow', 'headline', 'lift', 'corners', 'typography',
  'theme', 'color-mode', 'mode', 'marks', 'backdrop',
]);

/**
 * What each key resolves to when neither the deck nor a preset sets it (each resolver's own default).
 * `''` is "unset": `theme` falls to the renderer's palette (the CLI's `indaco`, the site's own in the
 * Studio), `color-mode` to the theme's own scheme, and `backdrop` to the finish's own strength.
 */
const PRESET_DEFAULTS = Object.freeze({
  finish: 'none',
  spectrum: 'on',
  'spectrum-edge': 'top',
  'spectrum-card': 'off',
  'spectrum-card-edge': 'left',
  'spectrum-trim': 'off',
  rule: 'auto',
  eyebrow: 'plain',
  headline: 'auto',
  lift: 'off',
  corners: 'square',
  typography: 'classic',
  theme: '',
  'color-mode': '',
  mode: 'boardroom',
  marks: 'pigment',
  backdrop: '',
});

/**
 * An OLDER spelling of a preset key that still renders (lib/core/resolve-marks.js
 * `MARKS_LEGACY_KEY`). A deck that writes the alias has spoken for the key, so the preset's value
 * must not shadow it: `marksFromFrontMatter` reads `marks:` first and the alias only when `marks:`
 * comes back empty, and a preset answering for an absent `marks:` would silently override a deck's
 * `chart-finish: etch`. Keyed by the preset key, valued by its aliases.
 */
const PRESET_KEY_ALIASES = Object.freeze({ marks: Object.freeze(['chart-finish']) });

/**
 * The built-in presets. Four, on purpose: people choose well from three to five options that
 * look clearly different. Each must differ at a glance on EVERY slide — the title slide
 * included, which shows no bar and no heading rule — so each owns a distinct alignment and
 * (Editorial, Brand-forward) a backdrop. A first cut varied only the bar, rule and kicker, and
 * rendered side by side the four title slides were identical and three content rows nearly so.
 */
const PRESETS = Object.freeze({
  classic: Object.freeze({
    label: 'Classic',
    desc: 'The house default — centered title, rainbow bar, a hairline rule, flat cards.',
    values: Object.freeze({}),
  }),
  editorial: Object.freeze({
    label: 'Editorial',
    desc: 'Left-aligned, a ruled ledger backdrop with a rail, a short rule and lifted cards.',
    values: Object.freeze({ finish: 'ledger', headline: 'left', rule: 'short', eyebrow: 'bar', 'spectrum-trim': 'restrained', lift: 'on', typography: 'ledger' }),
  }),
  brand: Object.freeze({
    label: 'Brand-forward',
    desc: 'Centered, the accent everywhere — solid bar, card rails, full trim, corner marks.',
    values: Object.freeze({ finish: 'strata', headline: 'center', spectrum: 'solid', 'spectrum-card': 'auto', 'spectrum-trim': 'on', rule: 'accent', eyebrow: 'dot', lift: 'on', typography: 'poster' }),
  }),
  minimal: Object.freeze({
    label: 'Minimal',
    desc: 'Left-aligned, no bar, no rule, rounded corners — the content and nothing else.',
    values: Object.freeze({ headline: 'left', spectrum: 'off', rule: 'none', corners: 'rounded' }),
  }),
});

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

const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));
const PRESET_KEY_SET = new Set(PRESET_KEYS);

/**
 * The table every lookup below reads. It is `PRESETS` everywhere but inside `withPresetTable`, which a
 * TEST uses to prove the plumbing for keys no shipped preset sets yet (`theme`, `color-mode`,
 * `backdrop`, preset tokens): those ship in later waves, and a reader that is never exercised until
 * then is a reader nobody has tested.
 */
let activeTable = PRESETS;

/**
 * Run `fn` with `table` (`{ name: { label, desc, values, tokens? } }`) standing in for `PRESETS`, and
 * restore the real table afterwards, even on a throw. Synchronous on purpose: an `await` inside `fn`
 * would leak the stand-in to whatever else runs meanwhile. TEST-ONLY; no product code calls it.
 */
function withPresetTable(table, fn) {
  const saved = activeTable;
  activeTable = table;
  try {
    return fn();
  } finally {
    activeTable = saved;
  }
}

/** True if `key` is one a preset may set. */
function isPresetKey(key) {
  return PRESET_KEY_SET.has(key);
}

/** True if `value` names a built-in preset (case-insensitive). */
function isKnownPreset(value) {
  return typeof value === 'string' && Object.hasOwn(activeTable, value.trim().toLowerCase());
}

/**
 * The value preset `name` gives `key`, or null when the preset is unknown or leaves the key
 * at its engine default. This is the fallback `frontMatterValue` uses — null keeps every
 * reader's own default behavior exactly as it was.
 */
function presetValue(name, key) {
  if (!isKnownPreset(name) || !isPresetKey(key)) return null;
  const v = activeTable[name.trim().toLowerCase()].values[key];
  return v === undefined ? null : v;
}

/** What `key` resolves to under preset `name` when the deck does not set it — never null for a preset key. */
function presetEffective(name, key) {
  return presetValue(name, key) ?? PRESET_DEFAULTS[key] ?? null;
}

/**
 * The class token a deck on preset `name` stamps on every section — `preset-<name>` — or '' when the
 * preset is unknown or sets no tokens (so the four shipped presets stamp nothing). D10, above.
 */
function presetTokenClass(name) {
  if (!isKnownPreset(name)) return '';
  const key = name.trim().toLowerCase();
  return presetTokenPairs(key, activeTable[key]).length ? `preset-${key}` : '';
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
function presetTokensCss(table = activeTable) {
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
 * Clean ONE front-matter scalar — the single rule every reader in the repo has to
 * agree on, because the readers that DISAGREE are how a deck renders two ways.
 *
 * The defect this closes: a trailing YAML comment was kept as part of the value.
 * `theme: cuoio  # our brand palette` read as the literal string
 * `"cuoio  # our brand palette"`, which matches no registered palette — so the deck
 * silently fell back to the default while an Export-to-Marp of the same bytes (real
 * YAML, which strips the comment) kept `cuoio`. Two different decks from one source,
 * which is the failure #1416 exists to end.
 *
 * Three rules, and the second and third are load-bearing against real decks:
 *
 *  1. A QUOTED value is the quoted span. Anything after the closing quote is a
 *     comment and is dropped — `footer: 'Q3' # draft` → `Q3`.
 *  2. A `#` INSIDE a quoted span survives, because a quoted `#` is not a comment.
 *     `examples/default-slide-layout.md` ships `meta: "Default layout · #1292"`;
 *     a naive comment strip truncates it to `Default layout ·`. This is the one
 *     corpus deck that proves the quote-awareness is not theoretical.
 *  3. In an UNQUOTED value, only a WHITESPACE-PRECEDED `#` starts a comment. A `#`
 *     that opens the value, or that follows a non-space, is data:
 *       · `backgroundColor: #ffffff` → `#ffffff`. Strict YAML calls that a comment
 *         and demands quotes, but `color`/`backgroundColor` are real directives that
 *         take colors, so an unquoted hex is a deck someone would plausibly write
 *         and it works today. Breaking it to gain YAML purity would be a
 *         self-inflicted regression (HARD RULE #18) for no one's benefit.
 *       · `logo: /brand/mark.svg#icon` → kept, for the same reason.
 *
 * MALFORMED input (one stray quote) keeps the legacy single-character strip rather
 * than inventing a new behavior. `frontMatterValue` and `parseFrontMatter` used to
 * differ here — the former stripped a lone leading quote, the latter kept it — and
 * this unifies them on the former. Unobservable on every committed deck: a scan of
 * the corpus finds ZERO front-matter values with unbalanced quotes.
 *
 * @param {string} raw the text after `key:` to end-of-line
 * @returns {string} the cleaned scalar
 */
function frontMatterScalar(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const quote = t[0];
  if (quote === '"' || quote === "'") {
    // Find the CLOSING quote, honoring `\"` inside a double-quoted scalar the way YAML
    // does. A plain `indexOf` stops at the escaped quote and truncates the value — which
    // silently disarms `logo: "./acme.svg\"><script>…"` by throwing the payload away
    // instead of passing it to the escaper that is supposed to neutralise it. Safer by
    // accident is still a reader that disagrees with YAML, and the security property
    // belongs to the HTML escaper downstream, not to an accident here.
    let end = -1;
    for (let i = 1; i < t.length; i++) {
      if (quote === '"' && t[i] === '\\') { i++; continue; } // skip the escaped character
      if (t[i] === quote) { end = i; break; }
    }
    // Terminated: the quoted span IS the value; a trailing comment is not part of it.
    // The span is returned RAW (escapes not unfolded), exactly as the readers this
    // replaces returned it — unfolding would be a second behavior change riding along.
    if (end !== -1) return t.slice(1, end);
    // Unterminated: fall through to the legacy lone-quote strip (see MALFORMED above).
    return t.slice(1);
  }
  // Unquoted: cut at the first whitespace-preceded `#`. `search` returns the index of
  // the WHITESPACE, so the value keeps nothing of the comment or the space before it.
  const cut = t.search(/[ \t]#/);
  const body = (cut === -1 ? t : t.slice(0, cut)).trim();
  // The legacy independent single-character strips, preserved so a value carrying one
  // stray quote reads exactly the way it always did.
  return body.replace(/^['"]/, '').replace(/['"]$/, '');
}

/**
 * The island's key lines of `fm`, keeping the last answer: a render reads ~20 registers
 * from the same block. The list is frozen (`frontMatterKeys`), so a reader cannot change it.
 */
let lastKeysFm = null;
let lastKeys = [];
function keysOf(fm) {
  const text = String(fm ?? '');
  if (text !== lastKeysFm) {
    lastKeys = frontMatterKeys(text);
    lastKeysFm = text;
  }
  return lastKeys;
}


/**
 * The value of `key` in a front-matter block, trimmed and unquoted — or null when
 * the key is absent. `fm` is the YAML BODY (no `---` fences).
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null}
 */
function ownFrontMatterValue(fm, key) {
  // What the deck itself WROTE for `key` (the loose read `frontMatterValue` starts from), with no
  // preset fallback: the linter's question, never a render's.
  const line = looseKey(keysOf(fm), key);
  return line ? frontMatterScalar(line.raw) : null;
}

/**
 * The value of `key` in a front-matter block, trimmed and unquoted — or null when
 * the key is absent — WITH the preset fallback for a preset-family key. A linter asking what
 * the deck WROTE reads `ownFrontMatterValue` (above) instead.
 */
function frontMatterValue(fm, key) {
  // A TOP-LEVEL line wins over a nested one, and of repeated top-level lines the LAST wins, as the
  // engine reads them (#3050, D1: the owner's ruling; `lint:deck` warns with `duplicate-key`).
  // `key :` is the same key. Only a key that appears NOWHERE at column 0 falls back to the loose,
  // any-indent read this function has always had, so a read-only key nested by habit still reads.
  const own = ownFrontMatterValue(fm, key);
  // `rule: # todo` is YAML for an empty value; the scalar rule only strips a comment that
  // FOLLOWS a value, so a comment-only value is treated as empty here.
  if (own !== null && ((own !== '' && !own.startsWith('#')) || !isPresetKey(key))) return own;
  // A preset-family register that is ABSENT — or written EMPTY (`rule:`, `rule: # todo`),
  // which says nothing — falls back to the deck's `preset:`. This is the one place a preset
  // resolves, so the plugins, the runtime and the resolvers agree on it. An explicit value
  // never reaches here, which is what makes the dials overrides. The Studio mirrors this
  // rule in docs/src/components/studio/deck-preset.ts. lib/core/resolve-preset.js.
  if (!isPresetKey(key)) return own;
  return presetFallback(fm, key, own);
}

/**
 * What a preset-family key that the deck left ABSENT or EMPTY resolves to: the deck's preset's value,
 * else `own` (null for absent, '' for empty) when the deck names no preset, else null. Shared by
 * `frontMatterValue` and `topLevelRegisterValue`, so the loose and the top-level readers fall back by
 * one rule.
 */
function presetFallback(fm, key, own) {
  // An alias the deck wrote speaks for the key (`chart-finish:` for `marks:`), so no preset answers.
  if ((PRESET_KEY_ALIASES[key] || []).some((alias) => {
    const v = frontMatterValue(fm, alias);
    return v !== null && v !== '' && !v.startsWith('#');
  })) return own;
  // TOP-LEVEL only, like every register something WRITES (see `topLevelFrontMatterValue`):
  // the Studio's preset picker writes column 0, so a nested `pptx:\n  preset: brand` read
  // here would drive a render the picker can neither see nor change.
  const preset = topLevelFrontMatterValue(fm, 'preset');
  return preset === null ? own : presetValue(preset, key);
}

/**
 * `topLevelFrontMatterValue` with the preset fallback: the RENDER reader for a preset key that is read
 * at column 0 — `theme:`, `color-mode:`, `backdrop:` (D1). The deck's own top-level line wins whenever it
 * says something; an absent, empty or comment-only line falls back to the deck's `preset:`, exactly as
 * `frontMatterValue` does for the loose family. A non-preset key reads exactly as
 * `topLevelFrontMatterValue` reads it.
 *
 * NOT for a linter or a writer. Those ask what the deck WROTE (a preset's value is known-good, and a
 * writer must never mistake a recommendation for a line it can rewrite), so they keep calling
 * `topLevelFrontMatterValue`.
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null}
 */
function topLevelRegisterValue(fm, key) {
  const own = topLevelFrontMatterValue(fm, key);
  if (!isPresetKey(key)) return own;
  if (own !== null && own !== '' && !own.startsWith('#')) return own;
  return presetFallback(fm, key, own);
}

/**
 * The same read, restricted to a TOP-LEVEL key — column 0, no leading whitespace.
 *
 * `frontMatterValue`'s `^[ \t]*` matches a NESTED key too, and for most registers
 * that is harmless: nobody writes `foo:` with a `logo:` under it. It stops being
 * harmless for a register that something also WRITES, because every writer in this
 * repo anchors at column 0 (an indented `class:` may be a nested key or a line of
 * a `style: |` block scalar, and rewriting either corrupts the deck). Reader and
 * writer then disagree about which line is the register:
 *
 *     ---
 *     foo:
 *       color-mode: light      # the loose READ finds this…
 *     class: dark              # …and drops the author's real register,
 *     ---                      # while the WRITER, at column 0, sees no key at all
 *
 * The render path resolved that deck without `dark`; an Export-to-Marp of the same
 * bytes kept it. Two different decks from one source, which is the whole failure
 * #1416 exists to end — so the two registers with a writer, `class:` and
 * `color-mode:`, read top-level-only, and so does every engine directive, because the
 * engine reads directives at column 0 (#2050). A repeated key reads as its LAST line, as
 * the engine does (#3050, D1). The looser reader stays the default for read-only keys.
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null}
 */
function topLevelFrontMatterValue(fm, key) {
  // THE LAST LINE WINS, and `key :` is the key — the engine's own rule (`parseFrontMatter`,
  // lib/engine/directives.js, overwrites as it reads and allows whitespace before the colon),
  // and YAML's reading of `key :`. Owner's ruling on #3050 (D1): a repeated key is read as its
  // LAST value everywhere, and `lint:deck` warns on the repeat (`duplicate-key`). Reading the
  // first here while the engine painted the last is how `class: kpi` / `class: dark` rendered
  // dark while this reader refused `kpi`.
  const line = topLevelKey(keysOf(fm), key);
  return line ? frontMatterScalar(line.raw) : null;
}

/**
 * A front-matter value that must be a bare NAME — the shape a dozen deck registers
 * (`finish:`, `mode:`, `split:`, `stamp:`, `claim:`, `rule:`, `eyebrow:`, …) share.
 *
 * Each of those used to inline `/^[ \t]*<key>:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m`,
 * which did two jobs in one pattern: READ the value, and CONSTRAIN it to a bare name.
 * The constraint is right and is preserved here verbatim. The read was wrong in one
 * specific way — the `$` anchor meant a trailing YAML comment made the whole pattern
 * fail to match, so `finish: sketch  # for review` silently resolved to NO finish while
 * the engine's own parse read `sketch`. Every one of those registers had it.
 *
 * Splitting the two jobs is what fixes it: read through the one shared scalar rule, then
 * apply the constraint as its own predicate. An out-of-shape value still returns null,
 * exactly as before, so a linter that reports an unknown name keeps reporting it.
 *
 * @param {string} fm front-matter body
 * @param {string} key the key name, without the colon
 * @returns {string|null} the bare name, or null when absent or not name-shaped
 */
function frontMatterName(fm, key) {
  const value = frontMatterValue(fm, key);
  if (value === null) return null;
  return BARE_NAME.test(value) ? value : null;
}

/** The bare-name shape every register above constrained its value to. Unchanged. */
const BARE_NAME = /^[A-Za-z0-9_-]+$/;

module.exports = {
  frontMatterValue, ownFrontMatterValue, topLevelFrontMatterValue, topLevelRegisterValue, frontMatterScalar, frontMatterName,
  PRESETS, PRESET_NAMES, PRESET_KEYS, PRESET_DEFAULTS, PRESET_KEY_ALIASES, isPresetKey, isKnownPreset, presetValue, presetEffective,
  presetTokenClass, isPresetTokenClass, presetTokensCss, presetTokenProblem, withPresetTable,
};
