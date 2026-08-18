/* Mermaid init config — the ONE non-palette config both render paths send, plus the
 * reader that tells us what an author's own `%%{init}%%` asks for.
 *
 * THE BUG THIS EXISTS TO PREVENT (#1311). The engine themes Mermaid by handing it a
 * `themeVariables` block built from the active palette. The PDF path used to skip that
 * injection entirely the moment the fence contained ANY `%%{init}%%` — so a directive
 * touching nothing but curve style dropped the whole injected set and the figure fell
 * back to Mermaid's stock palette: `#ffffde` clusters, `#333` label ink, the wrong
 * font. It failed SILENTLY — the diagram still rendered, just off-theme.
 *
 * HOW THAT GUARANTEE IS KEPT NOW, and why this file got smaller (#1674). Both paths
 * hand the engine config to `mermaid.initialize`, and Mermaid's own
 * `updateCurrentConfig` merges an author's in-source directive OVER that siteConfig on
 * every render. So "merge, don't replace" is Mermaid's behavior rather than ours: an
 * author sets what they name and keeps the palette for everything they don't.
 *
 * Until #1674 only the runtime could do that, because it is in-process. The export
 * shelled out to the `mmdc` binary, one process per diagram, so its config could only
 * travel IN the diagram source — and this file carried a hand-written merge kernel
 * (`withEngineInit` / `engineInitDirective` / `directiveSafe`) to serialize the engine
 * config into a `%%{init}%%` line and place it ahead of the author's.
 *
 * That kernel is GONE, along with the constraint that shaped it. The export now renders
 * in a page the engine owns (lib/integrations/mermaid/render-worker.js) and configures
 * it through `mermaid.initialize` like the preview. Three things went with it:
 *
 *   - `DIRECTIVE_VALUE_OK` — mermaid's `sanitizeDirective` allow-list, which bars the
 *     hyphen, so a `--font-body` stack could not ride a directive at all;
 *   - `DIAGRAM_FONT_STACK` — the monospace stack the export bought to stay inside that
 *     allow-list, and the sole reason `DIVERGENT_KEYS` existed;
 *   - the apostrophe hazard `prune()` defended against: `detectDirective` runs a blanket
 *     `'` → `"` swap before `JSON.parse`, so ONE apostrophe in a value made the payload
 *     invalid JSON and mermaid's catch dropped EVERY directive in the diagram, palette
 *     included. Measured on Mermaid 11.14: an apostrophe anywhere in `themeVariables`
 *     drops the whole engine palette to stock `#ECECFF`/`#333333`. It never bit the
 *     engine — `prune` stripped apostrophes from every emitted string — but it is the
 *     kind of trap that only stays defused while someone remembers the defense exists.
 *     Nothing this file emits goes through a directive parser any more.
 *
 * What REMAINS is the reading half: an author's directive still has to be understood,
 * because a `theme:` pin is an explicit opt-out of the palette and the export's look
 * re-bake reports on it. Mermaid honors that pin natively now (their directive beats
 * our siteConfig), so `authorPinsTheme` no longer gates an injection — it answers
 * "did this author opt out?" for the code that needs to say so.
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

// RETIRED (#1674): `DIRECTIVE_VALUE_OK` and `DIAGRAM_FONT_STACK` lived here.
//
// The first was mermaid's `sanitizeDirective` allow-list for directive-borne
// `themeVariables` values, `/^[\d "#%(),.;A-Za-z]+$/` — no hyphen, so a CSS font stack
// like `Outfit, system-ui, sans-serif` was replaced with `""`. The second was the
// monospace stack the export bought to stay inside it. Neither applies to a config
// passed to `mermaid.initialize`, which runs the far more permissive `sanitize`; both
// paths now read the deck's real `--font-body` through `MERMAID_VAR_MAP`.
//
// Kept as a note, not a constant: the allow-list is mermaid's, it still governs any
// directive an AUTHOR writes, and someone reintroducing directive-borne engine config
// needs to find this on the way past.

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

/**
 * The rough.js seed for `look: handDrawn`, and the whole reason it is set at all:
 * WITHOUT IT EVERY SKETCH DIAGRAM IS A DIFFERENT PICTURE ON EVERY RENDER.
 *
 * `look: handDrawn` routes Mermaid's node/edge painting through rough.js, whose
 * jitter is seeded from `handDrawnSeed`. Mermaid's default is `0`, and rough.js
 * reads 0 as "no seed — use Math.random()", so a sketch deck rendered twice from
 * an unchanged source produces two different SVGs. Measured on
 * `examples/sketch.md`: 32 of 161 SVG lines differ between consecutive renders of
 * the same commit, every one of them a jittered `<path d="…">`.
 *
 * That is not a cosmetic detail. It is one of the reasons the committed gallery
 * PDFs are not byte-reproducible (`tools/golden-diff.mjs` documents the symptom
 * and has to rasterize-and-pixel-diff to work around it), which is what makes a
 * cross-cutting re-bless rewrite every golden it touches whether or not anything
 * moved. A fixed seed turns "different every time" into "different only when the
 * diagram changed" — and it is what lets a byte oracle gate any future change to
 * the diagram path at all.
 *
 * The VALUE is arbitrary; only its constancy matters. What is not arbitrary is
 * that it ships as a real change: pinning the seed re-draws every hand-drawn
 * diagram once, so sketch-mode goldens move in the commit that introduces it and
 * never again. Emitted ONLY under `handDrawn`, so every classic deck's directive
 * stays byte-identical — the same "say nothing, change nothing" rule the rest of
 * this config follows.
 */
