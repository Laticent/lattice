/**
 * Masthead Cell kernel — builds the masthead Cell of the Form composition
 * model (design/forms.md; engineering/decisions/2026-06-15-form-implementation.md).
 *
 * Co-located with the Cell's other artifacts (issue #356): masthead.cell.json
 * (the slot definition) and masthead.css (the band layout) sit beside this
 * kernel, so the masthead Cell owns everything — manifest + CSS + transform —
 * the way a component owns lib/components/<bucket>/<name>/<name>.{manifest.json,
 * styles.css,transform.js}. The registry adapter that wires this into both
 * render paths (the DOM mirror + the registry shape) is lib/transformers/
 * masthead-lift.js, exactly as compare-code bridges its co-located
 * kernel into the registry tier.
 *
 * On any section that opts in with the `form` class, lift the slide's
 * masthead — the leading code-eyebrow (kicker), the first <h2> (title), and a
 * trailing code-only SUBTITLE paragraph (base.docs.md's "Subtitle labels"
 * pattern) — out of content flow into a named band:
 *
 *   <div class="cell-masthead">
 *     <div class="masthead-lede"> {eyebrow} {h2} {subtitle} </div>
 *     <div class="masthead-bay"></div>   <!-- reserved: meta/logo/status Tiles -->
 *   </div>
 *   <div class="cell-stage"> …the rest of the body… </div>
 *
 * Eyebrow and subtitle are each scoped to their side of the title
 * (extractEyebrowP only searches BEFORE the h2, extractSubtitleP only
 * immediately AFTER it) — a subtitle authored after the heading must never be
 * captured as a leading eyebrow (misordering it before the title and
 * mis-styling it as the mono-caps kicker instead of the italic subtitle), and
 * keeping the subtitle inside masthead-lede preserves the `h2 + p` sibling
 * adjacency its CSS (`base.modifiers.css`'s SUBTITLE block) keys on — leaving
 * it in the flow body would separate it from h2 by the band itself.
 *
 * The masthead lifts the eyebrow + title + subtitle into the band, then wraps the
 * remaining flow body into the frame's `.cell-stage` cell (flex cell-tree, §6) — a
 * bounded clipping cell so content can't bleed past the stage edge. The stage wrap
 * is per layout: generic prose always wraps; a standard component wraps once its
 * CSS is migrated to address the cell (STAGE_MIGRATED). An un-migrated component
 * keeps its direct-child `section.X > …` bodies untouched. (math / compare-code
 * drive their own title grid via `> h2` and are chrome-exempt in the toggle's skip
 * set.) A Marp running <header>, if present, stays at section level before the band.
 *
 * Sibling implementations kept in lock-step via the shared registry:
 *   - lib/engine            → applyToRenderedHtml (HTML-string path)
 *   - lattice-emulator.js   → transformMastheadSection (per-section path)
 *   - lattice-runtime.js    → DOM walk (lib/transformers/masthead-lift.js)
 */

const { mapSections } = require('../../../core/section-walk');

const OPT_IN = 'form';

function hasOptIn(cls) {
  return cls.trim().split(/\s+/).includes(OPT_IN);
}

// Components whose code-only paragraph immediately after the title is NOT a
// generic masthead subtitle — it's their own dedicated citation/scope-label
// chrome (each ships a `.cell-stage > p:has(> code:only-child)` rule keyed to
// this exact position). Left to the default extractSubtitleP, that paragraph
// gets captured into `.cell-masthead` before their own rule can ever see it —
// the rule was permanently dead code (issue #1199). These three are `flow`
// (STAGE_MIGRATED) components, so skipping the subtitle capture leaves the
// paragraph in the flow body, where it lands inside `.cell-stage` exactly
// where their own CSS expects it. Everything else about the masthead (the
// title lift, the eyebrow, the stage wrap) is untouched — this is narrower
// than the sovereign-frame exemption `math`/`compare-code` use, which opts a
// component out of the shared Frame model entirely.
const OWN_TRAILING_LABEL = /\b(citation-card|redline|regulatory-update)\b/;

