/**
 * Marpit / marp-core engine plugins — the markdown-it token transforms and
 * HTML-stage helpers that give Lattice components their structure (verdict-grid
 * badges, checklist state discs, obligation-matrix cells, slot-label bolding,
 * glossary tables, heading-period adjustment, deck-wide
 * class propagation, the `logo:` convenience directive, and functionplot fences).
 *
 * These were originally inlined in the now-retired marp-cli config.
 * They are pure markdown-it/Marpit token manipulators with no Node-only
 * dependencies, so they are extracted here as the SINGLE SOURCE OF TRUTH shared
 * by two consumers:
 *
 *   1. lib/engine            — the owned engine (`.use()`s them on markdown-it).
 *   2. lib/playground/index.js — the browser playground bundle, which runs the
 *                                exact same engine client-side for render parity.
 *
 * Keeping one copy is what prevents the build path and the playground from
 * drifting. The unit suite (test/unit/parsing/markdown-it-plugins.test.js)
 * exercises each plugin on the owned slide pipeline (markdown-it +
 * lib/engine/slides) — no marp-core dependency.
 */

const mermaidLanguage = require('../mermaid/mermaid.hljs');
const { finishClasses } = require('../../core/resolve-finish');
const { applyBackdropToHtml } = require('../../core/backdrop');
// The prose-with-code mark (#2308) — shared with the runtime's DOM mirror.
const proseCode = require('../../core/prose-code');
const {
  stateClassesFor, LEADING_MARKER_RE, LEADING_MARKER_PREFIX_RE,
} = require('../../core/state-marks.js');
const { ROW_LABEL_CLASS, ROW_LABEL_OFF_CLASS, RAW_TABLES_CLASS, resolveRowLabel } = require('../../core/table-row-label.js');
const {
  renderHtml: inlineDirectiveHtml,
  escapedText: inlineEscapedText,
  ESCAPED_ATTR: INLINE_ESCAPED_ATTR,
} = require('../../core/inline-code-directives.js');
const { modeClasses, MODE_TOKENS } = require('../../core/resolve-mode');
const { claimClasses } = require('../../core/resolve-claim');
const { stampClass } = require('../../core/resolve-stamp');
const { toneStyleClass, TONE_STYLE_TOKENS } = require('../../core/resolve-tone-style');
const {
  spectrumClass,
  spectrumEdgeClass,
  spectrumCardClass,
  spectrumCardEdgeClass,
  spectrumTrimClass,
  isSpectrumStyleToken,
  isSpectrumEdgeToken,
  isSpectrumCardToken,
  isSpectrumCardEdgeToken,
  isSpectrumTrimToken,
} = require('../../core/resolve-spectrum');
const { cornersClass, isCornersToken } = require('../../core/resolve-corners');
const { guardsClass, isGuardsToken } = require('../../core/resolve-guards');
const { ruleClass, RULE_TOKENS } = require('../../core/resolve-rule');
const { eyebrowClass, EYEBROW_TOKENS } = require('../../core/resolve-eyebrow');
const { inlineCodeClass, INLINE_CODE_LITERAL } = require('../../core/resolve-inline-code');
const { headlineClass, HEADLINE_TOKENS } = require('../../core/resolve-headline');
const { liftClass } = require('../../core/resolve-lift');
const { cardsClass, CARDS_TOKENS, resolveCardsAlign } = require('../../core/resolve-cards');
const { setAttr } = require('../../core/collections');
const { readAttr } = require('../../core/section-walk');
const { COLOR_MODE_TOKENS: COLOR_MODE_TOKEN_LIST, slidePinEvictsDeckToken } = require('../../core/color-mode');
const { deckColorModeToken } = require('../../core/resolve-color-mode');
const { deckClassTokensFromFrontMatter } = require('../../core/deck-class-register');
const { withDefaultComponent } = require('../../core/resolve-component');
const { resolveSplitMode } = require('../../core/resolve-split');
const { headingSplitPoints } = require('../../core/heading-split-core');
const matrixGridCellKernel = require('../../core/matrix-grid-cells');
const {
  slotLayoutPattern,
  LIST_STEPS_LIFT_VARIANTS: LIST_STEPS_VARIANT_NAMES,
} = require('../../core/slot-label-lift');
const { splitSections, withClass } = require('../../core/split-sections');
const { groupOnSlideRule } = require('../../core/slide-rule');

// UTF-8 base64, shared with the runtime's decoder so the two halves cannot disagree
// (lib/core/base64-utf8.js). Packs the functionplot and anima fence payloads into a
// data- attribute.
const { toBase64 } = require('../../core/base64-utf8');

/**
 * markdown-it plugin: the deck-wide `split: headings` slide divider. When the deck's
 * front matter selects `split: headings` (lib/core/resolve-split.js), inject a
 * top-level `hr` token before every h1/h2 that is the SECOND-or-later heading in
 * its slide, so the downstream slide splitter (the owned engine's `lattice_slide`
 * ruler in lib/engine/slides.js `splitOnHr`, which splits on top-level `hr`)
 * starts a new slide there. Runs `.before('lattice_slide')` so both render paths
 * observe the injected breaks identically (HARD RULE #1).
 *
 * Eyebrow-aware by construction: the FIRST heading in a slide never injects a
 * break, so lead content above a title (an eyebrow tag, a `<!-- _class -->`
 * comment, a kicker line) stays attached to that heading's slide instead of
 * orphaning into a titleless slide — the failure mode marp-core's native
 * `headingDivider` has, which is why we don't use it. An author-written `---`
 * (a top-level `hr` already in the stream) resets the per-slide heading state,
 * so `split: headings` is HYBRID: `##` AND `---` both start slides.
 *
 * Headings inside fenced code are `fence`/`code_block` tokens, never
 * `heading_open`, so the split is fence-safe for free. Only top-level headings
 * (token.level === 0) divide; an h1/h2 nested in a blockquote or list does not.
 *
 * PULL-BACK: a slide's "lead-in" — its per-slide `<!-- _key -->` directive
 * comments and its eyebrow (a paragraph that is only inline `code`) — is written
 * ABOVE the heading in source (that's how the eyebrow renders above the title).
 * So the break is inserted before that lead-in run, not before the bare heading,
 * or the directive + eyebrow would orphan onto the PREVIOUS slide. The pull-back
 * only ever fires on a slide's 2nd+ heading, so it never disturbs a `---`-split
 * deck (every such slide's heading is its first), keeping both modes
 * slide-count-identical on the committed corpus.
 */
function headingSplit(markdown) {
  markdown.core.ruler.before('lattice_slide', 'lattice_heading_split', (state) => {
    if (state.inlineMode) return;
    const src = (state.env && (state.env.markdown || state.env.source)) || state.src || '';
    if (resolveSplitMode(src) !== 'headings') return;

    // Shared boundary computation (lib/core/heading-split-core.js) — the SAME
    // points the Export-to-Marp baker materializes as `---`, so they can't drift.
    const points = new Set(headingSplitPoints(state.tokens));
    if (!points.size) return;
    const out = [];
    for (let i = 0; i < state.tokens.length; i++) {
      if (points.has(i)) {
        const hr = new state.Token('hr', 'hr', 0);
        hr.markup = '---';
        hr.block = true;
        out.push(hr);
      }
      out.push(state.tokens[i]);
    }
    state.tokens = out;
  });
}

// Deep-ish clone of a markdown-it Token so an expanded slide's copies own
// independent tokens — critical because `lattice_directives` consumes directive
// comments in place (sets content=''/type='text'); sharing them would apply
// `_class` / `_footer` to the first copy only.
function cloneToken(state, t) {
  const c = new state.Token(t.type, t.tag, t.nesting);
  c.attrs = t.attrs ? t.attrs.map((a) => a.slice()) : t.attrs;
  c.map = t.map ? t.map.slice() : t.map;
  c.level = t.level;
  c.children = t.children ? t.children.map((ch) => cloneToken(state, ch)) : t.children;
  c.content = t.content;
  c.markup = t.markup;
  c.info = t.info;
  c.meta = t.meta;
  c.block = t.block;
  c.hidden = t.hidden;
  return c;
}

const FOCUS_STEPS_RE = /<!--\s*_?focusSteps\s*:\s*([\s\S]*?)-->/;

/**
 * markdown-it plugin: `_focusSteps` progressive expansion. One authored slide
 * with `<!-- _focusSteps: row 1 | row 2 | row 3 -->` expands into N rendered
 * slides, each carrying `<!-- _focus: <step> -->` — the static-format (PDF/PPTX)
 * equivalent of a live build (engineering/decisions/2026-06-16-focus-
 * highlighting.md §4; replace semantics — the focus moves, one thing at a time).
 *
 * Runs `.before('lattice_slide')`, so it operates on the flat token stream with
 * `hr` slide boundaries already present (author `---` parse to `hr`; the
 * heading-split divider injects them). It groups on `hr`, and for any slide
 * whose stream carries a `_focusSteps` comment, emits one CLONED copy of the
 * slide per step (separated by fresh `hr`), rewriting that comment to the step's
 * `_focus`. The normal pipeline then splits, counts, and paginates the copies as
 * ordinary slides — no special casing in pagination or the PPTX one-image-per-
 * slide path. Shared kernel, so both render paths expand identically (HARD RULE 1).
 */
function focusSteps(markdown) {
  markdown.core.ruler.before('lattice_slide', 'lattice_focus_steps', (state) => {
    if (state.inlineMode) return;
    const hasSteps = state.tokens.some(
      (t) => (t.type === 'html_block' || t.type === 'html_inline') && FOCUS_STEPS_RE.test(t.content || ''),
    );
    if (!hasSteps) return;

    // Group the flat stream on the SLIDE RULE — a top-level `hr` — through the
    // shared predicate the engine's `splitOnHr` uses (lib/core/slide-rule.js).
    // This used to test `t.type === 'hr'` alone, so a `---` nested inside a
    // blockquote or a list item counted as a slide boundary: a `_focusSteps`
    // slide containing one expanded into a section too many, and every consumer
    // that indexes sections (pagination, the PPTX one-image-per-slide path, the
    // source-side band reconstruction) inherited the off-by-one (#1387).
    const groups = groupOnSlideRule(state.tokens);

    const out = [];
    let first = true;
    const pushHr = () => {
      if (first) { first = false; return; }
      const hr = new state.Token('hr', 'hr', 0);
      hr.markup = '---';
      hr.block = true;
      out.push(hr);
    };
    for (const group of groups) {
      const at = group.findIndex(
        (t) => (t.type === 'html_block' || t.type === 'html_inline') && FOCUS_STEPS_RE.test(t.content || ''),
      );
      const steps = at < 0 ? [] : FOCUS_STEPS_RE.exec(group[at].content)[1].split('|').map((s) => s.trim()).filter(Boolean);
      if (steps.length === 0) {
        pushHr();
        out.push(...group);
        continue;
      }
      for (const step of steps) {
        pushHr();
        group.forEach((t, i) => {
          const copy = cloneToken(state, t);
          if (i === at) copy.content = `<!-- _focus: ${step} -->\n`;
          out.push(copy);
        });
      }
    }
    state.tokens = out;
  });
}

/**
 * markdown-it plugin: deck-wide `class:` + `finish:` propagation. Marpit's native
 * directive spec is "spot replaces global" — a slide with `<!-- _class: foo -->`
 * discards the deck-wide `class:` value. This reads the front-matter `class:`
 * line and APPENDS any token not already present, so `class: dark` +
 * `_class: title` becomes `class="title dark"`.
 *
 * APPEND-ONLY, and that is a design constraint rather than an implementation
 * detail: the deck-wide register is sanitized where it is READ
 * (lib/core/deck-class-register.js), so nothing illegal is ever stamped and this
 * rule never has to take a token back. It cannot: a spot `_class:` REPLACES the
 * running global rather than merging with it, so by the time a section carries a
 * class list, a token the deck wrote and the same token the slide wrote are
 * indistinguishable. Removing by value therefore deletes the slide's own.
 *
 * The custom `finish:` (backdrop)
 * and `mode:` (rendering mode — boardroom/sketch) registers, which Marpit has
 * no native key for, are each mapped to their class tokens (lib/core/resolve-finish.js,
 * resolve-mode.js) and appended the same way, so `mode: sketch` + `finish: atrium`
 * reach every section even ones carrying their own `_class:`.
 */