const DIAGRAM_HAND_DRAWN_SEED = 1;

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
 * The four config blocks that carry their own font family, filled from ONE value.
 *
 * Enumerated rather than discovered, because mermaid's schema is the source of truth and
 * a key it adds should fail a test rather than be silently missed. The full list, with
 * mermaid's defaults, is in the comment at the call site.
 *
 * @param {string} family  The resolved `--font-body` stack, i.e. `themeVars.fontFamily`.
 */
/**
 * The C4 shape kinds that each carry their own `<kind>FontFamily` config key. Enumerated
 * rather than derived, because this module is pure and fs-free (it bundles into the
 * browser runtime) and cannot read mermaid's schema at build time — but the enumeration
 * IS checked against that schema by
 * `test/integration/mermaid/diagram-font-parity.test.js`, so a kind mermaid adds fails a
 * test instead of quietly rendering in Open Sans.
 *
 * Twenty-two, not the six an obvious reading finds: every shape has an `external_`
 * twin, and containers/components/systems each have `_db` and `_queue` variants. The
 * first cut of this fix set six and left `System_Ext` labels in Open Sans.
 */
const C4_FONT_KINDS = Object.freeze([
  'person',
  'external_person',
  'system',
  'system_db',
  'system_queue',
  'external_system',
  'external_system_db',
  'external_system_queue',
  'container',
  'container_db',
  'container_queue',
  'external_container',
  'external_container_db',
  'external_container_queue',
  'component',
  'component_db',
  'component_queue',
  'external_component',
  'external_component_db',
  'external_component_queue',
  'boundary',
  'message',
]);

function perDiagramFonts(family) {
  if (!family) return {};
  const c4 = {};
  for (const kind of C4_FONT_KINDS) c4[`${kind}FontFamily`] = family;
  return {
    c4,
    journey: { taskFontFamily: family, titleFontFamily: family },
    sequence: { actorFontFamily: family, messageFontFamily: family, noteFontFamily: family },
    timeline: { taskFontFamily: family },
  };
}

