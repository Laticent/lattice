/* Mermaid `%%{init}%%` reconciliation — the ONE place both render paths decide
 * how the engine's palette and an author's own init directive coexist.
 *
 * THE BUG THIS EXISTS TO PREVENT (#1311). The engine themes Mermaid by handing
 * it a `themeVariables` block built from the active palette. The PDF path used
 * to skip that injection entirely the moment the fence contained ANY
 * `%%{init}%%` — so a directive that touched nothing but curve style
 * (`%%{init: {"flowchart": {"curve": "linear"}}}%%`) dropped the whole injected
 * set and the figure fell back to Mermaid's stock palette: `#ffffde` clusters,
 * stock node fills, `#333` label ink, the wrong font. It failed SILENTLY — the
 * diagram still rendered, just off-theme.
 *
 * THE RULE. Merge, don't replace:
 *
 *   - No author directive        → emit the engine directive. (Unchanged.)
 *   - A COLOR-NEUTRAL directive  → emit the engine directive FIRST, then leave
 *     (layout, curve, renderer,    the author's directive where it is. Mermaid
 *      diagram-type config, …)     merges every init directive it finds in
 *                                  source order with the later one winning
 *                                  (`detectInit` → `assignWithDepth`), so the
 *                                  author's keys override ours and everything
 *                                  they did NOT set keeps the palette.
 *   - The author PINS A THEME    → emit nothing. `theme: 'forest'` is an
 *     (`theme:` ≠ `base`)          explicit opt-out of the palette; honoring it
 *                                  is the long-standing contract the export
 *                                  path's look re-bake also reports on.
 *
 * THIS KERNEL IS FOR THE PDF PATH ONLY, and that is deliberate. The runtime is
 * IN-PROCESS: it hands the palette to `mermaid.initialize` once, and mermaid's
 * own `updateCurrentConfig` merges an author's in-source directive OVER that
 * siteConfig on every render — so the guarantee above already holds there, for
 * free, with nothing injected per diagram. The PDF path has no such luxury: it
 * shells out to `mmdc`, one process per diagram, so its config can only travel
 * IN the diagram source, which is why the merge has to be done by hand here.
 *
 * That difference is DELIVERY, not policy, and it is not a HARD RULE #1 split:
 * what both paths share is the token→variable MAP, not the plumbing. Injecting
 * into runtime sources too was tried on this branch and reverted — a directive's
 * `themeVariables` go through mermaid's much stricter `sanitizeDirective` (see
 * DIRECTIVE_VALUE_OK below), which blanked the hyphenated `--font-body` stack and
 * left Mermaid measuring labels in one font while the page rendered them in
 * another. Paying that on the common path to align one edge case (an author
 * pinning a non-`base` theme) was a bad trade.
 *
 * Pure + fs-free, so a bundler can inline it.
 */

// Locating init directives is a hand-written LINEAR SCAN, not a regex, and that
// is deliberate. Every regex shaped like `%%\{…:(payload-until-`}%%`)\}%%` is
// polynomial on author text: with no terminator in the source, the engine scans
// to end-of-string from EVERY candidate start position, so a fence containing
// many `%%{init:` prefixes costs O(n²) — measured at 5.9 s for 20 000 of them,
// on the build path, from deck source. Bounding the payload quantifier only caps
// the constant; `indexOf` removes the class. Each character is visited a fixed
// number of times here, with no backtracking anywhere.
//
// CASE-SENSITIVE, deliberately. Mermaid's outer `directiveRegex` is `/gi`, but
// the filter that decides whether a directive is an INIT one is not:
// `detectInit` passes `/(?:init\b)|(?:initialize\b)/` — no `i` flag
// (chunk-5PVQY5BW.mjs). So mermaid reads `%%{INIT: {'theme':'forest'}}%%` as a
// directive it does not recognize and applies NOTHING from it. If we matched it
// case-insensitively we would see an author theme pin, stand down, and the
// diagram would end up with no palette from anyone — a fresh instance of the
// exact bug this file exists to kill. Agreeing with mermaid on case means an
// uppercase directive is invisible to both of us and the palette still lands.
const INIT_KEYWORDS = ['initialize', 'init'];   // longest first
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
const isWordChar = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);