function deckClassPropagate(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'deck_class_propagate', (state) => {
    const src = (state.env && (state.env.markdown || state.env.source)) || state.src || '';
    const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!fmMatch) return;
    // The deck-wide `class:` register, SANITIZED AT THE BOUNDARY — a color-axis
    // token superseded by `color-mode:`, or a component name (which would make
    // every slide a `kpi` slide), never reaches a section. See
    // lib/core/deck-class-register.js for why this is a filter and not a strip.
    const classTokens = deckClassTokensFromFrontMatter(fmMatch[1]);
    const colorModeToken = deckColorModeToken(fmMatch[1]);
    const colorModeTokens = colorModeToken ? [colorModeToken] : [];
    // Through the shared reader, NOT a private pattern. These two re-read `finish:` and
    // `mode:` rather than calling their kernels, and both carried the `$`-anchored shape —
    // so an annotated `finish: atrium  # for review` produced no finish class HERE while
    // `readFrontMatterFinish` read it fine. Three readers of one key across the two render
    // paths and the kernel, which is HARD RULE #1's whole subject.
    const finishTokens = finishClasses(frontMatterName(fmMatch[1], 'finish') || '').split(/\s+/).filter(Boolean);
    const modeTokens = modeClasses(frontMatterName(fmMatch[1], 'mode') || '').split(/\s+/).filter(Boolean);
    // Deck-wide `claim:` (framed | quiet | hero | bleed) → one `claim-<value>`
    // token, stamped on every eligible slide like class/finish/mode. `framed`
    // and any unknown value map to no token (the standard-frame baseline).
    const claimTokens = claimClasses(frontMatterName(fmMatch[1], 'claim') || '').split(/\s+/).filter(Boolean);
    // Deck-wide STAMP style (`stamp: seal` → stamp-seal) + TONE style (`tone: edge`
    // → tone-edge) — a single class token each, appended like finish/mode, overridden
    // per-slide (below). See lib/core/resolve-stamp.js / resolve-tone-style.js.
    const stampName = frontMatterName(fmMatch[1], 'stamp') || '';
    const stampTokens = stampClass(stampName) ? [stampClass(stampName)] : [];
    const toneStyleName = frontMatterName(fmMatch[1], 'tone') || '';
    const toneStyleTokens = toneStyleClass(toneStyleName) ? [toneStyleClass(toneStyleName)] : [];
    // Deck-wide SPECTRUM register (`spectrum: off | solid` → spectrum-off / spectrum-solid)
    // — the white-label brand-bar control, appended like the others, overridden per-slide.
    // `on`/unknown map to no token (the rainbow baseline). See lib/core/resolve-spectrum.js.
    const spectrumName = frontMatterName(fmMatch[1], 'spectrum') || '';
    const spectrumTokens = spectrumClass(spectrumName) ? [spectrumClass(spectrumName)] : [];
    // Deck-wide SPECTRUM EDGE placement (`spectrum-edge: left|right|bottom|off` →
    // spectrum-edge-<value>) — moves/removes ONLY the section-edge bar. `top`/unknown map
    // to no token (the top-bar default). See lib/core/resolve-spectrum.js.
    const spectrumEdgeName = frontMatterName(fmMatch[1], 'spectrum-edge') || '';
    const spectrumEdgeTokens = spectrumEdgeClass(spectrumEdgeName) ? [spectrumEdgeClass(spectrumEdgeName)] : [];
    // Deck-wide SPECTRUM CARD STYLE (`spectrum-card: auto|solid|duo|mono|rainbow` →
    // spectrum-card[-<value>]) — the card rail's gradient, independent of the section bar.
    // `off`/unknown map to no token (the default). And CARD EDGE (`spectrum-card-edge:
    // top|right|bottom` → spectrum-card-edge-<value>) — the rail's placement (left default).
    // Per-slide `_class: spectrum-card-*` / `spectrum-card-edge-*` overrides each axis. See
    // lib/core/resolve-spectrum.js.
    const spectrumCardName = frontMatterName(fmMatch[1], 'spectrum-card') || '';
    const spectrumCardTokens = spectrumCardClass(spectrumCardName) ? [spectrumCardClass(spectrumCardName)] : [];
    const spectrumCardEdgeName = frontMatterName(fmMatch[1], 'spectrum-card-edge') || '';
    const spectrumCardEdgeTokens = spectrumCardEdgeClass(spectrumCardEdgeName) ? [spectrumCardEdgeClass(spectrumCardEdgeName)] : [];
    // Deck-wide SPECTRUM TRIM toggle (`spectrum-trim: on` → spectrum-trim) — the opt-in that
    // flows the deck's spectrum onto the structural accents (table rails, code strips, timeline
    // spine, hr). `off`/unknown map to no token (the quiet default). Per-slide `_class:
    // spectrum-trim` / `spectrum-trim-off` overrides. See lib/core/resolve-spectrum.js.
    const spectrumTrimName = frontMatterName(fmMatch[1], 'spectrum-trim') || '';
    const spectrumTrimTokens = spectrumTrimClass(spectrumTrimName) ? [spectrumTrimClass(spectrumTrimName)] : [];
    // Deck-wide CORNERS register (`corners: rounded` → corners-rounded) — whether the
    // slide's own surface is rounded. `square`/unknown map to no token, which is the
    // baseline every deck rendered at before the register existed. Per-slide `_class:
    // corners-square` opts one slide back out. See lib/core/resolve-corners.js.
    const cornersName = frontMatterName(fmMatch[1], 'corners') || '';
    const cornersTokens = cornersClass(cornersName) ? [cornersClass(cornersName)] : [];
    // Deck-wide GUARDS register (`guards: strict` → guards-strict) — whether TRIM may
    // cut text that does not fit. `loose`/unknown map to no token, which is the
    // baseline every deck rendered at before the register existed. Per-slide `_class:
    // guards-loose` opts one slide back out. See lib/core/resolve-guards.js.
    const guardsName = frontMatterName(fmMatch[1], 'guards') || '';
    const guardsTokens = guardsClass(guardsName) ? [guardsClass(guardsName)] : [];
    // Deck-wide HEADING RULE (`rule: full|short|accent|none` → rule-<value>) and EYEBROW
    // (`eyebrow: dot|bar|arrow|underline` → eyebrow-<value>) accent finishes — one class token
    // each, appended like the others, overridden per-slide. The default value (auto/plain)
    // maps to no token, so today's render is unchanged. See lib/core/resolve-rule.js /
    // resolve-eyebrow.js.
    const ruleName = frontMatterName(fmMatch[1], 'rule') || '';
    const ruleTokens = ruleClass(ruleName) ? [ruleClass(ruleName)] : [];
    const eyebrowName = frontMatterName(fmMatch[1], 'eyebrow') || '';
    const eyebrowTokens = eyebrowClass(eyebrowName) ? [eyebrowClass(eyebrowName)] : [];
    // Deck-wide INLINE-CODE register (`inline-code: literal` → inline-code-literal) — whether
    // the inline directive grammar runs at all. `rich` (default) and unknown map to no token,
    // so today's render is unchanged. The token is what the RUNTIME gates on, which is why it
    // has to reach the section rather than staying a front-matter fact: it is the only signal
    // present on all three render paths. Per-slide `_class: inline-code-literal` opts one slide
    // out. See lib/core/resolve-inline-code.js.
    const inlineCodeName = frontMatterName(fmMatch[1], 'inline-code') || '';
    const inlineCodeTokens = inlineCodeClass(inlineCodeName) ? [inlineCodeClass(inlineCodeName)] : [];
    // Deck-wide HEADLINE ALIGNMENT (`headline: left|center|right` → head-<value>) — the
    // horizontal alignment of the framing-text cluster; one token, overridden per-slide.
    // `auto` (default) → no token, so the component keeps its baked alignment. See
    // lib/core/resolve-headline.js.
    const headlineName = frontMatterName(fmMatch[1], 'headline') || '';
    const headlineTokens = headlineClass(headlineName) ? [headlineClass(headlineName)] : [];
    // Deck-wide LIFT toggle (`lift: on` → `lifted`) — the opt-in card elevation,
    // appended like the others, overridden per-slide (`_class: lifted`/`flat`). See
    // lib/core/resolve-lift.js. `off`/unknown map to no token (the flat default).
    const liftName = frontMatterName(fmMatch[1], 'lift') || '';
    const liftTokens = liftClass(liftName) ? [liftClass(liftName)] : [];
    // Deck-wide CARD-ROW alignment (`cards: center|stretch|top|spread` → `cards-*`), where a
    // card row puts the height it does not need, overridden per-slide (`_class: cards-*`).
    // ALL FOUR values stamp a token; the default is the ABSENCE of the key, and it lives in
    // the component's manifest rather than among the values. An unknown value stamps nothing
    // and deck-lint flags it. See lib/core/resolve-cards.js.
    const cardsName = frontMatterName(fmMatch[1], 'cards') || '';
    const cardsTokens = cardsClass(cardsName) ? [cardsClass(cardsName)] : [];
    const deckTokens = [...classTokens, ...colorModeTokens, ...finishTokens, ...modeTokens, ...claimTokens, ...stampTokens, ...toneStyleTokens, ...spectrumTokens, ...spectrumEdgeTokens, ...spectrumCardTokens, ...spectrumCardEdgeTokens, ...spectrumTrimTokens, ...cornersTokens, ...guardsTokens, ...ruleTokens, ...eyebrowTokens, ...inlineCodeTokens, ...headlineTokens, ...liftTokens, ...cardsTokens];
    // PURELY ADDITIVE — this rule appends and never removes. The engine's native
    // directive handling stamps the deck-wide `class:` before this runs, and it
    // reads the SAME sanitized register (lib/engine/index.js seeds `globalBase`
    // through the kernel), so there is nothing here left to subtract. Removing by
    // value is what deleted a slide's own tokens: by the time a class list exists,
    // the deck's `dark` and the slide's `dark` are one string on one section.
    if (!deckTokens.length) return;
    // The suppression set is the deck's mode tokens from EITHER spelling, read off
    // `deckTokens` because that list already unions them (and, in the runtime, is the only
    // one the cached config carries — deriving from `classTokens` there referenced a
    // variable from a different function and threw at bootstrap). `modeTokens`
    // holds what `mode:` stamped; a legacy deck-wide `class: sketch` puts the same token
    // in the deck's plain class list, and leaving it out meant a per-slide opt-out took the
    // slide out everywhere EXCEPT the CSS — the section kept `sketch`, so it still wore the
    // hand face while `resolveDiagramLook` / `resolveDiagramHandType` (which read the
    // slide's own tokens) said boardroom. `mode: sketch` evicted correctly and the legacy
    // spelling did not, which is how the asymmetry stayed invisible: nothing in the corpus
    // pairs a legacy `class:` deck with a per-slide mode opt-out. Surfaced by #1674's
    // export-vs-cascade font gate (test/integration/mermaid/diagram-font-parity.test.js).
    const modeSet = new Set(deckTokens.filter((t) => MODE_TOKENS.includes(t)));
    const toneStyleSet = new Set(TONE_STYLE_TOKENS);
    const colorModeSet = new Set(COLOR_MODE_TOKEN_LIST);

    for (const token of state.tokens) {
      if (token.type !== 'lattice_slide_open') continue;
      const cur = (token.attrGet('class') || '').split(/\s+/).filter(Boolean);
      // A per-slide finish overrides the deck-wide one: if this slide already
      // carries its OWN `finish-*` preset (or the `finish-none` opt-out), do not
      // also append the deck's `finish-*` preset token — both presets stacking
      // would composite two finishes on one slide. The base `finish` token and
      // any non-finish deck class still propagate. (Mirrors lib/runtime/index.js.)
      const slideHasOwnFinish = cur.some((c) => c.startsWith('finish-') || c === 'finish-none');
      // Likewise for `mode:` — a slide with its OWN mode token (sketch, or the
      // `boardroom` clean opt-out) is not overwritten by the deck-wide mode.
      const slideHasOwnMode = cur.some((c) => MODE_TOKENS.includes(c));
      // A per-slide `claim-*` preset wins over the deck-wide claim (two claim
      // presets stacking would composite on one slide). Mirrors finish/mode.
      const slideHasOwnClaim = cur.some((c) => c.startsWith('claim-'));
      // A per-slide stamp/tone STYLE token overrides the deck-wide one.
      const slideHasOwnStamp = cur.some((c) => c.startsWith('stamp-'));
      const slideHasOwnToneStyle = cur.some((c) => toneStyleSet.has(c));
      // A per-slide spectrum STYLE token (`spectrum-solid` … `spectrum-off`) overrides the
      // deck-wide STYLE; a per-slide EDGE token (`spectrum-edge-*`) overrides the deck-wide
      // EDGE. The two are independent registers, so they are guarded separately — an edge
      // token must NOT suppress the deck's style token, and vice-versa.
      const slideHasOwnSpectrumStyle = cur.some((c) => isSpectrumStyleToken(c));
      const slideHasOwnSpectrumEdge = cur.some((c) => isSpectrumEdgeToken(c));
      // A per-slide spectrum-card STYLE token (`spectrum-card` … `spectrum-card-off`) wins over
      // the deck-wide CARD STYLE; a per-slide CARD EDGE token (`spectrum-card-edge-*`) wins over
      // the deck-wide CARD EDGE. Independent axes, guarded separately (like STYLE vs EDGE).
      const slideHasOwnSpectrumCard = cur.some((c) => isSpectrumCardToken(c));
      const slideHasOwnSpectrumCardEdge = cur.some((c) => isSpectrumCardEdgeToken(c));
      // A per-slide spectrum-trim token (`spectrum-trim` in / `spectrum-trim-off` out) wins over
      // the deck-wide `spectrum-trim: on`.
      const slideHasOwnSpectrumTrim = cur.some((c) => isSpectrumTrimToken(c));
      // A per-slide corners token (`corners-rounded` in / `corners-square` out) wins over
      // the deck-wide `corners: rounded`. Both rules land at the same specificity, so
      // without this eviction the deck token would sit beside the slide's and CSS source
      // order — not the author — would decide the corner.
      const slideHasOwnCorners = cur.some((c) => isCornersToken(c));
      // A per-slide guards token (`guards-strict` in / `guards-loose` out) wins over the
      // deck-wide `guards: strict`. The eviction matters more here than for a cosmetic
      // register: without it a slide asking to keep its full text could still be trimmed.
      const slideHasOwnGuards = cur.some((c) => isGuardsToken(c));
      // A per-slide `rule-*` / `eyebrow-*` accent token overrides the deck-wide one.
      const slideHasOwnRule = cur.some((c) => RULE_TOKENS.includes(c));
      const slideHasOwnEyebrow = cur.some((c) => EYEBROW_TOKENS.includes(c));
      // A per-slide `head-*` alignment token overrides the deck-wide one.
      const slideHasOwnHeadline = cur.some((c) => HEADLINE_TOKENS.includes(c));
      // A per-slide lift choice (`lifted` in, `flat` out) wins over the deck-wide
      // `lift: on` — so `_class: flat` drops a slide out of a lifted deck.
      const slideHasOwnLift = cur.some((c) => c === 'lifted' || c === 'flat');
      // A per-slide `cards-*` choice wins over the deck-wide `cards:` — including
      // `cards-stretch`, which is how one slide opts back out of a deck-wide value.
      const slideHasOwnCards = cur.some((c) => CARDS_TOKENS.includes(c));
      // A per-slide COLOR-MODE token (`dark` / `light`) wins over the deck-wide
      // color mode — so a bright slide (`_class: light`) inside a dark deck
      // (`class: dark`) stays light, and vice-versa. Without this, the deck-wide
      // token would be appended alongside, producing a `dark light` conflict.
      const slideHasOwnColorMode = cur.some((c) => colorModeSet.has(c));
      // A per-slide `insight-*` callout-label token wins over a deck-wide one —
      // both rules share specificity (0,1,1), so without this the deck token,
      // appended alongside, would resolve by CSS source order (arbitrary) rather
      // than author intent. Drop the deck token when the slide names its own.
      const slideHasOwnInsight = cur.some((c) => c.startsWith('insight-'));
      for (const t of deckTokens) {
        if (slideHasOwnFinish && t.startsWith('finish-')) continue;
        if (slideHasOwnMode && modeSet.has(t)) continue;
        if (slideHasOwnClaim && t.startsWith('claim-')) continue;
        if (slideHasOwnStamp && t.startsWith('stamp-')) continue;
        if (slideHasOwnToneStyle && toneStyleSet.has(t)) continue;
        if (slideHasOwnSpectrumStyle && isSpectrumStyleToken(t)) continue;
        if (slideHasOwnSpectrumEdge && isSpectrumEdgeToken(t)) continue;
        if (slideHasOwnSpectrumCard && isSpectrumCardToken(t)) continue;
        if (slideHasOwnSpectrumCardEdge && isSpectrumCardEdgeToken(t)) continue;
        if (slideHasOwnSpectrumTrim && isSpectrumTrimToken(t)) continue;
        if (slideHasOwnCorners && isCornersToken(t)) continue;
        if (slideHasOwnGuards && isGuardsToken(t)) continue;
        if (slideHasOwnRule && RULE_TOKENS.includes(t)) continue;
        if (slideHasOwnEyebrow && EYEBROW_TOKENS.includes(t)) continue;
        if (slideHasOwnHeadline && HEADLINE_TOKENS.includes(t)) continue;
        if (slideHasOwnLift && t === 'lifted') continue;
        if (slideHasOwnCards && CARDS_TOKENS.includes(t)) continue;
        // `print` survives a slide's own scheme pin — see slidePinEvictsDeckToken.
        if (slideHasOwnColorMode && slidePinEvictsDeckToken(t)) continue;
        if (slideHasOwnInsight && t.startsWith('insight-')) continue;
        if (!cur.includes(t)) cur.push(t);
      }
      token.attrSet('class', cur.join(' '));
    }
  });

  /**
   * CARD-ROW composition — its own pass, because it must run for EVERY deck, and the
   * deck-token pass above returns early when a deck contributes no tokens of its own
   * (`if (!deckTokens.length) return`). A component's declared default has to land on a
   * deck whose front matter says nothing at all — that is the common case.
   *
   * PUSHED to the end of the core chain rather than anchored after a named rule, so the
   * class list is final whatever else is registered: the component name is settled (the
   * default-component pass lives in a LATER plugin function, so `ruler.after` on it throws
   * "Parser rule not found" at load time) and any `cards-*` token, deck-wide or per-slide,
   * is already in place with slide-over-deck resolved.
   */
  markdown.core.ruler.push('cards_align_stamp', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'lattice_slide_open') continue;
      stampCardsAlign(token, (token.attrGet('class') || '').split(/\s+/).filter(Boolean));
    }
  });
}

