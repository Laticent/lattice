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
 * WHY SOURCE-LEVEL, NOT `mermaid.initialize`. Both paths now carry the palette
 * in the diagram SOURCE (HARD RULE #1). The PDF path has no choice — it shells
 * out to `mmdc`, one process per diagram. Doing the same in the runtime keeps a
 * single mechanism with a single set of merge semantics, instead of two that
 * agree only by coincidence: config passed to `initialize` lands in mermaid's
 * `configFromInitialize`, which an author `theme:` directive folds back in as
 * user overrides — so the runtime would have painted our palette OVER `forest`
 * while the PDF path rendered `forest` clean.
 *
 * Pure + fs-free, so the browser bundle can require it.
 */

// Mirrors mermaid's own `directiveRegex` (src/diagram-api/regexes.ts) narrowed
// to the init/initialize types. Mermaid tolerates a missing `}%%` terminator;
// we require it — an unterminated directive is malformed input, and the
// conservative read (treat it as absent, still emit the engine directive) keeps
// the palette rather than dropping it, with the author's keys still winning
// because mermaid merges ours first.
const INIT_DIRECTIVE_RE = /%%\{\s*(?:init|initialize)\s*:\s*((?:(?!\}%%)[\s\S])*?)\s*\}%%/gi;

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
  const payloads = [];
  INIT_DIRECTIVE_RE.lastIndex = 0;
  let m;
  while ((m = INIT_DIRECTIVE_RE.exec(definition)) !== null) payloads.push(m[1]);
  if (!payloads.length) {
    // `%%{init` with no terminator still counts as present-but-unknown; the
    // bare-`%%{` case (some other directive type, or a plain comment) does not.
    return /%%\{\s*(?:init|initialize)\s*:/i.test(definition)
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
    config = deepMerge(config, parsed);
  }
  return { present: true, config };
}

/**
 * True when the author's directive names a Mermaid theme other than `base` —
 * an explicit opt-out of the engine palette. Also true for a directive we
 * could not parse (unknown contents; leave the author's source alone rather
 * than guess), so this is the honest predicate for "the engine does not own
 * this diagram's colors".
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
 */
function engineInitDirective(engineConfig) {
  return `%%{init: ${JSON.stringify(prune(engineConfig))}}%%`;
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

function deepMerge(dst, src) {
  const out = { ...dst };
  for (const [k, v] of Object.entries(src)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
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
  INIT_DIRECTIVE_RE,
  readAuthorInit,
  authorPinsTheme,
  engineInitConfig,
  engineInitDirective,
  withEngineInit,
};
