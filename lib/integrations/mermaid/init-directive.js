/* Mermaid `%%{init}%%` reconciliation for the PDF path — where the engine's
 * palette and an author's own init directive are merged by hand.
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
 *     (a name Mermaid RESOLVES,     explicit opt-out of the palette; honoring it
 *      other than `base`)           is the long-standing contract the export
 *                                   path's look re-bake also reports on. A name
 *                                   Mermaid cannot resolve is NOT a pin — see
 *                                   authorPinsTheme.
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

// The PDF path's diagram font. NOT shared with the runtime — the runtime is
// in-process, so it can pass the hyphenated `--font-body` stack through
// `mermaid.initialize`'s permissive sanitizer (lib/runtime/index.js). That
// divergence is a real, pre-existing WYSIWYG gap, recorded in
// engineering/mermaid.md §5.3.
// Monospace is the deliberate choice here — predictable character widths, so
// Mermaid's measure pass and its render pass agree and labels don't overflow
// their nodes. It is ALSO the only kind of stack that survives
// DIRECTIVE_VALUE_OK: quotes, spaces and letters are allowed, hyphens are not,
// so `system-ui`/`sans-serif` cannot ride in a directive at all.
const DIAGRAM_FONT_STACK = '"JetBrains Mono", monospace';

/**
 * The inset between a node's label and its border, in SVG USER UNITS.
 *
 * Mermaid's `flowchart.padding` — which, despite the name, is the NODE label
 * inset, not the cluster's. The cluster's own inset is a hardcoded
 * `marginx/marginy: 8` on the sub-graph mermaid hands to dagre; no config reaches
 * it, and `flowchart.padding` provably does not move it (raising it 8 → 24 leaves
 * cluster-minus-node constant at 70 x 100 user units).
 *
 * 15 IS THE VALUE BOTH PATHS ALREADY RENDERED AT. Pinning it here changes no
 * pixel; what it changes is that the number is now stated once instead of being
 * a default on one path and a literal on the other, so an edit to either cannot
 * silently diverge.
 *
 * The first version of this constant was 10, on the reasoning that this path
 * "never set it, taking mermaid's built-in 8, while lib/runtime/index.js set 15".
 * That was wrong twice over. `config.flowchart?.padding || 8` in mermaid's
 * flowchart DB never reaches its `|| 8`, because the SCHEMA default for
 * `flowchart.padding` is 15 (`diagramPadding` is the key that defaults to 8 — a
 * different thing, the whole-diagram margin). Measured with mmdc: no directive
 * and `padding: 15` both emit `viewBox="0 0 299.890625 70"`, byte-identical;
 * `padding: 10` emits `0 0 259.890625 60`. So the two paths already agreed, and
 * shipping 10 would have shrunk every flowchart node in every export by a fifth
 * — a global cosmetic change, carried in under a repair framing.
 *
 * ONE HOLE, stated rather than implied: when an author PINS a Mermaid theme this
 * path emits no directive at all (see THE RULE above), so the export falls back
 * to Mermaid's own default for every config key while the preview's global
 * config still applies. For this key that is harmless — Mermaid's default IS 15 —
 * but the guarantee is "both paths send 15", not "both paths are configured".
 * Tracked with the rest of the config-half divergence in #1347.
 *
 * It also happens to be `--sp-md` rendered: the diagram SVGs on
 * examples/containment-tier.md are fitted at 1.40x-2.17x (median 1.64), and
 * 15 x 1.64 = 24.6px against `--sp-md`'s 24px at hd. The value cannot read the
 * token — this is a number in the diagram's own viewBox space — but it lands on
 * the scale rather than beside it.
 */
const DIAGRAM_NODE_PADDING = 15;