/**
 * Scan for `%%{init: …}%%` / `%%{initialize: …}%%` and return their raw payloads.
 * `unterminated` is true when a well-formed opener had no closing `}%%`.
 *
 * Stricter than mermaid on one obscure point: mermaid tests its captured type
 * with an UNANCHORED `/init\b/`, so it also accepts `%%{xinit: …}%%`. We require
 * the keyword to stand alone. Being stricter is the safe direction — an
 * undetected directive means we inject ours FIRST and mermaid still lets the
 * author's win, so the palette lands either way.
 */
function scanInitDirectives(text) {
  const payloads = [];
  let unterminated = false;
  let i = 0;
  for (;;) {
    const open = text.indexOf('%%{', i);
    if (open === -1) break;
    let j = open + 3;
    while (j < text.length && isSpace(text[j])) j++;
    const kw = INIT_KEYWORDS.find((k) => text.startsWith(k, j));
    // `initfoo:` is not `init\b`; skip past this opener and keep scanning.
    if (!kw || isWordChar(text[j + kw.length])) { i = open + 3; continue; }
    let k = j + kw.length;
    while (k < text.length && isSpace(text[k])) k++;
    if (text[k] !== ':') { i = open + 3; continue; }
    const close = text.indexOf('}%%', k + 1);
    if (close === -1) { unterminated = true; break; }
    payloads.push(text.slice(k + 1, close).trim());
    i = close + 3;
  }
  return { payloads, unterminated };
}