/**
 * CARD-ROW composition — the COMPONENT declares it (manifest `cards`, baked into
 * cards-catalog.generated.js) and the engine resolves it against whatever the author asked
 * for. Stamped as `data-cards`; base.tokens.css turns that into `--cards-align`, which each
 * card row reads in ONE declaration. An ungoverned component resolves to null and is not
 * stamped at all, so nothing about it changes.
 *
 * The CODA arm cannot be settled here — the `.cell-coda` cell is built later in the
 * pipeline and a token stream cannot see it — so the manifest's `withCoda` value rides
 * along as `data-cards-coda`, and base CSS applies it under `:has(> .cell-coda)` — the same
 * direct-child contract `lib/core/coda.js` builds to. (`coda.css` keys on that cell too, but
 * always with a dock qualifier, so it is the CONTRACT these rules share, not a selector.) The
 * VALUE stays the manifest's; only the test for the shape is CSS's. Shared with the runtime
 * through lib/core/resolve-cards.js (#1).
 */
function stampCardsAlign(token, classes) {
  const family = token.attrGet('data-family');
  const resolved = resolveCardsAlign({ classes, family });
  if (!resolved) return;
  token.attrSet('data-cards', resolved);
  const withCoda = resolveCardsAlign({ classes, family, hasCoda: true });
  if (withCoda && withCoda !== resolved) token.attrSet('data-cards-coda', withCoda);
}

/**
 * markdown-it plugin: the DEFAULT COMPONENT. A section whose resolved class list
 * names no component gets `content`, the catch-all prose layout — so a slide
 * written without a `<!-- _class: -->` directive renders as a Lattice slide
 * instead of unstyled markdown (#1292). See lib/core/resolve-component.js for
 * why the rule keys on the RESOLVED list rather than on the directive's presence.
 *
 * Ordered AFTER `deck_class_propagate` deliberately, so the rule reads a class
 * list every deck-wide register has already contributed to. Unlike propagation,
 * this rule has nothing to read from front matter, so it runs unconditionally —
 * a deck with no front matter at all is exactly the case it exists for.
 */
function defaultComponent(markdown) {
  markdown.core.ruler.after('deck_class_propagate', 'lattice_default_component', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'lattice_slide_open') continue;
      const cur = (token.attrGet('class') || '').split(/\s+/).filter(Boolean);
      const next = withDefaultComponent(cur);
      if (next !== cur) token.attrSet('class', next.join(' '));
    }
  });
}

/**
 * Front-matter reader for the convenience `logo:` directive. Returns
 * `{ logo, style, on, brand }` or `null` when no logo is configured.
 */