/**
 * The width, in SVG USER UNITS, at which Mermaid wraps a flowchart node label.
 *
 * THE ONE THAT BITES (#1347). Wrapping width decides where a label breaks, and a
 * label break decides the node's WIDTH — so this is a LAYOUT key, not an inset. The
 * preview set 480 and the PDF path set nothing, taking Mermaid's schema default of
 * 200, so the same deck laid its flowcharts out differently in preview and in export:
 * a wider WYSIWYG gap than anything the theme map ever carried, and invisible to every
 * check in the tree because `DIVERGENT_KEYS` governs `themeVariables` only.
 *
 * 480 is the deliberate value, not the compromise: "keep short phrases on one line"
 * was the intent when the preview set it, and Mermaid's 200 is aggressive enough to
 * break a three-word label. Sharing it moves the EXPORT to match the preview, which
 * changes exported bytes — and is why this needs an export sign-off rather than being
 * a silent tidy-up.
 */
const DIAGRAM_WRAPPING_WIDTH = 480;

// Every theme name Mermaid 11.14 will actually resolve — the exact key set of its
// `themes_default` registry (chunk-ICPOFSXX.mjs). `updateCurrentConfig` re-derives
// themeVariables ONLY for `theme in themes_default`, and that lookup is
// case-sensitive and exact, so anything outside this set is not an opt-out: the
// author gets no theme from Mermaid either, and the engine should keep the
// diagram rather than stand down. Re-check on a Mermaid upgrade — a name added
// upstream and missing here reads as "not a pin", which keeps the palette (the
// safe direction) but ignores an author who asked for the new theme.
const MERMAID_THEME_NAMES = new Set([
  'base', 'dark', 'default', 'forest', 'neutral',
  'neo', 'neo-dark', 'redux', 'redux-dark', 'redux-color', 'redux-dark-color',
]);

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
  // Pin only on a name Mermaid will ACTUALLY resolve, matched case-sensitively —
  // `updateCurrentConfig` re-derives themeVariables only when
  // `sumOfDirectives.theme in themes_default`, and that lookup is exact. A
  // lowercase-and-compare test made `theme: ''`, `theme: 'Forest'` and any typo
  // read as an opt-out: the engine stood down, Mermaid resolved no theme either,
  // and the diagram rendered in stock `#ffffde` — reproducing the very bug this
  // file exists to prevent, and (since the export re-bake keys on this predicate)
  // getting reported as "kept their own colors" when the author kept nothing.
  // An unresolvable name is not a pin; the engine keeps the diagram.
  return MERMAID_THEME_NAMES.has(config.theme) && config.theme !== 'base';
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
    // Marp does not support line breaks in a code fence, so Mermaid's markdown
    // auto-wrapping has nothing legitimate to act on and its re-flow is an unexpected
    // formatting change. That reasoning reads the SAME fence on both paths, so it was
    // never a preview-only concern — the preview just happened to be the only path
    // that said so (#1347).
    markdownAutoWrap: false,
    flowchart: {
      // The node label inset — see DIAGRAM_NODE_PADDING. Stated rather than left to
      // mermaid's default, so the two paths cannot drift; the value is the one both
      // already rendered at, so no pixel moves. An author's own `flowchart` block
      // merges OVER this (mermaid's assignWithDepth is a deep merge), so naming
      // `curve` still keeps the padding, exactly like the palette above.
      padding: DIAGRAM_NODE_PADDING,
      // Where a node label wraps, and therefore how wide the node is. See
      // DIAGRAM_WRAPPING_WIDTH — the layout gap #1347 measured.
      wrappingWidth: DIAGRAM_WRAPPING_WIDTH,
      // Mermaid's `flowchart.htmlLabels` default is `null`, which resolves to the
      // top-level `htmlLabels`. Stating it means neither path depends on that
      // resolution staying what it is across a Mermaid upgrade.
      htmlLabels: true,
      // NOT set here, deliberately: `subGraphTitleMargin`. It is the only mermaid
      // config that reaches the cluster's INTERNAL space, and it breaks NESTED
      // subgraphs. Mermaid does grow the box (`node.height += subGraphTitleTotalMargin`),
      // but it does not push the CHILD cluster down by the same amount, so the inner
      // rect is painted over the outer cluster's title. Measured at 10/100: outer
      // rect y=-47, outer label at y=-37 spanning ~24 units, inner rect starting at
      // y=-27 — straight through the middle of the label. A flat subgraph survives;
      // one level of nesting does not. `bottom` also adds that many user units of
      // dead space inside the box. The runtime carried 10/100 and did exactly this
      // in live preview.
      //
      // NOT set here either: `useMaxWidth`. It is a sanctioned divergence
      // (DIVERGENT_CONFIG below) — see the note there.
    },
    // Quadrant type sizes, tuned for SLIDE scale rather than for a standalone figure.
    // Preview-only until #1347, so an exported quadrant chart rendered its title,
    // axis and point labels at Mermaid's much smaller defaults while the preview
    // showed the tuned ones — the same deck, two type scales.
    quadrantChart: {
      titleFontSize: 24,
      pointTextPadding: 20,
      pointLabelFontSize: 14,
      pointRadius: 6,
      quadrantLabelFontSize: 18,
      yAxisLabelFontSize: 22,
      xAxisLabelFontSize: 22,
    },
    // C4 ships with shape widths tuned for very short Person()/System()
    // labels and never wraps. Limit shapes-per-row to 3 (default 4) so a
    // 5-shape diagram fans across two rows rather than cramming a single
    // tight strip. Width/height keys exist in the schema but Mermaid 11's
    // c4 renderer ignores them — fix authoring-side by keeping labels short.
    //
    // Export-only until #1347: the PREVIEW was the path missing this one, so a C4
    // diagram crammed one row live and fanned across two in the export.
    c4: {
      c4ShapeInRow: 3,
      c4BoundaryInRow: 1,
    },
  };
}