/**
 * The engine's Mermaid init config for a resolved `themeVariables` set. Shared
 * so the PDF path and the runtime send Mermaid the same non-palette options,
 * not just the same colors.
 *
 * @param {object} themeVars  The resolved `themeVariables` map.
 * @param {object} [opts]
 * @param {boolean} [opts.omitPalette]  The author pinned a Mermaid `theme:`, so send no
 *   `theme` and no `themeVariables` and let their pin decide the colors — see the note
 *   at the top of the returned object. Callers get this from `authorPinsTheme`.
 * @param {'handDrawn'|'classic'} [opts.look]  The node LOOK, from
 *   `resolveDiagramLook` (lib/core/diagram-look.js). `handDrawn` switches Mermaid
 *   onto its rough.js renderer so a `mode: sketch` deck's diagrams are drawn by
 *   the same hand as the slide around them. Omitted / `classic` emits NO `look`
 *   key at all rather than the explicit default: Mermaid's own default IS
 *   `classic`, so staying silent keeps every non-sketch deck's directive
 *   byte-identical to what it emitted before the look existed — the same
 *   "say nothing, change nothing" rule the rest of this config follows.
 */
function engineInitConfig(themeVars, { look, omitPalette = false } = {}) {
  return {
    // THE PALETTE HALF, omitted when the author PINNED a Mermaid theme.
    //
    // `theme: 'forest'` is an explicit opt-out of the deck palette, and honoring it
    // means sending neither our theme nor our variables — otherwise ours win for every
    // key we set, which is all 166 of them, and the pin does nothing. That contract
    // predates #1674 and the export kept it by emitting no directive at all; when the
    // export moved to `mermaid.initialize` it had to be carried across explicitly or a
    // pinned diagram would silently come back wearing the deck palette.
    //
    // The NON-PALETTE half below still goes out, which is better than the directive era:
    // emitting nothing meant a pinned diagram also lost `wrappingWidth`, `padding` and
    // the quadrant/c4 sizes to Mermaid's defaults — the hole this file's docstring used
    // to call out. Opting out of the palette is not opting out of the layout.
    ...(omitPalette ? {} : { theme: 'base', themeVariables: themeVars }),
    // ── Mermaid SECURE KEYS ───────────────────────────────────────────────────
    // `sanitize` deletes these from anything that is not `mermaid.initialize`, so
    // until #1674 the export — whose config could only travel in a `%%{init}%%`
    // directive — structurally could not state them, and all three sat in
    // DIVERGENT_CONFIG for that reason rather than by choice. Both paths call
    // `initialize` now, so they are simply shared.
    //
    // We orchestrate rendering ourselves (`mermaid.render` per fence) on both paths,
    // so nothing should auto-render on load.
    startOnLoad: false,
    // Both paths catch a parse failure and supply their own degradation — the runtime
    // injects a themed error block, the export falls back to a `<pre>` — because
    // Mermaid's built-in error SVG has a fixed 2412x512 viewBox that does not fit
    // slide bounds. `render()` still THROWS either way; this only stops Mermaid
    // painting its own error picture into the container first.
    suppressErrorRendering: true,
    // STRICT is Mermaid's own default, and the export always had it by never
    // overriding. Stating it is a no-op for the export and load-bearing for the
    // preview: under `loose`, a `click X "javascript:…"` directive renders as
    // `<a xlink:href="javascript:…">` inside the SVG, which the runtime assigns to
    // `innerHTML` — clicking the node then executes it, in the docs Studio's
    // same-origin, un-sandboxed preview frame (the HARD RULE #22 threat model, where
    // XSS is OpenRouter-key theft). What `strict` costs is Mermaid's `click`
    // interactivity, which is the attack vector itself and which no deck here uses.
    //
    // WHAT THIS KEY DOES AND DOES NOT COVER, measured rather than assumed (#1246). It
    // gates TWO things: URL handling (`formatUrl` runs `sanitizeUrl`, and `setClickFun`
    // refuses to bind a click callback, unless the level is `loose`), and a WHOLE-SVG
    // DOMPurify pass in `render()` (`else if (!isLooseSecurityLevel) svgCode =
    // purify.sanitize(svgCode, …)`). It does NOT solely govern NODE LABELS —
    // `sanitizeText` runs DOMPurify on those UNCONDITIONALLY and consults this key only
    // for an extra `removeScript` pass. So a label payload has belt and braces and a
    // `click … javascript:` payload has only this line: measured, flipping to `loose`
    // moves the click arm and leaves nine label arms green. Every one of those contracts
    // is THIRD-PARTY, so they are pinned behaviorally in
    // docs/e2e/mermaid-post-sanitize.spec.ts against the real Playground and the CDN's
    // real Mermaid (`mermaid@11`, currently 11.16.1 — not the 11.14.0 in node_modules).
    // A source assertion here could see none of it.
    //
    // It used to be stated in the runtime's PREVIEW_ONLY_CONFIG, because a Mermaid SECURE
    // KEY is stripped from anything that is not `initialize` and the export could only
    // speak through a `%%{init}%%` directive. The export owns its render page now and
    // calls `initialize`, so the key — and this reasoning — is shared by both paths.
    securityLevel: 'strict',
    // `look` is spread rather than assigned so a classic render emits no key. The
    // seed rides with it for the same reason and in the same breath: it is
    // meaningless without `handDrawn`, and emitting it on a classic deck would
    // change that deck's directive bytes for no behavioral gain. See
    // DIAGRAM_HAND_DRAWN_SEED — without it a sketch deck renders a different
    // picture every time.
    ...(look === 'handDrawn' ? { look, handDrawnSeed: DIAGRAM_HAND_DRAWN_SEED } : {}),
    // Marp does not support line breaks in a code fence, so Mermaid's markdown
    // auto-wrapping has nothing legitimate to act on and its re-flow is an unexpected
    // formatting change. That reasoning reads the SAME fence on both paths, so it was
    // never a preview-only concern — the preview just happened to be the only path
    // that said so (#1347).
    markdownAutoWrap: false,
    // HTML node labels — the TOP-LEVEL key, which is the one Mermaid honors:
    // `getEffectiveHtmlLabels` reads `config.htmlLabels ?? config.flowchart?.htmlLabels
    // ?? true`, and setting the nested slot also raises
    // FLOWCHART_HTML_LABELS_DEPRECATED. The preview always set it here; the first
    // version of this sharing moved it to `flowchart.htmlLabels`, which silently
    // demoted it — an author's `%%{init}%%` `flowchart.htmlLabels: false` would then
    // have WON where it previously lost. Verified against the installed Mermaid 11.
    htmlLabels: true,
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
    // ── THE PER-DIAGRAM FONT KEYS ────────────────────────────────────────────
    //
    // `themeVariables.fontFamily` is global and MOST families follow it. Four do not:
    // mermaid's config schema gives C4, journey, sequence and timeline their OWN
    // `*FontFamily` keys, defaulted to `"Open Sans"` or `"trebuchet ms"`, and those win
    // for the elements they cover. Measured on a `mode: sketch` deck before this: a
    // C4 context diagram came back with 33 of 34 labels in Open Sans and a user journey
    // with 22 of 51 — on a slide where every other word was in the hand face.
    //
    // Sequence and timeline LOOKED right without this only because `mermaid.css` happens
    // to cover the elements they use; the config underneath still said Open Sans. Setting
    // all twelve keys means the answer no longer depends on which elements our stylesheet
    // reaches, which is the kind of coincidence #1674 exists to stop relying on.
    //
    // `test/integration/mermaid/diagram-font-parity.test.js` fails on any label that
    // renders in a face the deck did not ask for, so a thirteenth key added upstream
    // surfaces as a test failure rather than as one odd-looking slide.
    ...perDiagramFonts(themeVars.fontFamily),
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
    // diagram crammed one row live and fanned across two in the export. MERGED onto the
    // font keys above rather than assigned after them — a second `c4:` property would
    // replace the whole block and take the six font keys with it.
    c4: { ...perDiagramFonts(themeVars.fontFamily).c4, c4ShapeInRow: 3, c4BoundaryInRow: 1 },
  };
}