/**
 * The body Cell (`.cell-stage`) — flex cell-tree, Phase 2
 * (2026-06-26-frames-as-flex-cell-trees.md §6). The masthead lift wraps the
 * post-band flow body of a GENERIC-PROSE Form slide into a single `.cell-stage`
 * element, which `section.form:has(> .cell-stage)` turns into a bounded clipping
 * cell (flex:1; min-height:0; overflow:clip) — so an over-stuffed prose body is
 * walled at the stage edge instead of bleeding into the footer/rail/pagination
 * band. Detection FAILS SAFE by inclusion: a slide wraps when it carries NO real
 * component layout (a bare `form` slide or generic `content`) OR when its layout
 * is in STAGE_MIGRATED. A standard component not yet migrated keeps its
 * `section.X > child` selectors composing — so an un-migrated (or brand-new)
 * component defaults to "not wrapped", never silently broken.
 *
 * Both sets are DERIVED from a single generated catalog (stage-catalog.generated.js;
 * the kernel is bundled into the runtime, which can't fs-load the manifests, so the
 * catalog is a plain baked object esbuild inlines — the axis-DOM-catalog pattern).
 * The drift test test/unit/forms/stage-catalog.test.js pins the exact partition, so
 * they can't fall out of sync with the manifest source of truth:
 *   · ALL_LAYOUTS — every component layout name (catalog keys). Used to tell a
 *     "bare" generic slide (no layout token → always wrap) from a component slide.
 *   · STAGE_MIGRATED — the `flow` layouts, whose body is wrapped in `.cell-stage`.
 *     `content` (generic prose) is flow; a `canvas` component keeps its direct-child
 *     `section.X > …` body and is left unwrapped — so a self-sizing (or brand-new)
 *     component is never silently broken.
 */
// The stage-cell classification for EVERY known layout token, derived from the
// single generated catalog (`stage-catalog.generated.js` — composed from each
// component manifest's `stage` field + the sovereign frames' `exemptFromChrome`;
// see engineering/decisions/2026-07-14-one-frame-model.md, step A). This
// REPLACES the three hand-maintained Sets that used to live inline here —
// STAGE_MIGRATED / STAGE_DEFERRED and the sovereign FORM_TOGGLE_SKIP
// (plugins.js). A drift test (test/unit/forms/stage-catalog.test.js) asserts the
// derived Sets reproduce that historical partition EXACTLY, so the wrap behavior
// is provably unchanged; the catalog is bundled into dist/lattice-runtime.js as a
// plain object (no fs), the same way axis-dom-catalog.generated.js is.
//   · flow      → wrapped in `.cell-stage` (bounded prose/structure clip cell).
//   · canvas    → self-sizing direct-child body (a chart's `.chart-body`, a
//                 Mermaid SVG, a QR/poster card) that measures against its own
//                 box; the section-level overflow probe walls it.
//   · sovereign → chrome-exempt own-grid frame (title/divider/…); handled
//                 upstream (FORM_TOGGLE_SKIP), never reaches the wrap decision.
// The {flow, canvas, sovereign} partition is TOTAL over ALL_LAYOUTS by
// construction of the generator, so a new component must declare its `stage` (or
// be a sovereign frame) — it can never sit silently unclassified.
const STAGE_CATALOG = require('./stage-catalog.generated.js');
// The frame-conformance opt-in set: components that flipped `conformance:"strict"`
// (engineering/decisions/2026-07-15-model-driven-frame-render.md §2/§4). Baked
// (conformance-catalog.generated.js) beside the stage catalog for the same reason
// — the runtime bundle can't fs-load manifests. A strict CANVAS materializes its
// declared `.cell-stage` cell (so its model-declared frame is built, not hand-drawn);
// a strict SOVEREIGN still owns its own grid and does not wrap.
const STRICT = new Set(require('./conformance-catalog.generated.js'));
const ALL_LAYOUTS = new Set(Object.keys(STAGE_CATALOG));
const STAGE_MIGRATED = new Set(
  Object.keys(STAGE_CATALOG).filter((n) => STAGE_CATALOG[n] === 'flow'),
);
const STAGE_DEFERRED = new Set(
  Object.keys(STAGE_CATALOG).filter((n) => STAGE_CATALOG[n] === 'canvas'),
);

/** The stage-cell classification for one layout token — `'flow' | 'canvas' |
 * 'sovereign'`, or `null` when the token is not a known layout. The single
 * classifier the three Sets used to encode; wrapsStageBody is defined in its terms. */