function readDeckLogoFrontMatter(src) {
  if (typeof src !== 'string' || !src.length) return null;
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];
  // A built-in NAME (`logo: lattice`) becomes a data URI here, so every render path
  // that reads this config gets a mark that resolves on any surface — see
  // lib/core/logo-builtins.js for why a path cannot.
  const logo = resolveLogoRef(frontMatterValue(fm, 'logo'));
  if (!logo) return null;
  const style = (frontMatterValue(fm, 'logo-style') || 'auto').toLowerCase();
  const on = (frontMatterValue(fm, 'logo-on') || 'all').toLowerCase();
  // Optional placement/size — logo-x/logo-y (0–100, the logo CENTER as a % of the
  // slide) and logo-scale (a multiplier, 1 = default). Only finite numbers survive,
  // so a crafted value can't inject into the emitted inline style.
  const num = (re) => {
    const m = fm.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return {
    logo,
    style,
    on: on === 'title' ? 'title' : 'all',
    brand: style === 'brand',
    x: num(/^[ \t]*logo-x:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m),
    y: num(/^[ \t]*logo-y:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m),
    scale: num(/^[ \t]*logo-scale:[ \t]*["']?(-?[\d.]+)["']?[ \t]*$/m),
  };
}

/** The `--logo-*` placement declarations for a logo config, as a bare style payload
 *  (no attribute wrapper), or '' when it's the default top-right corner at default
 *  size. Shared by every render path so placement is identical. Only clamped numbers
 *  are interpolated (no raw front-matter text).
 *
 *  These land on the SECTION rather than on the `<img>`, and that is load-bearing
 *  rather than tidiness: custom properties inherit DOWNWARD only, so while they sat
 *  in the img's own `style` attribute no sibling and no section-level rule could read
 *  them — which is exactly why the marker stack could not see the logo it was
 *  colliding with (#1404). The img reads them by inheritance, unchanged. */
/** The placement declarations as `[property, value]` pairs — the ONE source both render
 *  paths resolve, so the clamps and the both-axes rule cannot drift between them
 *  (HARD RULE #1). The string path joins these into a style attribute; the runtime feeds
 *  them to `setProperty`. Before this they were two hand-kept copies agreeing by
 *  inspection, with nothing that fails when one changes — and the docs asserted the
 *  invariant the code did not enforce. (HARD RULE #25 checker.) */
function deckLogoPlacement(cfg) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const out = [];
  if (cfg.scale != null) out.push(['--logo-scale', String(clamp(cfg.scale, 0.2, 3))]);
  // Positioning needs BOTH axes (a lone axis would half-shift off the default corner).
  if (cfg.x != null && cfg.y != null) {
    out.push(
      ['--logo-x', `${clamp(cfg.x, 0, 100)}%`],
      ['--logo-y', `${clamp(cfg.y, 0, 100)}%`],
      ['--logo-anchor-right', 'auto'],
      ['--logo-nudge', 'translate(-50%, -50%)'],
    );
  }
  return out;
}

function deckLogoVars(cfg) {
  const parts = deckLogoPlacement(cfg).map(([k, v]) => `${k}:${v}`);
  // TERMINATED. `applyRails` (lib/core/auto-split.js) appends into an existing style with no
  // separator of its own, so an unterminated payload fuses with whatever follows —
  // `--logo-nudge:translate(-50%, -50%)--lat-split-offset:2;` makes BOTH declarations invalid
  // (the logo jumps by half its own size, the split counter restarts). Not reachable today
  // only because the directive mirror always writes a trailing `;` before this runs, which is
  // a fact about a different file. (HARD RULE #25 red team.)
  return parts.length ? `${parts.join(';')};` : '';
}

/**
 * A section that already carries the deck logo — the idempotency guard.
 *
 * POSITION-INDEPENDENT AND TOKEN-AWARE, deliberately, because the first draft of this
 * guard was neither and that shipped a duplicate. It anchored on the logo being the
 * section's FIRST child; `applyBackdropToHtml` prepends the `.backdrop` wrapper ahead
 * of it on every `finish` slide, so a second pass over the same document saw a
 * backdrop first, missed the mark that was plainly there, and injected another one —
 * two stacked logos at ~0.70 composite opacity on three of the six committed decks
 * that use `logo:`. Matching a class TOKEN rather than a `class="deck-logo…` prefix
 * closes the same hole from the other side (`class="brand deck-logo"`).
 *
 * It matches anywhere inside the section rather than only among its direct children —
 * the string stage has no cheap notion of "direct child", and `deck-logo` is
 * engine-owned chrome, so an author `<img>` deep in slide content carrying that exact
 * class is not a case worth splitting the guard for. Erring toward "already has one"
 * loses a mark on a pathological deck; erring the other way stacks marks on a real one.
 */
const HAS_DECK_LOGO_RE = /<img\b[^>]*\sclass="[^"]*\bdeck-logo\b[^"]*"/;

/**
 * HTML-stage helper: the convenience `logo:` front-matter directive. Injects
 * `<img class="deck-logo" …>` as the first child of every selected `<section>`.
 *
 * SLIDES ARE FOUND WITH THE SHARED WALKER, NOT `data-lattice-slide`. This used to
 * match `<section …data-lattice-slide="…">`, an attribute the OWNED engine
 * (`lib/engine`) never writes — so on the canonical render path this whole function
 * was dead code, and `logo:` produced nothing at all. The Studio, the playground and
 * every other browser surface render through that path and have no `.md` URL for the
 * runtime's DOM mirror to fetch its front matter from, so a deck with `logo:` showed
 * NO logo there for any value — an external `https:` URL, a site-relative path and a
 * `data:` URI alike (#1652). The reported symptom was "external URLs don't work"; the
 * defect was that no logo was ever injected. Only the export route hid it, because
 * there the runtime resolves the BAKED front-matter block and injects into the DOM.
 *
 * `splitSections` is the same depth-aware walker `fit-berth`, the progress Tile and
 * the watermark Tile use at this exact pipeline stage, and it finds the engine's
 * sections and Marp's alike — so one implementation now serves every render path
 * (HARD RULE #1) instead of one that silently served only the one that re-tags.
 *
 * Idempotent: a section whose first child is already a `.deck-logo` is left alone, so
 * the runtime's DOM mirror (which re-injects on every transform pass, and skips a
 * section that has one) and a re-processed engine document both converge.
 *
 * `deckOffset` IS THE SLIDE'S POSITION IN THE DECK, and `logo-on: title` is the only
 * reason it exists. That rule selects the deck's FIRST slide, and this function has
 * only ever had the document in front of it to decide firstness with — which is right
 * for a whole-deck render and wrong for every SLICE. Render slide 7 alone and its one
 * section is the document's first, so the logo is painted on a slide the deck does not
 * carry it on: the preview shows a mark the export will not. The slice-equivalence
 * sweep found this as 25 of its 27 unattributed residuals across `finish-backdrops.md`
 * — the whole deck, every non-title slide — and it is what an unnamed residual bucket
 * costs (#1442). A caller that supplies a position (the Studio's slice route, via the
 * engine's `page.offset`) therefore gets firstness from the DECK; every caller that
 * supplies none is a whole-deck render and keeps the document reading, which is the
 * same one. Mirrors `svgA11yNames.applyToHtml(html, page?.offset)` two calls below it.
 */
function applyDeckLogoToHtml(html, markdown, deckOffset) {
  const cfg = readDeckLogoFrontMatter(markdown);
  if (!cfg) return html;
  const pieces = splitSections(String(html ?? ''));
  if (!pieces.some((p) => p.type === 'section')) return html;
  const htmlEscape = (s) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSrc = htmlEscape(cfg.logo);
  const classes = `deck-logo${cfg.brand ? ' deck-logo-brand' : ''}`;
  const img = `<img class="${classes}" src="${safeSrc}" alt="" aria-hidden="true">`;
  const vars = deckLogoVars(cfg);
  // A supplied offset > 0 says the first section BELOW is not the deck's first slide.
  // Absent or 0 leaves the reading exactly as it was: this document starts the deck.
  const slicedPastFirst = Number.isInteger(deckOffset) && deckOffset > 0;
  let firstSeen = false;
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const cls = p.cls.split(/\s+/).filter(Boolean);
    const isTitle = cls.includes('title');
    const isFirst = !firstSeen && !slicedPastFirst;
    firstSeen = true;
    if (cfg.on !== 'all' && !isFirst && !isTitle) return `${p.openTag}${p.inner}</section>`;
    if (HAS_DECK_LOGO_RE.test(p.inner)) return `${p.openTag}${p.inner}</section>`;
    let open = p.openTag;
    // PREPEND into any existing style rather than replacing it: `setAttr` overwrites,
    // and a Marp `<section>` legitimately carries its own inline style (background
    // directives write one). Prepending also means a later author declaration of the
    // same custom property still wins, which is the safer direction to lose.
    if (vars) {
      const prior = readAttr(open, 'style');
      // No separator of our own: `deckLogoVars` already terminates its payload (that
      // termination is load-bearing — see the note there). Adding a second `;` here
      // wrote an empty declaration into the style of every logo slide, which was
      // invisible while this whole function was dead code on the engine path.
      open = setAttr(open, 'style', prior ? `${vars}${prior}` : vars);
    }
    return `${open}${img}${p.inner}</section>`;
  }).join('');
}

// `applyBackdropToHtml` lives in lib/core/backdrop.js — moved there so the splitter
// (lib/core/auto-split.js), which this file transitively requires, can re-run it on the pages
// it re-authors without a require cycle (#2305). Re-exported below for every existing caller.

/* The meta, progress and watermark Tiles are self-contained Form Tiles (issue
 * #356): each owns its kernel (applyToHtml + applyToDom), CSS and manifest in
 * one folder under lib/forms/tile/<id>, so its logic is ONE shared
 * implementation across all three render paths instead of hand-copied here and
 * in a DOM mirror. The depth-aware <section> walker they share lives in
 * lib/core/split-sections.js. This file no longer owns any Form Tile injector.
 */

/* ── FORM — the composition model, applied to every slide ───────────────────
 * Form is not a feature flag and not a setting. Every deck composes as Form and
 * there is no way to turn it off or pick a mode: the `form:` front-matter key,
 * the per-slide `form` / `no-form` tokens and the retired `form: minimal` are
 * all gone (see engineering/decisions/2026-09-20-form-is-not-configurable.md).
 *
 * What survives is the FRAME choice, which was never the same question. A slide
 * composes under one Frame; the chrome-hosting `standard` Frame declares nine
 * Cells, and each of the ten SOVEREIGN Frames declares exactly one (`stage`).
 * Sovereignty is a property of the Frame, not an absence of Form.
 *
 * The one axis that could ever legitimately vary is the MEDIUM — `2d` today, a
 * spatial renderer (CSS-3D / WebXR) never. That is a renderer choice, not a deck
 * toggle, and nothing author-facing selects it
 * (engineering/decisions/2026-06-16-form-manifest-medium-independent-contract.md). */
/**
 * The SOVEREIGN Frames — the Frames that carry no chrome Cells, so the `form`
 * class must not tag them. DERIVED from the Form frame manifests
 * (lib/forms/frame/<id>/<id>.manifest.json — the set with `exemptFromChrome:
 * true`), so adding a sovereign Frame folder auto-updates this without editing
 * this file (design/forms.md §11; 2026-06-15-form-implementation.md §6 — the
 * Open/Closed win).
 *
 * DUAL-CONSUMER CONTRACT (see this file's header): the Form loader reads the
 * filesystem, which the browser playground bundle (esbuild, platform:browser)
 * cannot do. So the derivation runs ONLY at Node load, behind a guard that
 * esbuild cannot statically resolve; the browser bundle falls back to the
 * baked literal below. A unit test asserts the two are identical, so the baked
 * fallback can never drift from the manifests.
 */
const SOVEREIGN_FRAMES_FALLBACK = [
  'closing', 'compare-code', 'divider',
  'image', 'premise', 'scene',
  'split-compare', 'split-panel', 'title', 'topic',
];

function deriveSovereignFrames() {
  // `require` via a computed expression so esbuild leaves it as a runtime call
  // (unresolved in the browser bundle) instead of pulling node:fs into it.
  try {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      return SOVEREIGN_FRAMES_FALLBACK;
    }
    const req = (typeof module !== 'undefined' && module.require)
      ? module.require.bind(module)
      : require;
    // Computed (non-literal) specifier so esbuild can't statically resolve and
    // bundle the fs-using loader into the browser IIFE — it stays a runtime
    // require that simply fails (caught) in the browser.
    const spec = ['..', '..', 'forms'].join('/');
    const forms = req(spec);
    const derived = forms.sovereignFrames();
    return derived?.length ? derived : SOVEREIGN_FRAMES_FALLBACK;
  } catch (_e) {
    return SOVEREIGN_FRAMES_FALLBACK;
  }
}

const SOVEREIGN_FRAMES = deriveSovereignFrames();

/** The CSS hook for the CHROME-HOSTING Frame. Not "is this Form" — see below. */
const FORM_CLASS = 'form';
/** The rendering medium. One value today; a spatial renderer would be the second. */
const FORM_MEDIUM = '2d';

/**
 * Is this slide's Frame a SOVEREIGN one — a Frame that declares a single `stage`
 * Cell and no chrome Cells at all (title, divider, closing, image, premise, scene,
 * split-panel, split-compare, compare-code, topic)?
 */
function isSovereignFrame(classAttr) {
  return (classAttr || '').split(/\s+/).filter(Boolean).some((t) => SOVEREIGN_FRAMES.includes(t));
}

/**
 * Which Frame this slide composes as: the sovereign layout token, or `standard`.
 *
 * THE `form` CLASS WINS OVER A SOVEREIGN TOKEN, and that is not a tie-breaker — it is
 * the answer. A slide carrying `form` has the chrome Cells; that is what the class is
 * for. An AUTHORED `form` on a sovereign slide cannot reach here, because
 * `formToggleClass` strips it — so the only way both appear together is when the engine
 * itself put them there, and there is exactly one such producer: the split envelope's
 * `compareOptionSections`, which re-authors a `split-compare` slide into body pages that
 * keep the layout class for its `.compare-left` / `.compare-right` styling AND take real
 * masthead and footer Cells. Those pages compose under the chrome-hosting Frame while
 * still being painted by `section.split-compare` rules.
 *
 * Reading the sovereign token first said `split-compare` for four pages of
 * `examples/split-decision.md` and two of `examples/social-grid.md`, against a
 * `data-frame="standard"` the splitter had already stamped — so `frameIdFor` and the
 * shipped DOM disagreed, and the runtime twin would have rewritten the attribute to the
 * wrong value on any path where it runs after a split. Found by the red-team lens.
 */