/**
 * Config keys whose value is allowed to differ between render paths, each with the
 * reason it is not simply a bug. #1347 exists because this gap once meant the ENTIRE
 * non-palette config was invisible to every check in the tree.
 *
 * DOWN TO ONE (#1674). It used to carry four. Three of them — `securityLevel`,
 * `startOnLoad`, `suppressErrorRendering` — were on Mermaid's SECURE-KEY list, which
 * `sanitize` deletes from anything that is not `mermaid.initialize`; the export's
 * config could only travel in a `%%{init}%%` directive, so it could not state them
 * even where it agreed. That was never a choice, and it stopped being true the moment
 * the export got its own page: all three now live in `engineInitConfig` and are simply
 * sent by both paths.
 *
 * The `themeVariables` half of this pair — `DIVERGENT_KEYS` in
 * lib/core/mermaid-theme-map.js — retired completely in the same change, so the
 * remaining entry below is the only sanctioned difference between the two paths'
 * Mermaid config, of any kind.
 *
 * `test/unit/mermaid/init-config-parity.test.js` fails on an unlisted divergence AND on
 * a listed one that no longer diverges, so this list cannot rot in either direction.
 */
const DIVERGENT_CONFIG = Object.freeze([
  // A deliberate preview behavior, and — now that the secure keys are shared — the only
  // sanction here that is a CHOICE rather than a Mermaid constraint. `false` renders a
  // flowchart at intrinsic size instead of stretching it to the container, so sizing
  // stays consistent across a deck.
  //
  // Mostly moot in practice: `mermaid.css`'s `.mermaid-svg svg` rule forces
  // width/max-width/height with `!important`, and that selector is UNSCOPED — every
  // diagram the export emits is wrapped in `<div class="mermaid-svg">`, so the override
  // lands on both paths. (An earlier note here claimed the key decides how an EXPORTED
  // diagram outside `section.diagram` is constrained; that was wrong, and an independent
  // review caught it.) What remains is a narrow difference in the SVG's own attributes
  // (`width="100%"` + `style="max-width:Npx"` versus explicit px), which is a change to
  // exported bytes with no measured visual effect — so sharing it would be churn taken
  // on faith. Left divergent until someone measures a reason to move it.
  'flowchart.useMaxWidth',
]);