function stageSizingFor(token) {
  return STAGE_CATALOG[token] || null;
}

/** Should this Form slide's body be wrapped into the `.cell-stage` cell? True for
 * generic prose (no layout token) and for any `flow` component; false when a token
 * is a known non-`flow` layout (a `canvas` self-sizing body or a chrome-exempt
 * sovereign) — UNLESS that layout has opted into `conformance:"strict"` AND is a
 * `canvas`, in which case it wraps too (model-driven frame render §4: a strict
 * component materializes its declared stage cell even when it is a self-sizing
 * canvas). A strict SOVEREIGN still owns its own grid and must NOT wrap. Non-strict
 * components keep the exact pre-catalog `ALL_LAYOUTS.has(t) && !STAGE_MIGRATED.has(t)`
 * behavior — the drift test pins that equivalence. */
function wrapsStageBody(cls) {
  // .viz-frame merge (2026-07-15-viz-frame-merge.md): a `chart-frame` section always
  // wraps its body (chart canvas + caption) into `.cell-stage`, regardless of the
  // per-layout `canvas` sizing or `conformance:strict` state. The frame merge gives
  // every chart the Frame/Cell structure diagram has; the strict flag flips per-chart
  // as a cheap follow-on. (The stage-catalog drift test is updated to expect this.)
  if (/\bchart-frame\b/.test(cls)) return true;
  return !cls.trim().split(/\s+/).some((t) => {
    const kind = stageSizingFor(t);
    if (kind === null || kind === 'flow') return false; // generic prose / flow → wraps (doesn't block)
    // A conformance:strict CANVAS wraps its self-sizing body in `.cell-stage` too,
    // so its model-declared stage cell is built. A strict SOVEREIGN owns its grid —
    // it still blocks the wrap. Non-strict non-flow layouts keep today's behavior.
    if (kind === 'canvas' && STRICT.has(t)) return false;
    return true;
  });
}

/**
 * THE STAGE CELL — `<div class="cell-stage">`, or `<figure>` around a captioned graphic.
 *
 * `<figure>` is the element that says "this graphic and this caption belong to each
 * other", and `<figcaption>` is the caption half of that pair. They are decided and
 * emitted HERE, TOGETHER, in one function — which is the whole point of this shape.
 *
 * WHY TOGETHER. The first version split them: `chart-family.js` emitted the
 * `<figcaption>` and this file decided the `<figure>`. Three defects fell straight out
 * of that split, and all three vanish when one function owns both halves:
 *   · with `form: off` (or a `no-form` slide) no stage is built at all, so the
 *     `<figcaption>` shipped with no `<figure>` anywhere — a conformance error, and
 *     precisely the state `semantic-structure.test.js` says must never exist;
 *   · the two render paths each re-derived "is there a caption?" from different
 *     evidence (a regex on the HTML string vs `classList` on a node) and disagreed on
 *     four real inputs — a HARD RULE #1 split that renders identically;
 *   · `state-chart` put its `<figcaption>` in the MIDDLE of the figure, which the
 *     content model forbids (see the ordering rule below).
 * A caption that will not end up inside a `<figure>` simply stays a `<p>` — exactly
 * what it was before this change, carrying exactly the association it carried then.
 *
 * WHY THE STAGE AND NOT A NEW WRAPPER. `.cell-stage` is ALREADY the common parent of
 * the chart body and its caption — chart-family emits them as adjacent siblings and the
 * stage wrap collects them. So this is a RETAG, not an added box: zero new elements.
 * The UA's `figure { margin: 1em 40px }` is killed by the bare `margin: 0` on
 * `section.form > .cell-stage` — HARD RULE #20 permits a zero reset because it adds no
 * space. Note the cascade argument that "every `.cell-stage` selector is class-keyed"
 * is NOT sufficient on its own: `base.fluid-view.css` exempts `figure` BY TYPE from
 * `flex-grow: 0`, in a rule that never mentions the stage, and the retag silently
 * escaped it (a captioned slide grew to 1912px against an uncaptioned twin's 153px).
 * That rule now excludes the stage explicitly. Proving `div.cell-stage` appears nowhere
 * proves nothing about rules that match the NEW tag.
 *
 * WHY IT KEYS ON THE CAPTION AND NOT ON `chart-frame`. A `<figure>` whose only content
 * is a graphic adds an announced boundary and no information — that is the over-tagging
 * §4A warns about. The association is the whole point, so the tag follows the thing
 * being associated.
 *
 * THE ORDERING RULE IS THE SPEC'S. `<figure>`'s content model is *figcaption then flow
 * content*, or *flow content then figcaption* — never figcaption in the middle. A
 * `state-chart` stage is `{chart-body, caption, state-legend}`, so it does NOT qualify,
 * and it keeps a `<div>` stage with a `<p>` caption. An earlier docblock asserted the
 * opposite ("`<figure>` explicitly admits more than one child") — true about cardinality,
 * false about position, and the gallery shipped the invalid shape.
 *
 * THE FIGURE IS NAMED, because an unnamed one is worse than none in the artifact that
 * matters. Chrome tags exported PDFs, and it maps `<figure>` to a `/Figure` structure
 * element whose `/Alt` comes from the accessible name. A nameless `<figure>` therefore
 * emits `/Figure` with NO `/Alt` — a PDF/UA failure, and readers treat `/Figure` as
 * atomic, so an unnamed one wrapping the chart's own named figure can swallow it. The
 * first version of this change added five such structs to a six-chart deck. HTML-AAM
 * already says a figure is named by its figcaption; Chromium does not implement that,
 * so `aria-label` states it explicitly and the PDF gets its `/Alt`.
 */