/**
 * Config keys whose value is allowed to differ between render paths, each with the
 * reason it is not simply a bug — the config-half sibling of `DIVERGENT_KEYS`
 * (lib/core/mermaid-theme-map.js), which governs `themeVariables` only. #1347 exists
 * because that gap meant the ENTIRE non-palette config was invisible to every check
 * in the tree.
 *
 * THREE OF THESE ARE NOT CHOICES. `securityLevel`, `suppressErrorRendering` and
 * `startOnLoad` are on Mermaid's own SECURE-KEY list (`secure: ['secure',
 * 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering',
 * 'maxEdges']` in its default config): `sanitize` DELETES them from anything that is
 * not `mermaid.initialize`. A `%%{init}%%` directive structurally cannot carry them,
 * so the PDF path — whose config can only travel in the diagram source — could not
 * state them even if it wanted to. Putting them in `engineInitConfig` would emit keys
 * Mermaid silently drops, which reads as parity and is not.
 *
 * Verified against the installed Mermaid 11 rather than assumed; re-check on a
 * Mermaid upgrade, because a key leaving that list would make it shareable.
 *
 * The paths AGREE on the effective value for two of the three: Mermaid's default
 * `securityLevel` is `strict`, which is what the preview sets, and `startOnLoad` is
 * meaningless on a path that never runs Mermaid in a page.
 */
const DIVERGENT_CONFIG = Object.freeze([
  // Mermaid secure keys — undeliverable by directive, not chosen.
  'securityLevel',
  'startOnLoad',
  // Also a secure key, AND a deliberate preview behavior: the runtime catches a parse
  // failure and injects its own themed error block, because Mermaid's built-in error
  // SVG has a fixed 2412x512 viewBox that does not fit slide bounds.
  'suppressErrorRendering',
  // A deliberate preview behavior. `false` renders a flowchart at intrinsic size
  // instead of stretching it to the container, so sizing stays consistent across a
  // deck. Sharing it would change how every exported diagram on a slide OUTSIDE
  // `section.diagram` is constrained — inside one, mermaid.css forces
  // width/max-width/height with `!important` and this key cannot be seen at all — and
  // that is a layout change, not a parity fix. #1347 records it as deliberate; left
  // deliberate here rather than carried in under a "make the paths agree" framing.
  'flowchart.useMaxWidth',
]);

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
  DIAGRAM_NODE_PADDING,
  DIAGRAM_WRAPPING_WIDTH,
  DIVERGENT_CONFIG,
  readAuthorInit,
  authorPinsTheme,
  engineInitConfig,
  engineInitDirective,
  withEngineInit,
};