function frameIdFor(classAttr) {
  const tokens = (classAttr || '').split(/\s+/).filter(Boolean);
  if (tokens.includes(FORM_CLASS)) return 'standard';
  return tokens.find((t) => SOVEREIGN_FRAMES.includes(t)) || 'standard';
}

/**
 * Does this slide's Frame host the chrome Cells — the masthead band, the bay, the
 * footer Cell and the progress rail? True for the chrome-hosting `standard` Frame,
 * false for the ten sovereign Frames.
 */
function hostsChromeCells(classAttr) {
  return !isSovereignFrame(classAttr);
}

/**
 * Resolve one section's class list. Appends `form` to a chrome-hosting slide.
 *
 * `form` IS NOT "THIS SLIDE COMPOSES AS FORM" — every slide does, unconditionally.
 * It is the CSS hook for the chrome-hosting Frame, and it is carried by the ~245
 * engine rules that paint the masthead band, the bay, the footer Cell and the rail.
 * The universal fact lives on the ATTRIBUTES instead (`data-form`, `data-frame`,
 * stamped by applyFormToHtml below), because that is a statement about the model
 * and this is a selector.
 *
 * We tried making the class universal and marking sovereignty with a second class.
 * It is the same fact either way, but the class is load-bearing for a decade of CSS
 * and the split envelope, and universalizing it moved real decks three separate
 * times — a full-bleed masthead on `social-grid`, a `:not()` specificity bump on
 * `palette-audit`, and the `premise` split runs in `split-horizontal` /
 * `autosplit-coverage` gaining chrome geometry they never had. Each needed its own
 * guard. The attributes say the same thing and move nothing.
 * See engineering/decisions/2026-09-20-form-is-not-configurable.md § "Why the class
 * did not become universal".
 *
 * Idempotent, and there is no opt-out token: a deck cannot refuse Form.
 *
 * `authored: false` TURNS THE STRIP OFF, and it is the whole reason this takes options.
 * The strip below corrects an AUTHOR. The engine itself writes the same combination on
 * purpose in one place — `compareOptionSections` re-authors a `split-compare` slide into
 * body pages that keep the layout class for its `.compare-left` / `.compare-right`
 * styling AND take real masthead and footer Cells — and stripping there would pull chrome
 * off pages the splitter had just built it into.
 *
 * That exemption used to live in the DOM twin, as a `data-split-role` check at the call
 * site, and the engine twin had no equivalent because it receives a class STRING and
 * cannot see the attribute. The two paths therefore agreed only because auto-split runs
 * later, in the browser — a fact about pass ordering, written in a comment, which is not
 * what HARD RULE #1 means by a shared kernel. The rule now lives here with its reason,
 * and each caller says which world it is in: the engine pass only ever meets authored
 * classes, so it passes nothing.
 *
 * SOVEREIGNTY IS TESTED FIRST, and an author-written `form` token is STRIPPED.
 * The order used to be the other way round, which left the one case where the token
 * was still live: `<!-- _class: title form -->` kept the class, so a sovereign slide
 * picked up `section.form`'s chrome geometry and its ink moved 16px at 2560x1440
 * (measured — `--footer-reserve` padding). That slide then said two contradictory
 * things about itself, `data-frame="title"` against a chrome-hosting class, and
 * `lint:deck` told the author the token was inert while deleting it moved their
 * deck. Stripping it is what makes all three true at once: the token does nothing,
 * the lint is honest, and the Frame decides alone.
 */
function formToggleClass(classAttr, { authored = true } = {}) {
  const tokens = (classAttr || '').split(/\s+/).filter(Boolean);
  if (isSovereignFrame(classAttr)) {
    // A SOVEREIGN CLASS IS NEVER GIVEN `form` HERE, whatever `authored` says. The option
    // only decides whether an existing one is taken AWAY — "do not strip", not "treat
    // this as non-sovereign". Conflating the two hands a `form` class to every
    // native-slice page of a sovereign run (`premise lat-split-native`, which carries
    // `data-split-role` and no `form`), which is the chrome geometry the abandoned
    // universal-class cut moved `split-horizontal` and `autosplit-coverage` with.
    if (!tokens.includes(FORM_CLASS)) return classAttr;
    // Return the ORIGINAL string when there is nothing to strip: callers compare the
    // result against the input to decide whether to rewrite the tag at all, so
    // re-joining would churn whitespace on every sovereign slide for no reason.
    return authored ? tokens.filter((t) => t !== FORM_CLASS).join(' ') : classAttr;
  }
  if (tokens.includes(FORM_CLASS)) return classAttr;
  tokens.push(FORM_CLASS);
  return tokens.join(' ');
}

/**
 * Stamp the Form MODEL onto one section's open tag, and hand back the new tag.
 *
 * Two attributes, on EVERY slide, chrome-hosting or sovereign:
 *   · `data-form="2d"`  — this slide composes as Form, in the 2D medium. There is
 *     no other value today and no way for a deck to change it. A spatial renderer
 *     would be the second medium, chosen by the renderer and never by an author.
 *   · `data-frame="<id>"` — WHICH Frame carves it: `standard` for the chrome-hosting
 *     Frame, or the sovereign Frame's own id (`title`, `divider`, `closing`, `image`,
 *     `premise`, `scene`, `split-panel`, `split-compare`, `compare-code`, `topic`).
 *
 * THIS IS WHERE SOVEREIGNTY IS STATED POSITIVELY. It used to be spelled as an
 * ABSENT `form` class, which made "which Frame composes this slide" indistinguishable
 * from "is this Form at all" — and the documentation read it the second way. A reader
 * (or a stylesheet, or a future medium) now asks `data-frame` and gets a name.
 *
 * AUTHORITATIVE, not merely additive: an existing value is REPLACED, not respected.
 * The first cut only stamped when the attribute was absent, which made the engine's
 * own answer optional — a deck writing raw `<section data-form="spatial"
 * data-frame="evil">` into a slide kept both, and the docblock beside it claimed there
 * was "no way for a deck to change it". Harmless in itself (it is the author's own
 * deck, and nothing selects on these yet) and wrong in a way that matters: the whole
 * point of the pair is that it is the ENGINE's statement about the Frame. A value the
 * engine derives and a value an author typed cannot both be that.
 *
 * Still idempotent, in the stronger sense: running it twice yields the same answer,
 * because both values are derived — `FORM_MEDIUM` is a constant and `frameIdFor`
 * answers from a closed set (`SOVEREIGN_FRAMES` plus `standard`).
 */
// Any spelling of an attribute VALUE the HTML grammar admits: double-quoted,
// single-quoted, or unquoted. The strip below was double-quoted only, so
// `data-form='spatial'` and `data-form=spatial` survived as a DUPLICATE attribute —
// behaviorally harmless (HTML5 keeps the first occurrence, which is ours) and still
// wrong twice over: the docblock claims an existing value is replaced, and a duplicate
// attribute makes the exported document invalid for a validator or an XHTML consumer.
// The threat model here is hand-written HTML, which includes both other spellings.
const ATTR_VALUE = "(?:\"[^\"]*\"|'[^']*'|[^\\s>]*)";
// `i` AS WELL AS `g`: the stamp below matches `<section` case-insensitively, so an
// uppercase `<SECTION>` reaches this strip — and with a case-SENSITIVE strip a forged
// `DATA-FORM=` survived it and the tag came out carrying the attribute TWICE, which is
// the exact duplicate-attribute hazard the note above says this strip exists to close.
const STRIP_FORM = new RegExp(`\\s+data-form=${ATTR_VALUE}`, 'gi');
// No lookbehind, and the reason is narrower than "lookbehinds are hazardous here".
// A guard against a prefixed sibling like `data-lattice-data-frame` is unnecessary either
// way: the pattern requires WHITESPACE immediately before `data-frame=`, and a prefixed
// name has none. What made it worth removing rather than leaving inert is that ONE
// spelling of it is actively wrong — `(?<![-\w])`, which also excludes word characters.
// Once `data-form` is stripped first, `data-frame` follows `<section` directly, so the
// preceding character is `n`: `(?<!-)` succeeds on it and strips correctly, `(?<![-\w])`
// fails and skips, and a second pass emits the attribute TWICE. The idempotency assertion
// below is what caught that, on an intermediate edit that never reached a commit.
const STRIP_FRAME = new RegExp(`\\s+data-frame=${ATTR_VALUE}`, 'gi');

function stampFormAttrs(openTag, classAttr) {
  const attrs = ` data-form="${FORM_MEDIUM}" data-frame="${frameIdFor(classAttr)}"`;
  return openTag
    .replace(STRIP_FORM, '')
    .replace(STRIP_FRAME, '')
    // CASE-INSENSITIVE, and the `$&` keeps the author's own spelling. HTML tag
    // names are case-insensitive, and the shared walker reads `<SECTION>` as a
    // section — so a case-SENSITIVE stamp here left such a slide carrying the
    // `form` class (added by the attribute-position walk, which reads the name
    // case-insensitively too) but NO `data-frame`. That is exactly the
    // half-stamped state `test/integration/invariants/frame-identity-agrees.test.js`
    // exists to forbid: chrome claimed by the class, Frame identity missing.
    .replace(/^<section\b/i, (m) => m + attrs);
}

/**
 * HTML-stage helper: apply Form to rendered HTML. Stamps `data-form` + `data-frame`
 * on every eligible TOP-LEVEL `<section>`, and adds the `form` CLASS to the
 * chrome-hosting ones. Runs FIRST, before the registry, so masthead-lift et al. see
 * the class. Uses the depth-aware splitSections walker, so it only rewrites real
 * slide sections — a raw `<section>` in slide content is nested and left untouched.
 * (lib/engine — which the emulator runs — applies this same function in its
 * renderHtml, before its registry pass.)
 *
 * Takes no deck source: there is nothing in the front matter left to read.
 */
function applyFormToHtml(html) {
  return splitSections(html).map((p) => {
    if (p.type === 'gap') return p.text;
    // `data-split-role` marks a section the SPLIT ENVELOPE composed, not one an author
    // wrote — so the strip does not apply to it, exactly as in the DOM twin. This pass
    // does not meet one in the shipped pipeline, because auto-split runs later and in the
    // browser; it is read anyway so the twins give the same answer for the same input
    // rather than only for the inputs the current pass ordering happens to deliver. A
    // deck forging the attribute in raw HTML was the one shape where they disagreed.
    const next = formToggleClass(p.cls, { authored: !/\sdata-split-role=/.test(p.openTag) });
    // REWRITE the class attribute the walker READ, through the same
    // attribute-position walk — so a single-quoted `class='…'` is replaced
    // rather than joined by a second attribute, and a ` class=` appearing
    // inside ANOTHER attribute's value is not mistaken for this one.
    let openTag = next === p.cls ? p.openTag : withClass(p.openTag, next);
    openTag = stampFormAttrs(openTag, next);
    return openTag + p.inner + '</section>';
  }).join('');
}

/**
 * Universal state-token marker decoder: `stateClassesFor` in lib/core/state-marks.js maps
 * each of the six markers to the semantic + shape classes the universal CSS recipe paints,
 * with ONE meaning per marker in every layout. Every pattern below is built from that
 * kernel's LEADING_MARKER_RE / LEADING_MARKER_PREFIX_RE; none retypes the marker class.
 */

/**
 * markdown-it plugin: wraps state-marker nested list items inside `.verdict-grid` (and
 * `.pricing`, which shares the nested-card-with-badges shape — features per tier)
 * sections in `<span class="badge {sem} {shape}">`.
 *
 * No layout-dependent reading: verdict-grid's "not met" is `[!]`, and `[ ]` is the open
 * ring here as everywhere. It used to be overloaded (✕ in verdict-grid, ring elsewhere),
 * which drew a red ✕ on a pricing card under a legend showing the ring.
 */