const CAPTION_CLASS_RE = /\bclass\s*=\s*("[^"]*"|'[^']*')/;

/** Does this opening tag carry `chart-caption` among its classes? Mirrors classList. */
function hasCaptionClass(openTag) {
  const m = openTag.match(CAPTION_CLASS_RE);
  if (!m) return false;
  return m[1].slice(1, -1).split(/\s+/).includes('chart-caption');
}

/**
 * The TOP-LEVEL element children of a body string, as {name, start, end} ranges.
 * Comments are skipped whole — an `<!-- <div> -->` in the body used to be counted as an
 * open tag and threw the depth counter off.
 */
function topLevelChildren(body) {
  const out = [];
  let depth = 0;
  let openStart = -1;
  let openName = '';
  const re = /<!--[\s\S]*?-->|<([a-zA-Z][a-zA-Z0-9-]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/g;
  let m;
  while ((m = re.exec(body))) {
    const [full, name, selfClose, closeName] = m;
    if (full.startsWith('<!--')) continue;
    if (closeName) {
      if (depth > 0) depth -= 1;
      if (depth === 0 && openStart >= 0) {
        out.push({ name: openName, start: openStart, end: m.index + full.length });
        openStart = -1;
      }
      continue;
    }
    const lower = name.toLowerCase();
    if (selfClose || VOID_TAGS.has(lower)) {
      if (depth === 0) out.push({ name: lower, start: m.index, end: m.index + full.length });
      continue;
    }
    if (depth === 0) { openStart = m.index; openName = lower; }
    depth += 1;
  }
  return out;
}

/** Plain text of an HTML fragment, for an `aria-label`. Tags out, entities kept, quotes safe. */
function labelText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace(/"/g, '&quot;');
}

/**
 * Build the stage cell for `body`. Returns the complete `<tag …>body</tag>` string.
 * When the body's FIRST or LAST top-level child is a `<p class="chart-caption">`, that
 * paragraph becomes the `<figcaption>` and the cell becomes a named `<figure>`.
 */
function buildStageCell(body) {
  const kids = topLevelChildren(body);
  if (kids.length >= 2) {
    for (const cap of [kids[kids.length - 1], kids[0]]) {
      if (cap.name !== 'p') continue;
      const openTag = body.slice(cap.start).match(/^<p\b(?:"[^"]*"|'[^']*'|[^>"'])*>/)?.[0];
      if (!openTag || !hasCaptionClass(openTag)) continue;
      const inner = body.slice(cap.start + openTag.length, cap.end - '</p>'.length);
      const attrs = openTag.slice('<p'.length, -1);
      const newBody = body.slice(0, cap.start) +
        `<figcaption${attrs}>${inner}</figcaption>` +
        body.slice(cap.end);
      const label = labelText(inner);
      const named = label ? ` aria-label="${label}"` : '';
      return `<figure class="cell-stage"${named}>${newBody}</figure>`;
    }
  }
  return `<div class="cell-stage">${body}</div>`;
}

// HTML5 void elements never open a nesting level — needed so the top-level
// scan below doesn't miscount depth on a stray <br>/<img> in pre-title prose.
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr',
]);