// Mermaid's `sanitizeDirective` allow-list for `themeVariables` VALUES
// (chunk-ICPOFSXX.mjs). A value that fails it is replaced with `""` — note the
// hyphen is absent, so a CSS font stack like `Outfit, system-ui, sans-serif` is
// blanked. This filter applies to a DIRECTIVE only; config passed to
// `mermaid.initialize` goes through the far more permissive `sanitize`, which is
// why the constraint never bit while the runtime themed via `initialize`.
const DIRECTIVE_VALUE_OK = /^[\d "#%(),.;A-Za-z]+$/;

// The diagram font, shared by both render paths (HARD RULE #1). Monospace is the
// deliberate choice for diagrams — predictable character widths, so Mermaid's
// measure pass and its render pass agree and labels don't overflow their nodes.
// It is ALSO the only kind of stack that survives DIRECTIVE_VALUE_OK: quotes,
// spaces and letters are allowed, hyphens are not, so `system-ui`/`sans-serif`
// cannot ride in a directive at all.
const DIAGRAM_FONT_STACK = '"JetBrains Mono", monospace';

// Mermaid requires YAML front matter to be the FIRST thing in the source, so
// the engine directive goes AFTER the closing fence, never before it.
const FRONT_MATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;

/**
 * Every `%%{init}%%` / `%%{initialize}%%` payload in the source, merged in
 * document order (later wins), the way mermaid's `detectInit` does it.
 *
 * Returns `{ present, config }`:
 *   - `present: false, config: null` — no directive in the source.
 *   - `present: true,  config: {…}`  — one or more directives, all parsed.
 *   - `present: true,  config: null` — a directive we could not parse. Callers
 *     treat this as "there is one, but its contents are unknown".
 */
function readAuthorInit(definition) {
  if (typeof definition !== 'string' || !definition.includes('%%{')) {
    return { present: false, config: null };
  }
  const { payloads, unterminated } = scanInitDirectives(definition);
  if (!payloads.length) {
    // An opener with no closing `}%%` still counts as present-but-unknown; a
    // bare `%%{` (another directive type, or a plain comment) does not.
    return unterminated
      ? { present: true, config: null }
      : { present: false, config: null };
  }
  let config = {};
  for (const payload of payloads) {
    // Mermaid parses directive payloads as JSON after a blanket `'` → `"`
    // swap, which is why `{'theme':'forest'}` is valid mermaid. Match that
    // exactly so we read what mermaid will read.
    let parsed;
    try {
      parsed = JSON.parse(payload.replace(/'/g, '"'));
    } catch (_e) {
      return { present: true, config: null };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: true, config: null };
    }
    // deepMerge recurses, so a deeply nested payload can throw RangeError
    // (call-stack exhausted). This runs on author deck content — including
    // untrusted Playground input — so a throw here is a crash, not a bad
    // diagram. Degrade to present-but-unknown, exactly like a payload we could
    // not parse. (MAX_MERGE_DEPTH stops the common case before the stack does;
    // the catch covers whatever it misses.)
    try {
      config = deepMerge(config, parsed);
    } catch (_e) {
      return { present: true, config: null };
    }
  }
  return { present: true, config };
}

/**
 * True when the author's directive names a Mermaid theme other than `base` —
 * an explicit opt-out of the engine palette. This is the honest predicate for
 * "the engine does not own this diagram's colors".
 *
 * An UNPARSEABLE directive also returns true, and it makes no rendering
 * difference either way: `detectDirective` wraps its whole scan in one
 * try/catch, so one bad payload discards EVERY directive in that diagram —
 * ours included. Neither standing down nor emitting recovers the palette. We
 * stand down because we cannot read what the author asked for, and a diagram
 * with an unparseable directive is broken at the Mermaid parse step anyway.
 *
 * KNOWN GAP: this reads the `%%{init}%%` spelling only. Mermaid also accepts a
 * theme via YAML front matter (`---\nconfig:\n  theme: forest\n---`), and
 * `preprocessDiagram` merges front matter UNDER the directive — so the engine's
 * `theme: base` currently overrides a front-matter pin. Pre-dates this kernel
 * (the old `includes('%%{init')` check missed it too) and is tracked separately;
 * the directive spelling is the one #1311 is about.
 */
function authorPinsTheme(definition) {
  const { present, config } = readAuthorInit(definition);
  if (!present) return false;
  if (!config) return true;
  return typeof config.theme === 'string' && config.theme.toLowerCase() !== 'base';
}

/**
 * The engine's Mermaid init config for a resolved `themeVariables` set. Shared
 * so the PDF path and the runtime send Mermaid the same non-palette options,
 * not just the same colors.
 */
function engineInitConfig(themeVars) {
  return {
    theme: 'base',
    themeVariables: themeVars,
    // C4 ships with shape widths tuned for very short Person()/System()
    // labels and never wraps. Limit shapes-per-row to 3 (default 4) so a
    // 5-shape diagram fans across two rows rather than cramming a single
    // tight strip. Width/height keys exist in the schema but Mermaid 11's
    // c4 renderer ignores them — fix authoring-side by keeping labels short.
    c4: {
      c4ShapeInRow: 3,
      c4BoundaryInRow: 1,
    },
  };
}

/**
 * Serialize an engine init config to a `%%{init: …}%%` line.
 *
 * Two shaping rules, both driven by how mermaid parses the payload back:
 *
 *   1. NO SINGLE QUOTES in any emitted string. `detectDirective` runs a blanket
 *      `'` → `"` swap over the text before `JSON.parse`, so one apostrophe
 *      inside a value (a quoted CSS font name, `'Outfit', system-ui`) turns the
 *      payload into invalid JSON — and mermaid's catch drops EVERY directive in
 *      the diagram, palette included. Strip them; a font stack reads the same
 *      unquoted.
 *   2. DROP EMPTY VALUES. An unresolved CSS custom property reads back as `''`,
 *      and an empty color is worse than an absent one: Mermaid takes `''` as a
 *      real value and derives the rest of the palette from it. Omitting the key
 *      lets Mermaid's own default stand, which is what "proceeding with Mermaid
 *      defaults" already means on the runtime's unresolved-theme path.
 *   3. DROP WHAT MERMAID WOULD BLANK. `sanitizeDirective` replaces any
 *      `themeVariables` value outside DIRECTIVE_VALUE_OK with `""` — and `""` is
 *      the failure mode rule 2 exists to avoid, arrived at by a different road.
 *      Worse, it is silent and it is asymmetric: a blanked `fontFamily` makes
 *      Mermaid MEASURE labels in the host's default font while the page RENDERS
 *      them in the inherited one, so nodes come out too small and labels are
 *      clipped mid-word. Dropping the key instead keeps measure and render on
 *      the same font. Only top-level themeVariables values are filtered, which
 *      is exactly the set mermaid sanitizes (it skips nested objects).
 */
function engineInitDirective(engineConfig) {
  return `%%{init: ${JSON.stringify(prune(directiveSafe(engineConfig)))}}%%`;
}

/**
 * Strip `themeVariables` entries Mermaid's `sanitizeDirective` would blank.
 * Returns a copy; the caller's config is untouched.
 */
function directiveSafe(engineConfig) {
  const vars = engineConfig?.themeVariables;
  if (!isPlainObject(vars)) return engineConfig;
  const kept = {};
  for (const [k, v] of Object.entries(vars)) {
    // Mermaid only tests values with a `.match` method — a nested object (xyChart,
    // …) is passed through untouched, so mirror that and keep it.
    if (typeof v === 'string' && !DIRECTIVE_VALUE_OK.test(v.replace(/'/g, ''))) continue;
    kept[k] = v;
  }
  return { ...engineConfig, themeVariables: kept };
}

/**
 * Place the engine's init directive in `definition` so the engine palette
 * survives whatever the author wrote. See THE RULE at the top of this file.
 *
 * `engineConfig` is the object from `engineInitConfig()`.
 */
function withEngineInit(definition, engineConfig) {
  const def = typeof definition === 'string' ? definition : '';
  if (authorPinsTheme(def)) return def;
  const directive = engineInitDirective(engineConfig);
  const fm = def.match(FRONT_MATTER_RE);
  return fm
    ? `${fm[0]}${directive}\n${def.slice(fm[0].length)}`
    : `${directive}\n${def}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Keys that must never be assigned from a parsed payload. `JSON.parse` is one of
// the few things that creates a real OWN `__proto__` property, `Object.entries`
// hands it to us, and a plain `out[k] = v` then hits Object.prototype's setter
// and REPLACES the merged config's prototype with author-controlled data —
// `%%{init: {"__proto__": {"theme": "forest"}}}%%` would make `config.theme`
// read `forest` off an inherited object. Mermaid has no legitimate config key by
// any of these names, so dropping them costs nothing.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Mermaid's own config nests a handful of levels at most; anything past this is
// not a real diagram config, so stopping is more useful than recursing.
const MAX_MERGE_DEPTH = 32;

function deepMerge(dst, src, depth = 0) {
  if (depth > MAX_MERGE_DEPTH) throw new RangeError('mermaid init config nested too deeply');
  const out = { ...dst };
  for (const [k, v] of Object.entries(src)) {
    if (UNSAFE_KEYS.has(k)) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v, depth + 1) : v;
  }
  return out;
}

// Strip apostrophes from strings and drop empty leaves, recursively. An object
// left empty by pruning is dropped too, so `themeVariables: {}` never ships.
function prune(value) {
  if (typeof value === 'string') {
    const s = value.replace(/'/g, '').trim();
    return s === '' ? undefined : s;
  }
  if (Array.isArray(value)) return value.map(prune).filter((v) => v !== undefined);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value === null || value === undefined ? undefined : value;
}

module.exports = {
  scanInitDirectives,
  DIRECTIVE_VALUE_OK,
  DIAGRAM_FONT_STACK,
  readAuthorInit,
  authorPinsTheme,
  engineInitConfig,
  engineInitDirective,
  withEngineInit,
};