/*
 * GONE (#1674): `engineInitDirective`, `directiveSafe`, `withEngineInit`, `prune`.
 *
 * Together they serialized the engine config into a `%%{init: …}%%` line, stripped the
 * `themeVariables` values mermaid's directive sanitizer would blank, dropped empty ones,
 * removed apostrophes (which would otherwise make the payload invalid JSON and cost the
 * diagram its whole palette), and spliced the result in ahead of any author directive —
 * after the YAML front matter, if there was one.
 *
 * Every line of that was in service of ONE constraint: the export ran in a process it
 * did not control, so its config had to ride inside the diagram source. It does not any
 * more. `#1332`'s test for a correct fix was that it should let us DELETE the
 * reconciliation devices rather than accumulate more; this is that deletion, and the
 * behavior it implemented is now Mermaid's own directive-over-siteConfig merge.
 *
 * If you are here because you want the export to emit a directive again: read
 * engineering/decisions/2026-08-17-mermaid-render-worker.md first. The sanitizer
 * allow-list and the apostrophe trap are still real, and they are why this is not a
 * transport you can swap back in casually.
 */

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


module.exports = {
  scanInitDirectives,
  DIAGRAM_NODE_PADDING,
  DIAGRAM_WRAPPING_WIDTH,
  C4_FONT_KINDS,
  DIVERGENT_CONFIG,
  readAuthorInit,
  authorPinsTheme,
  engineInitConfig,
};