// Depth-aware scan for the first TOP-LEVEL (direct-child) code-only `<p>` in
// `scope` — mirrors the DOM mirror's `children.slice(0, h2Index).find(isCodeOnlyP)`
// (lib/transformers/masthead-lift.js), which only ever considers direct
// children of the section, never descends into nested content. A code-only
// `<p>` nested inside a `<div>`/`<li>`/etc. is real content, not the eyebrow,
// and must not be hoisted out of its container.
function findTopLevelEyebrow(scope) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(scope))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0 && openName.toLowerCase() === 'p') {
      const pm = scope.slice(m.index).match(/^<p[^>]*>\s*<code[^>]*>[\s\S]*?<\/code>\s*<\/p>/);
      if (pm) return { start: m.index, text: pm[0] };
    }
    depth++;
  }
  return null;
}

// Capture (and remove) the first code-only paragraph — the eyebrow/kicker —
// but ONLY when it precedes the title. Scoped to the substring BEFORE the
// first <h2> so a trailing SUBTITLE (a code-only paragraph AFTER the heading,
// base.docs.md's "Subtitle labels" pattern — see extractSubtitleP below) is
// never misidentified as a leading eyebrow: an unscoped search would find it
// anywhere in the body, reordering it before the heading and mis-styling it
// as the mono-caps kicker instead of the italic subtitle.
function extractEyebrowP(html) {
  const h2Idx = html.search(/<h2[^>]*>/);
  const scope = h2Idx === -1 ? html : html.slice(0, h2Idx);
  const found = findTopLevelEyebrow(scope);
  if (!found) return { el: '', html };
  const scoped = scope.slice(0, found.start) + scope.slice(found.start + found.text.length);
  return { el: found.text, html: scoped + html.slice(scope.length) };
}

// Depth-aware scan for the first TOP-LEVEL (direct-child) `<h2>` in `scope` —
// mirrors findTopLevelEyebrow above and the DOM mirror's `:scope > h2`
// (lib/transformers/masthead-lift.js), which only ever considers a direct child
// of the section, never one nested inside content. A `<h2>` buried inside a
// component's own card/div (e.g. a QR card's `.qr-head > h2`, emitted when a
// canvas component like wifi rebuilds its section before mastheadLift runs) is
// that component's in-card title, NOT the slide's masthead title, and must not
// be yanked into the masthead band. A plain first-`<h2>` regex is depth-blind
// and would lift it — the exact bug the wifi migration hit.
function findTopLevelH2(scope) {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(scope))) {
    const [, openName, selfClose, closeName] = m;
    if (closeName) { if (depth > 0) depth--; continue; }
    if (selfClose || VOID_TAGS.has(openName.toLowerCase())) continue;
    if (depth === 0 && openName.toLowerCase() === 'h2') {
      const hm = scope.slice(m.index).match(/^<h2[^>]*>[\s\S]*?<\/h2>/);
      if (hm) return { start: m.index, text: hm[0] };
    }
    depth++;
  }
  return null;
}

// Capture (and remove) the title <h2>. `topLevelOnly` selects the mode:
//   · true  (DEPTH-AWARE components — a WRAPPED strict/flow component whose body
//     hoists into `.cell-stage`, OR a `chart-frame` canvas whose title nests in
//     `.chart-header`) → depth-aware (findTopLevelH2): a nested in-card/in-header
//     <h2> (a QR card's `.qr-head > h2`, a chart's `.chart-header > h2`) is LEFT
//     in place, so a component that owns its title inside its own structure is
//     never mastheaded. This matches the DOM mirror's `:scope > h2`.
//   · false (other UNWRAPPED canvases — e.g. video, whose title placement has not
//     yet converged onto the model) → legacy depth-blind first-match, preserving
//     their pre-migration masthead band EXACTLY, PENDING the `.viz-frame`-coordinated
//     migration (engineering/decisions/2026-07-15-model-driven-frame-render.md §6).
function extractH2(html, topLevelOnly = true) {
  if (topLevelOnly) {
    const found = findTopLevelH2(html);
    if (!found) return { el: '', html };
    return { el: found.text, html: html.slice(0, found.start) + html.slice(found.start + found.text.length) };
  }
  const m = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/);
  if (!m) return { el: '', html };
  return { el: m[0], html: html.replace(m[0], '') };
}