function verdictGridBadges(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'verdict_grid_badges', (state) => {
    let inVerdictGrid = false;
    let listDepth = 0;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        const cls = token.attrGet('class') || '';
        inVerdictGrid = cls.includes('verdict-grid') || cls.includes('pricing');
        listDepth = 0;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        inVerdictGrid = false;
        continue;
      }
      if (!inVerdictGrid) continue;
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        listDepth++;
        continue;
      }
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        listDepth--;
        continue;
      }
      if (token.type !== 'inline' || listDepth < 2 || !token.children) continue;
      // The label is the DOM's `textContent`, exactly what the runtime mirror reads:
      // text children only, with an inline-HTML child's TAG dropped (its text sits in
      // the sibling text tokens). Joining the raw tags in and escaping them printed
      // `<em>` as literal characters; leaving them unescaped let a typed `&lt;`
      // become live markup on this path only.
      const text = token.children
        .map((c) => (c.type === 'html_inline' ? '' : c.content || ''))
        .join('')
        .trim();
      const m = LEADING_MARKER_RE.exec(text);
      if (!m) continue;
      const { sem, shape } = stateClassesFor(m[1]);
      const htmlToken = new token.children[0].constructor('html_inline', '', 0);
      htmlToken.content = `<span class="badge ${sem} ${shape}">${markdown.utils.escapeHtml(m[2])}</span>`;
      token.children = [htmlToken];
    }
  });
}

/**
 * markdown-it plugin: wraps a state marker leading a <td> cell's text in
 * `<span class="state {sem} {shape}">…</span>`.
 *
 * TWO slide classes reach this. `obligation-matrix` is the layout built around
 * a coverage grid. `state-cells` is the UNIVERSAL opt-in (HARD RULE #29): any
 * slide with a table can carry it and get the same decoding, so a comparison
 * table can paint the color-blind-safe status disc instead of a typed `✓` — the
 * thing `lint:deck` points every typed check at. Widening the existing decoder
 * rather than adding a second one keeps ONE parse for the marker grammar
 * (HARD RULE #1); the mirror in lib/runtime/index.js, which an Export-to-Marp
 * bundle takes, tests the same pair.
 */
function obligationMatrixBadges(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'obligation_matrix_badges', (state) => {
    let inMatrix = false;
    let inTd = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        inMatrix = /\b(?:obligation-matrix|state-cells)\b/.test(token.attrGet('class') || '');
        inTd = false;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        inMatrix = false;
        continue;
      }
      if (!inMatrix) continue;
      if (token.type === 'td_open') {
        inTd = true;
        continue;
      }
      if (token.type === 'td_close') {
        inTd = false;
        continue;
      }
      if (token.type !== 'inline' || !inTd || !token.children) continue;
      // The label is the DOM's `textContent`, exactly what the runtime mirror reads:
      // text children only, with an inline-HTML child's TAG dropped (its text sits in
      // the sibling text tokens). Joining the raw tags in and escaping them printed
      // `<em>` as literal characters; leaving them unescaped let a typed `&lt;`
      // become live markup on this path only.
      const text = token.children
        .map((c) => (c.type === 'html_inline' ? '' : c.content || ''))
        .join('')
        .trim();
      const m = LEADING_MARKER_RE.exec(text);
      if (!m) continue;
      const { sem, shape } = stateClassesFor(m[1]);
      const htmlToken = new token.children[0].constructor('html_inline', '', 0);
      htmlToken.content = `<span class="state ${sem} ${shape}">${markdown.utils.escapeHtml(m[2])}</span>`;
      token.children = [htmlToken];
    }
  });
}

/**
 * The text a cell's inline token would have as DOM `textContent` — NOT its raw
 * markdown source.
 *
 * This exists because the two render paths read the same cell from different
 * places: this walker has markdown-it tokens, and the DOM mirror in
 * lib/runtime/index.js has `textContent`. Handing the kernel `token.content`
 * fed it link and image SYNTAX, so the two disagreed on exactly the inputs the
 * kernel's tests are about — `[2024](https://x)` is not numeric as source but
 * `2024` is once rendered, and `![acme](a.png)` is a non-empty string as source
 * while an `<img>` contributes nothing to `textContent` at all.
 *
 * So walk the children the way the DOM would: text and inline code contribute
 * their content, a link contributes its inner text (its own text children are
 * siblings between `link_open` / `link_close`, so they arrive on their own), an
 * image contributes NOTHING, and a break contributes nothing — `<br>` has no
 * text. Entities are already decoded in a `text` token's content, so they need
 * no handling here and match the DOM for free.
 */
function inlineTextContent(token) {
  const kids = token?.children;
  if (!Array.isArray(kids)) return String(token?.content || '');
  let out = '';
  for (const k of kids) {
    if (k.type === 'text' || k.type === 'code_inline') out += k.content || '';
    else if (k.type === 'softbreak') out += ' ';
  }
  return out;
}

/**
 * markdown-it plugin: stamps `lat-row-label` on a table whose FIRST COLUMN holds
 * row labels, so base's `td:first-child` switch turns on for that table alone.
 *
 * The verdict is NOT taken here — `lib/core/table-row-label.js` owns it, and the
 * DOM mirror in lib/runtime/index.js calls the same function on the same table
 * (HARD RULE #1). This walker's only job is to hand that kernel the two things
 * it needs — the header cells and the first cell of each body row — and to put
 * the answer back on the `table_open` token.
 *
 * Runs on a slide carrying `table`, `row-label` or `no-row-label`. A plain table
 * on any other slide is untouched, which is deliberate: base.elements.css
 * refuses first-column emphasis by default, and the great majority of tables in
 * this repo are plain tables that have never asked for it. `row-label` is how a
 * plain table opts IN. (An earlier draft of this line put a number on that
 * majority. Nothing committed re-derives it — the corpus test in
 * test/unit/core/table-row-label.test.js counts tables, not opt-in slides — so
 * the number was folklore dressed as a measurement, and it is gone rather than
 * re-guessed.)
 *
 * Per table, not per slide — a slide may hold two tables and they may disagree.
 * The stamp therefore lands on the `table_open` token, which is held by
 * reference and written at `table_close`, once the body has been seen.
 *
 * RAW HTML: NOT PARSED, AND NOT DROPPED EITHER. markdown-it hands a table an
 * author wrote as raw `<table>` through as an opaque `html_block`, so its rows
 * never enter this token stream and no verdict can be taken. Leaving it there was
 * a regression against `compare-table`, which styled `td:first-child`
 * unconditionally. So this walker writes down what it DOES know: it stamps the
 * negative verdict as well as the positive one, and marks the slide with
 * `RAW_TABLES_CLASS` from a substring test on the block. base.variants.css then
 * emphasizes a table carrying neither verdict. The substring test is safe where a
 * parse was not, because it decides the SCOPE of a CSS fallback, never a verdict.
 *
 * An `html_block` arm was written to close that and REMOVED, because a reader
 * narrow enough to be safe is too narrow to be right. Measured, it disagreed
 * with the mirror on eight shapes — a header row mixing `th` and `td`, an HTML
 * comment containing `<tr>`, a `>` inside an attribute value, an unclosed `td`,
 * `<template>` rows, `&mdash;`, a table split across blocks — and on two raw
 * tables in ONE block it merged their rows and stamped the WRONG one. Its
 * attribute rewrite also wrote the class into `data-class` (the `\b` trap of
 * #1358) and dropped the stamp on an unquoted `class=`. One narrow gap that is
 * always the same is worth more than a reader that is confidently wrong on
 * eight shapes; the gap is the safer half, since it under-stamps rather than
 * stamping the wrong column. See engineering/decisions/2026-09-20-table-component.md.
 */
function tableRowLabels(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'table_row_labels', (state) => {
    let classTokens = null;
    let slideOpen = null; // the lattice_slide_open token, held so a raw <table> can mark it
    let open = null;      // the table_open token awaiting its verdict
    let headers = null;   // header-row cells, or null once the header is closed
    let firstColumn = null;
    let inHead = false;
    let cellIndex = -1;   // -1 = not inside a row
    let capture = false;  // this cell's inline text is wanted

    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        // TOKEN EQUALITY, never a regex. `\btable\b` matches INSIDE `table-fill`
        // and `table-plain` — `-` is a non-word character, so the boundary holds
        // — and both of those are geometry/zebra switches that say nothing about
        // whether column one is a label. A slide carrying only `table-fill` was
        // being walked and stamped, which shipped bold row labels onto
        // examples/universal-table.md's own two-switches slide. It also split the
        // two render paths, because the DOM mirror selects `section.table` and
        // matches the class exactly. Any future `table-*` modifier would have
        // inherited the bug for free.
        const tokens = String(token.attrGet('class') || '').split(/\s+/).filter(Boolean);
        classTokens = tokens.some((t) => t === 'table' || t === 'row-label' || t === 'no-row-label')
          ? tokens
          : null;
        slideOpen = classTokens ? token : null;
        continue;
      }
      if (token.type === 'lattice_slide_close') { classTokens = null; slideOpen = null; continue; }
      if (!classTokens) continue;

      switch (token.type) {
        case 'table_open':
          open = token; headers = []; firstColumn = []; inHead = false; cellIndex = -1;
          break;
        case 'thead_open': inHead = true; break;
        case 'thead_close': inHead = false; break;
        case 'tr_open': cellIndex = 0; break;
        case 'tr_close': cellIndex = -1; break;
        case 'th_open':
        case 'td_open':
          // The header row in FULL (the kernel counts its cells to spot a
          // single-column table), but only column ZERO of a body row.
          capture = open != null && (inHead || cellIndex === 0);
          break;
        case 'th_close':
        case 'td_close':
          capture = false;
          if (cellIndex >= 0) cellIndex++;
          break;
        case 'inline':
          if (!capture || open == null) break;
          if (inHead) headers.push(inlineTextContent(token));
          else if (cellIndex === 0) firstColumn.push(inlineTextContent(token));
          break;
        case 'html_block': {
          // A SUBSTRING TEST, not a parse — that distinction is the whole design.
          // The reader that tried to parse this token was wrong on eight shapes and
          // stamped the wrong table when one block held two. All this needs to know
          // is "might this slide contain a raw table", because the consequence is a
          // CSS fallback scoped to the slide, not a verdict about any one table. A
          // false positive costs nothing: the fallback only reaches tables carrying
          // NEITHER verdict class, and every pipe table on the slide carries one.
          if (slideOpen && /<table[\s>]/i.test(token.content || '')) {
            const prev = slideOpen.attrGet('class');
            if (!String(prev || '').split(/\s+/).includes(RAW_TABLES_CLASS)) {
              slideOpen.attrSet('class', prev ? `${prev} ${RAW_TABLES_CLASS}` : RAW_TABLES_CLASS);
            }
          }
          break;
        }
        case 'table_close': {
          // BOTH verdicts are stamped. The positive one drives the emphasis; the
          // negative one is what tells CSS "this table was judged and declined",
          // so the raw-HTML fallback can tell it apart from a table nothing judged.
          if (open) {
            const cls = resolveRowLabel(classTokens, { headers, firstColumn })
              ? ROW_LABEL_CLASS
              : ROW_LABEL_OFF_CLASS;
            const prev = open.attrGet('class');
            open.attrSet('class', prev ? `${prev} ${cls}` : cls);
          }
          open = null; headers = null; firstColumn = null;
          break;
        }
        default:
          break;
      }
    }
  });
}

/**
 * markdown-it plugin: on `matrix-grid` slides, wraps `[x]/[-]/[ ]` text inside
 * <td> cells in `<span class="cell {shape}">…</span>`. Unlike obligation-
 * matrix's pass/warn/fail semantics (stateClassesFor), matrix-grid's three
 * states are POSITIONAL — filled (this row's position), outlined (reachable),
 * empty (not applicable) — colored by the row's own category hue via CSS
 * (--row-hue), not a status palette, so no semantic class is emitted here.
 */