// Capture (and remove) a SUBTITLE — a code-only paragraph immediately
// following the title (base.docs.md's "Subtitle labels" pattern; styled by
// base.modifiers.css's `section h2 + p:has(> code:only-child)`). Must run
// AFTER extractH2 and be re-seated next to h2 inside masthead-lede — left in
// the flow body it would be separated from its `h2 +` sibling selector by the
// band itself, and (for a STAGE_MIGRATED layout) by the `.cell-stage` wrap.
// Anchored at the start of the string (`^`), i.e. immediately adjacent to
// where the h2 just was — a subtitle further down the body is real content,
// not this chrome.
function extractSubtitleP(html) {
  // Canonical subtitle: a code-only paragraph right after the h2. ALSO lift a chart's
  // plain-text subtitle (`<p class="chart-subtitle">`, emitted top-level by the
  // chart-family transform under .viz-frame) into the band — charts are standard
  // chrome, so their subtitle hoists with eyebrow + title (2026-07-15-viz-frame-merge.md).
  const m = html.match(/^\s*<p[^>]*>\s*<code[^>]*>[\s\S]*?<\/code>\s*<\/p>/)
    || html.match(/^\s*<p class="chart-subtitle">[\s\S]*?<\/p>/);
  if (!m) return { el: '', html };
  return { el: m[0], html: html.slice(m[0].length) };
}

// Capture (and remove) a leading Marp running <header>, preserved before the band.
function extractHeader(html) {
  const m = html.match(/^(\s*<header[^>]*>[\s\S]*?<\/header>\s*)/);
  return m ? { matched: m[1], html: html.slice(m[0].length) } : { matched: '', html };
}

/**
 * Rewrite one section's inner HTML. No-op unless the class opts in, a title
 * is present, and the band hasn't already been built (idempotent).
 */
function transformMastheadSection(innerHtml, cls, pagination = '') {
  if (!hasOptIn(cls)) return innerHtml;
  if (innerHtml.includes('class="cell-masthead"')) return innerHtml;
  if (innerHtml.includes('class="cell-stage"')) return innerHtml; // idempotent

  const { matched: header, html: r0 } = extractHeader(innerHtml);

  // Build the masthead band IF the slide has a liftable title. (math /
  // compare-code drive their own title grid and are chrome-exempt; a titleless
  // prose slide just has no band.) The h2-lift is DEPTH-AWARE for two families:
  //   · a WRAPPED component (`wraps` — strict/flow), whose body hoists into
  //     `.cell-stage`, so a title nested in its own rebuilt card (a QR card's
  //     `.qr-head > h2`) stays put instead of being yanked into an empty band; and
  //   · a `chart-frame` canvas, whose chart-family transform (running BEFORE this)
  //     already nests the eyebrow + title + subtitle together in `.chart-header`.
  //     A nested `.chart-header > h2` returns null from findTopLevelH2, so NO band
  //     is built and the whole header stays intact — converging the engine with the
  //     web/runtime DOM mirror (`:scope > h2`, which never saw the nested h2 and so
  //     never built a band). This also revives the pie/radar claim-hero/claim-bleed
  //     bottom-shelf treatment, which is built on `.chart-header h2` and went dead
  //     on the engine while the h2 was lifted away.
  // Other UNWRAPPED canvases (video) keep the legacy depth-blind lift, PENDING the
  // `.viz-frame`-coordinated migration (2026-07-15-model-driven-frame-render.md §6).
  const wraps = wrapsStageBody(cls);
  const chartFrame = /\bchart-frame\b/.test(cls);
  const depthAware = wraps || chartFrame;
  let band = '';
  let rest = r0;
  const hasTitle = depthAware ? Boolean(findTopLevelH2(r0)) : /<h2[^>]*>/.test(r0);
  if (hasTitle) {
    const { el: eyebrow, html: r1 } = extractEyebrowP(r0);
    const { el: h2, html: r2 } = extractH2(r1, depthAware);
    const { el: subtitle, html: r3 } = OWN_TRAILING_LABEL.test(cls)
      ? { el: '', html: r2 }
      : extractSubtitleP(r2);
    band =
      '<div class="cell-masthead">' +
        // The heading rule is a REAL <hr> element, the last child of the lede flex column, so it
        // aligns with the eyebrow + heading via the cluster's one align-items — no absolutely
        // positioned pseudo to hand-place (and no bay-drift). `rule:` styles it (width/color/
        // visibility); `headline:` positions it. Always emitted after a title; CSS hides it for
        // the default full-width / none rule. See engineering/decisions/2026-07-20-mass-head-alignment.md.
        `<div class="masthead-lede">${eyebrow}${h2}${subtitle}<hr class="masthead-rule"></div>` +
        '<div class="masthead-bay"></div>' +
      '</div>';
    rest = r3;
  }

  // Generic-prose slides: wrap the flow body into a bounded `.cell-stage` cell so
  // it clips at the stage edge, not the slide edge (flex cell-tree §6) — the
  // frame's third cell, built the same way the masthead cell above is built. The
  // stage exists with OR without a masthead band, so a generic slide is always a
  // single shape (one cell), never a wrapped/unwrapped two-world. A trailing Marp
  // running <footer> belongs in the footer band, NOT the clipped stage — split it
  // off and keep it after the cell. Chrome Tiles (meta/progress/watermark/
  // pagination) are inserted by LATER registry transforms as section children, so
  // they land as siblings of the stage, never inside it.
  if (wraps) {
    const fm = rest.match(/(\s*<footer[^>]*>[\s\S]*?<\/footer>\s*)$/);
    const footer = fm ? fm[1].trim() : '';
    const body = fm ? rest.slice(0, rest.length - fm[1].length) : rest;
    // The stage cell — a `<figure>` around a captioned graphic, else a `<div>`. The
    // caption's own retag happens inside, so the two can never ship apart.
    return `${header}${band}${buildStageCell(body)}${buildFooterCell(footer, pagination)}`;
  }

  // Non-generic slide with no title: nothing to lift, leave untouched.
  if (!band) return innerHtml;
  return `${header}${band}${rest}`;
}

/**
 * The footer Cell — the frame's third row (flex cell-tree §6). A real in-flow
 * `<div class="cell-footer">` holding the running `footer:` text and the page
 * number as a REAL element (`<span class="lat-pagination">`), retiring the
 * `section::after` pagination PSEUDO for migrated frames — a page number is
 * content, not decoration, so it should be a real node (the decorative
 * numbered-divider numeral stays a pseudo; it's a different `::after`). The
 * progress rail docks in later (progress.transform.js appends into `.cell-footer`
 * when present). Emitted only when there's footer chrome; an empty footer means
 * the stage simply runs to the slide edge. `pagination` is the section's
 * `data-lattice-pagination` value (already engine-computed; absent ⇒ no number,
 * matching the pseudo's `:not([data-lattice-pagination])` hide).
 */
function buildFooterCell(footerHtml, pagination) {
  const pag = pagination ? `<span class="lat-pagination">${pagination}</span>` : '';
  if (!footerHtml && !pag) return '';
  return `<div class="cell-footer">${footerHtml}${pag}</div>`;
}

/**
 * Walk every <section> in Marpit's rendered HTML and lift the masthead on
 * opted-in slides. Depth-aware </section> scan; non-opted sections pass
 * through unchanged. Mirrors the walker in lib/core/split-panels.js.
 */
function applyToRenderedHtml(html) {
  return mapSections(html, (openTag, cls, inner) => {
    if (!hasOptIn(cls)) return null;
    const pagMatch = openTag.match(/\sdata-lattice-pagination="([^"]*)"/);
    const pagination = pagMatch ? pagMatch[1] : '';
    return transformMastheadSection(inner, cls, pagination);
  });
}

module.exports = {
  OPT_IN,
  hasOptIn,
  OWN_TRAILING_LABEL,
  wrapsStageBody,
  buildStageCell,
  stageSizingFor,
  extractH2,
  STAGE_CATALOG,
  ALL_LAYOUTS,
  STAGE_MIGRATED,
  STAGE_DEFERRED,
  applyToRenderedHtml,
  transformMastheadSection,
};