function matrixGridCells(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'matrix_grid_cells', (state) => {
    let inMatrix = false;
    let inTd = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        inMatrix = /\bmatrix-grid\b/.test(token.attrGet('class') || '');
        inTd = false;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        inMatrix = false;
        continue;
      }
      if (!inMatrix) continue;
      if (token.type === 'td_open') {
        inTd = true;
        continue;
      }
      if (token.type === 'td_close') {
        inTd = false;
        continue;
      }
      if (token.type !== 'inline' || !inTd || !token.children) continue;
      // Marker parse + markup come from the shared kernel (lib/core/matrix-grid-
      // cells.js), so this render path and the runtime's DOM mirror can't drift.
      const parsed = matrixGridCellKernel.parseCell(token.children.map((c) => c.content || '').join(''));
      if (!parsed) continue;
      const htmlToken = new token.children[0].constructor('html_inline', '', 0);
      htmlToken.content = matrixGridCellKernel.cellHtml(parsed);
      token.children = [htmlToken];
    }
  });
}

/**
 * markdown-it plugin: on a `checklist` slide, marks each top-level list item whose
 * text begins with a state marker with the state classes; strips the marker.
 */
function checklistItemStates(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'checklist_item_states', (state) => {
    let inChecklist = false;
    let listDepth = 0;
    let pendingItemOpen = null;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        inChecklist = /\bchecklist\b/.test(token.attrGet('class') || '');
        listDepth = 0;
        pendingItemOpen = null;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        inChecklist = false;
        continue;
      }
      if (!inChecklist) continue;
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        listDepth++;
        continue;
      }
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        listDepth--;
        continue;
      }
      if (token.type === 'list_item_open' && listDepth === 1) {
        pendingItemOpen = token;
        continue;
      }
      if (token.type !== 'inline' || !pendingItemOpen || !token.children) continue;
      const textChild = token.children.find((c) => c.type === 'text');
      if (!textChild) {
        pendingItemOpen = null;
        continue;
      }
      const m = LEADING_MARKER_PREFIX_RE.exec(textChild.content);
      if (!m) {
        pendingItemOpen = null;
        continue;
      }
      const { sem, shape } = stateClassesFor(m[1]);
      const stateClass = `state ${sem} ${shape}`;
      const cur = pendingItemOpen.attrGet('class');
      pendingItemOpen.attrSet('class', cur ? `${cur} ${stateClass}` : stateClass);
      textChild.content = textChild.content.slice(m[0].length);
      pendingItemOpen = null;
    }
  });
}

/**
 * markdown-it plugin: `{LABEL}` inside SINGLE-backtick inline code becomes a
 * shaped pill. Universal — every slide, every component.
 *
 * The decision of what qualifies lives in `lib/core/inline-pills.js`, shared with
 * the runtime's DOM mirror (HARD RULE #1), so the two render paths cannot drift.
 *
 * THE ESCAPE IS A BACKSLASH, and this docblock used to describe a different one. The
 * first cut keyed on `markup === '`'` — CommonMark's double-backtick form — which works
 * here and is INVISIBLE to the runtime mirror, because marp-core renders `` `{LIVE}` ``
 * and ``` ``{LIVE}`` ``` to the same `<code>`. See `lib/core/inline-code-directives.js`.
 * A consequence worth stating plainly: ``` ``{LIVE}`` ``` now DISPATCHES, on both paths.
 */
function inlinePills(markdown) {
  markdown.core.ruler.push('lattice_inline_pills', (state) => {
    // `inline-code: literal` turns the grammar off — every single-backtick span stays a
    // `<code>`, INCLUDING one carrying a backslash, which is deliberate: with no grammar
    // running there is nothing to escape FROM, and stripping the backslash would silently
    // edit an author's text.
    //
    // GATED ON THE RESOLVED SECTION CLASS, NOT ON FRONT MATTER — and that is the whole
    // correctness argument. `deckClassPropagate` is registered BEFORE this rule precisely
    // so every deck-wide token is already on the slide-open token when we get here, so
    // reading the class means this path answers the same question the runtime's
    // `isLiteralElement` answers, from the same signal, per slide. A first cut read the
    // deck's front matter and returned early, and an independent checker found three
    // separate defects falling out of that one asymmetry: a per-slide
    // `<!-- _class: inline-code-literal -->` was documented as working and did not, a
    // deck-wide `class: inline-code-literal` (the spelling the docs teach for raw Marp)
    // stamped the token and still drew the pills, and the same deck rendered one way
    // through the engine and the other through the runtime with no warning on either.
    //
    // The env flag is the INLINE re-entry: `lib/engine/slides.js` renders `header:` and
    // `footer:` through `md.renderInline`, which sees no slide tokens at all, so it hands
    // the answer down instead. Without it, a literal deck kept drawing pills in its
    // chrome — the two directives a foreign deck is most likely to carry.
    if (state.env?.latticeInlineCodeLiteral) return;
    let slideLiteral = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        slideLiteral = (token.attrGet('class') || '').split(/\s+/).includes(INLINE_CODE_LITERAL);
        continue;
      }
      if (slideLiteral) continue;
      if (token.type !== 'inline' || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== 'code_inline') continue;
        // ESCAPE FIRST. `\{LIVE}` stays a `<code>`, with the backslash removed so the
        // reader sees `{LIVE}`. Deliberately NOT keyed on the backtick run: `markup`
        // exists only on this side, and an escape only one render path can see is the
        // defect this replaced.
        if (child.attrGet(INLINE_ESCAPED_ATTR) !== null) continue; // already resolved
        const unescaped = inlineEscapedText(child.content);
        if (unescaped !== null) {
          child.content = unescaped;
          // Stamp it. Stripping the backslash makes the text a valid input to this same
          // grammar, so the element has to carry the fact that it was already an escape —
          // see ESCAPED_ATTR in the kernel for the two ways that bites without it.
          child.attrSet(INLINE_ESCAPED_ATTR, '');
          continue;
        }
        const html = inlineDirectiveHtml(child.content);
        if (!html) continue; // literal — leave the <code> exactly as it was
        child.type = 'html_inline';
        child.content = html;
        child.markup = '';
      }
    }
  });
}

/**
 * markdown-it plugin: mark a paragraph that is PROSE with inline code in it (`data-prose`),
 * so the ninety-odd `:has(> code:only-child)` rules — eyebrow, subtitle, meta line — stop
 * matching an ordinary sentence that holds one code span (#2308). `:only-child` cannot see
 * text nodes, so the fact is decided here; the kernel and its runtime mirror live in
 * `lib/core/prose-code.js` (HARD RULE #1). Universal — every slide, every component.
 */
function proseCodeMark(markdown) {
  markdown.core.ruler.push('lattice_prose_code', (state) => {
    proseCode.markTokens(state.tokens);
  });
}

/**
 * markdown-it plugin: on slot-labeled layouts, wraps the lead inline content of
 * each top-level <li> in <strong> so the labeled corner-tag CSS fires.
 */
function slotLabelLift(markdown) {
  // Which layouts lift comes from the shared kernel (lib/core/slot-label-lift.js)
  // — the list used to live here AND as a selector string in lib/runtime/index.js,
  // and the two drifted. Whole-class-token match: the `(?<![\w-]) … (?![\w-])`
  // boundaries treat hyphenated names as atomic so `timeline` does NOT match the
  // unrelated `timeline-list` chart class (a plain `\b` boundary would, since `-`
  // is a word boundary).
  const SLOT_LAYOUTS = slotLayoutPattern();
  // The list-steps staged-flow variants (chevron/converge/ghost) are generic
  // words, so — unlike the distinctive layout names above — they trigger the
  // lift ONLY on a list-steps host, never on any section that happens to carry
  // one of those class tokens. Runtime `transformSlotLabels` scopes the same way
  // (`section.list-steps.chevron` …) via the kernel's `slotLayoutSelector()`.
  const LIST_STEPS_HOST = /(?<![\w-])list-steps(?![\w-])/;
  const LIST_STEPS_LIFT_VARIANTS = new RegExp(`(?<![\\w-])(${LIST_STEPS_VARIANT_NAMES.join('|')})(?![\\w-])`);
  markdown.core.ruler.after('lattice_slide_containers', 'slot_label_lift', (state) => {
    let active = false;
    let chipTail = false;
    let listDepth = 0;
    let pendingLi = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        const klass = token.attrGet('class') || '';
        active = SLOT_LAYOUTS.test(klass) ||
          (LIST_STEPS_HOST.test(klass) && LIST_STEPS_LIFT_VARIANTS.test(klass));
        // actors: a trailing inline-code chip (actor-name pill) stays a
        // sibling of the <strong> label, not a child of it.
        chipTail = /(?<![\w-])actors(?![\w-])/.test(klass);
        listDepth = 0;
        pendingLi = false;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        active = false;
        continue;
      }
      if (!active) continue;
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        listDepth++;
        continue;
      }
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        listDepth--;
        continue;
      }
      if (token.type === 'list_item_open' && listDepth === 1) {
        pendingLi = true;
        continue;
      }
      if (token.type !== 'inline' || !pendingLi || !token.children || !token.children.length) continue;
      pendingLi = false;
      if (token.children[0].type === 'strong_open') continue;
      // For chip-tail layouts (actors), a trailing run of inline-code chips
      // (+ whitespace) is metadata (the actor-name pill), not heading text —
      // leave it outside the <strong> so `li > code` CSS keeps matching.
      let end = token.children.length;
      if (chipTail) {
        while (end > 0) {
          const t = token.children[end - 1];
          if (t.type === 'code_inline') { end--; continue; }
          if (t.type === 'text' && !t.content.trim()) { end--; continue; }
          break;
        }
        if (end === 0) continue; // lead is only a chip — nothing to label
      }
      const Ctor = token.children[0].constructor;
      const open = new Ctor('strong_open', 'strong', 1);
      const close = new Ctor('strong_close', 'strong', -1);
      token.children = [
        open,
        ...token.children.slice(0, end),
        close,
        ...token.children.slice(end),
      ];
    }
  });
}

/**
 * markdown-it plugin: on a `no-period` slide, strips a trailing period from every
 * heading. Opt in deck-wide via `class: no-period`.
 */
function stripHeadingPeriods(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'strip_heading_periods', (state) => {
    let active = false;
    let pendingInline = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        active = /\bno-period\b/.test(token.attrGet('class') || '');
        pendingInline = false;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        active = false;
        continue;
      }
      if (!active) continue;
      if (token.type === 'heading_open') {
        pendingInline = true;
        continue;
      }
      if (token.type === 'heading_close') {
        pendingInline = false;
        continue;
      }
      if (token.type !== 'inline' || !pendingInline || !token.children) continue;
      for (let i = token.children.length - 1; i >= 0; i--) {
        if (token.children[i].type === 'text') {
          token.children[i].content = token.children[i].content.replace(/\.\s*$/, '');
          break;
        }
      }
    }
  });
}

/**
 * markdown-it plugin: on a `with-period` slide, appends a period to any heading
 * not already ending with terminal punctuation. Opt in via `class: with-period`.
 */
function addHeadingPeriods(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'add_heading_periods', (state) => {
    let active = false;
    let pendingInline = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        active = /\bwith-period\b/.test(token.attrGet('class') || '');
        pendingInline = false;
        continue;
      }
      if (token.type === 'lattice_slide_close') {
        active = false;
        continue;
      }
      if (!active) continue;
      if (token.type === 'heading_open') {
        pendingInline = true;
        continue;
      }
      if (token.type === 'heading_close') {
        pendingInline = false;
        continue;
      }
      if (token.type !== 'inline' || !pendingInline || !token.children) continue;
      for (let i = token.children.length - 1; i >= 0; i--) {
        if (token.children[i].type === 'text') {
          const c = token.children[i].content;
          if (!/[.!?:…]$/.test(c)) token.children[i].content = `${c}.`;
          break;
        }
      }
    }
  });
}

/**
 * markdown-it plugin: on a `glossary` slide, transforms a 2-level nested bullet
 * list (Term → Definition) into a 2-column glossary table.
 */
// The class the glossary's generated term table carries, on BOTH render paths —
// the only thing that identifies a table this transform built rather than one the
// author wrote. Shared with lib/core/glossary-slide.js.
const { GLOSSARY_TABLE_CLASS } = require('../../core/glossary-table-class');
const { frontMatterValue, frontMatterName } = require('../../core/front-matter-key');
const { resolveLogoRef } = require('../../core/logo-builtins');

function glossaryListToTable(markdown) {
  markdown.core.ruler.after('lattice_slide_containers', 'glossary_list_to_table', (state) => {
    const tokens = state.tokens;
    let inGlossary = false;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'lattice_slide_open') {
        const cls = t.attrGet('class') || '';
        inGlossary = /\bglossary\b/.test(cls);
        continue;
      }
      if (t.type === 'lattice_slide_close') {
        inGlossary = false;
        continue;
      }
      if (!inGlossary) continue;
      if (t.type !== 'bullet_list_open') continue;
      let depth = 1;
      let end = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'bullet_list_open') depth++;
        else if (tokens[j].type === 'bullet_list_close') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end < 0) continue;
      const rows = [];
      let liDepth = 0;
      let term = '';
      let def = '';
      let captureTo = null;
      for (let j = i + 1; j < end; j++) {
        const tk = tokens[j];
        if (tk.type === 'list_item_open') {
          liDepth++;
          if (liDepth === 1) {
            term = '';
            def = '';
            captureTo = 'term';
          }
        } else if (tk.type === 'list_item_close') {
          if (liDepth === 1) {
            const termHtml = /^<(?:strong|b)\b/.test(term) ? term : `<strong>${term}</strong>`;
            rows.push(`<tr><td>${termHtml}</td><td>${def}</td></tr>`);
          }
          liDepth--;
        } else if (tk.type === 'bullet_list_open' && liDepth === 1) {
          captureTo = 'def';
        } else if (tk.type === 'inline') {
          const html = markdown.renderer.renderInline(tk.children, markdown.options, state.env);
          if (captureTo === 'term' && liDepth === 1 && !term) {
            term = html;
            captureTo = null;
          } else if (captureTo === 'def' && liDepth === 2 && !def) {
            def = html;
          }
        }
      }
      if (!rows.length) continue;
      const Ctor = t.constructor;
      const repl = new Ctor('html_block', '', 0);
      repl.content = `<table class="${GLOSSARY_TABLE_CLASS}"><thead><tr><th>Term</th><th>Definition</th></tr></thead><tbody>\n${rows.join('\n')}\n</tbody></table>\n`;
      repl.block = true;
      tokens.splice(i, end - i + 1, repl);
    }
  });
}

/**
 * markdown-it plugin: on a `glossary` slide, appends an alphabetic-range pill to the
 * h2 spanning the table's first-column first/last characters.
 */
function glossaryRange(markdown) {
  markdown.core.ruler.after('glossary_list_to_table', 'glossary_range', (state) => {
    let inGlossary = false;
    let h2InlineToken = null;
    let firstTermChar = null;
    let lastTermChar = null;
    let captureNextInline = false;
    for (const token of state.tokens) {
      if (token.type === 'lattice_slide_open') {
        const cls = token.attrGet('class') || '';
        inGlossary = /\bglossary\b/.test(cls);
        h2InlineToken = null;
        firstTermChar = null;
        lastTermChar = null;
        captureNextInline = false;
        continue;
      }
      if (!inGlossary) continue;
      if (token.type === 'lattice_slide_close') {
        if (h2InlineToken && firstTermChar) {
          const range =
            firstTermChar === lastTermChar
              ? firstTermChar
              : `${firstTermChar} – ${lastTermChar || firstTermChar}`;
          const Ctor = h2InlineToken.children?.[0] ? h2InlineToken.children[0].constructor : null;
          if (Ctor) {
            const space = new Ctor('text', '', 0);
            space.content = ' ';
            const pill = new Ctor('html_inline', '', 0);
            pill.content = `<span class="range-pill">${range}</span>`;
            h2InlineToken.children = [...(h2InlineToken.children || []), space, pill];
          }
        }
        inGlossary = false;
        continue;
      }
      if (token.type === 'heading_open' && token.tag === 'h2') {
        captureNextInline = 'h2';
        continue;
      }
      if (captureNextInline === 'h2' && token.type === 'inline') {
        if (!h2InlineToken) h2InlineToken = token;
        captureNextInline = false;
        continue;
      }
      // Only a table THIS rule generated feeds the pill. It used to accept any
      // `html_block` containing `<table>`, so an author's own raw-HTML table on a
      // glossary slide set the range — and the DOM mirror, which reads the
      // generated table, then disagreed with it. Both now key on the marker class.
      if (token.type === 'html_block' && token.content.includes(`<table class="${GLOSSARY_TABLE_CLASS}">`)) {
        const tbody = token.content.match(/<tbody>([\s\S]*?)<\/tbody>/);
        if (tbody) {
          const rows = [...tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
          if (rows.length) {
            const fc = rows[0][1].match(/<td>([\s\S]*?)<\/td>/);
            const lc = rows[rows.length - 1][1].match(/<td>([\s\S]*?)<\/td>/);
            const firstChar = (s) => (s.replace(/<[^>]+>/g, '').trim()[0] || '').toUpperCase();
            if (fc) firstTermChar = firstChar(fc[1]);
            if (lc) lastTermChar = firstChar(lc[1]);
          }
        }
      }
    }
  });
}

/**
 * Teach marp-core's bundled highlight.js about Mermaid syntax so fenced
 * ```mermaid blocks get hljs token spans. Idempotent.
 */
function registerMermaidHljs(marp) {
  try {
    if (!marp.highlightjs.getLanguage('mermaid')) {
      marp.highlightjs.registerLanguage('mermaid', mermaidLanguage);
    }
  } catch (_e) {
    /* already registered */
  }
}

/**
 * Replace hljs's stock `bash` with Lattice's augmented shell grammar
 * (lib/integrations/highlight-js/shell.hljs.js — modern CLI tools as built-ins,
 * `--flags` as params), which carries `sh` and `zsh` with it. `shell` / `console`
 * are left on their upstream SESSION grammar; the tag mix-up is `shellFenceFindings`'
 * job, not this one (see the grammar's header).
 *
 * Shaped like registerMermaidHljs because it rides the same seam: one call in
 * createEngine covers the CLI, the emulator, the export paths and the browser
 * preview, so no path can highlight shell differently from another (HARD RULE #1).
 *
 * THE GRAMMAR IS INJECTED, NOT REQUIRED AT THE TOP OF THIS FILE, and that is
 * load-bearing rather than stylistic. `lib/runtime/index.js` imports three small
 * helpers from this module, so everything this file requires is pulled into the
 * BROWSER RUNTIME bundle — which never highlights anything (spans are baked at
 * render time). A top-level `require` of the bash grammar put 4.5KB of dead
 * highlight.js into `lattice-runtime.min.js`, shipped to every exported deck and
 * every marp-kit user; injecting it keeps the grammar on the engine's graph,
 * where it runs, and off the runtime's, where it cannot. Same reasoning as
 * `createSlideSanitizer(DOMPurify, window)` in lib/core.
 *
 * @param {object} marp  markdown-it instance carrying `.highlightjs`
 * @param {Function & {GRAMMAR_NAME: string}} shellLanguage  the grammar module
 */
function registerShellHljs(marp, shellLanguage) {
  // A missing grammar is a CALLER bug, not an environment quirk, so it is checked
  // outside the try below — swallowed, it would silently drop every shell fence
  // back to stock bash forever, which is precisely the failure this module exists
  // to remove. This function is exported, so the engine is not the only call site.
  if (typeof shellLanguage !== 'function') {
    throw new TypeError('registerShellHljs(marp, shellLanguage): the grammar must be passed in — see lib/engine/index.js');
  }
  try {
    const hljs = marp.highlightjs;
    // Cheap idempotence. Not correctness — re-registering is harmless — but this
    // runs per markdown-it build, and re-registering replaces an object hljs has
    // already COMPILED (registerLanguage stores the raw definition; compilation is
    // lazy on first highlight and memoized via `isCompiled`), so skipping the
    // rewrite keeps that work spent rather than repeated on the typing path.
    // `getLanguage` returns that object, which keeps `name`; stock bash answers
    // 'Bash', so this only short-circuits once ours is installed.
    if (hljs.getLanguage('bash')?.name === shellLanguage.GRAMMAR_NAME) return;
    // Unconditional otherwise: `bash` always exists, so a has-it-already guard on
    // the NAME would make this a permanent no-op. registerLanguage replaces
    // silently, and re-running it is harmless.
    hljs.registerLanguage('bash', shellLanguage);
  } catch (_e) {
    /* a host with an unexpected hljs shape keeps the stock grammar */
  }
}

/**
 * functionPlotFences — rewrites ```functionplot fenced blocks into a
 * `<div class="functionplot" data-fp-config="…base64 JSON…"></div>` placeholder
 * that the vendored function-plot bundle inflates into an inline SVG. The fence
 * body is function-plot's own config schema (https://mauriciopoppe.github.io/function-plot/),
 * not a Lattice grammar — Lattice owns only the fence + the SVG theming + the
 * degradation-to-code-block contract. `latticeplot` is accepted as a DEPRECATED
 * alias for one release (the construct was renamed for honesty; see
 * spec/LFM-1.0.md §3.3 and the 2026-06-13-lfm-standard decision note).
 */
function functionPlotFences(md) {
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    if (info === 'functionplot' || info === 'latticeplot') {
      const cfg64 = toBase64(token.content);
      return `<div class="functionplot" data-fp-config="${cfg64}"></div>\n`;
    }
    return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}

/**
 * animaSceneFences — rewrites an ```anima fenced block (an Anima scene SPEC, JSON)
 * into a `<div class="anima-spec" data-scene-spec="…base64 JSON…" hidden></div>`
 * placeholder (mirrors functionPlotFences). scene.transform.js then LIFTS the
 * `data-scene-spec` onto the enclosing `<section class="scene">` and removes the
 * div; the docs-site Anima host (docs/src/lib/anima/hydrate.ts) reads that attribute
 * to mount the live animation on the HTML/present surfaces (Stage 6). The PDF is
 * untouched — it keeps the authored poster still.
 *
 * The spec is packed base64 (like functionplot's config) so arbitrary JSON survives
 * as an HTML attribute with no escaping hazard and no ReDoS-prone HTML parsing. It is
 * transport ONLY here — the untrusted spec is validated by `parseScene` in the host
 * before it ever compiles/mounts. Malformed (non-JSON) content degrades to an inert
 * placeholder (the host skips it and the poster stands).
 */
function animaSceneFences(md) {
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim();
    if (info === 'anima') {
      // Normalize/validate as JSON at authoring time so a broken spec is caught early
      // and the attribute carries minified, canonical JSON. Invalid → an inert marker.
      let spec64 = '';
      try {
        spec64 = toBase64(JSON.stringify(JSON.parse(token.content)));
      } catch {
        return '<div class="anima-spec anima-spec-error" hidden></div>\n';
      }
      return `<div class="anima-spec" data-scene-spec="${spec64}" hidden></div>\n`;
    }
    return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}

module.exports = {
  headingSplit,
  focusSteps,
  deckClassPropagate,
  defaultComponent,
  readDeckLogoFrontMatter,
  applyDeckLogoToHtml,
  deckLogoPlacement,
  applyBackdropToHtml,
  SOVEREIGN_FRAMES,
  SOVEREIGN_FRAMES_FALLBACK,
  FORM_CLASS,
  FORM_MEDIUM,
  isSovereignFrame,
  frameIdFor,
  hostsChromeCells,
  formToggleClass,
  stampFormAttrs,
  applyFormToHtml,
  stateClassesFor,
  verdictGridBadges,
  obligationMatrixBadges,
  tableRowLabels,
  matrixGridCells,
  checklistItemStates,
  inlinePills,
  proseCodeMark,
  slotLabelLift,
  stripHeadingPeriods,
  addHeadingPeriods,
  glossaryListToTable,
  glossaryRange,
  registerMermaidHljs,
  registerShellHljs,
  functionPlotFences,
  animaSceneFences,
};
