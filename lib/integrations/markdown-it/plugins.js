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
const { finishClasses, sectionIsFinish, normalizeSectionFinishClasses } = require('../../core/resolve-finish');
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
const { ruleClass, RULE_TOKENS } = require('../../core/resolve-rule');
const { eyebrowClass, EYEBROW_TOKENS } = require('../../core/resolve-eyebrow');
const { headlineClass, HEADLINE_TOKENS } = require('../../core/resolve-headline');
const { liftClass } = require('../../core/resolve-lift');
const { cardsClass, CARDS_TOKENS } = require('../../core/resolve-cards');
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
const { splitSections } = require('../../core/split-sections');
const { groupOnSlideRule } = require('../../core/slide-rule');

// Base64 that works in both Node (Buffer) and the browser (btoa). Used by the
// functionplot fence rewriter to pack the fence config into a data- attribute.
function toBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

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
    // Deck-wide HEADING RULE (`rule: full|short|accent|none` → rule-<value>) and EYEBROW
    // (`eyebrow: dot|bar|arrow|underline` → eyebrow-<value>) accent finishes — one class token
    // each, appended like the others, overridden per-slide. The default value (auto/plain)
    // maps to no token, so today's render is unchanged. See lib/core/resolve-rule.js /
    // resolve-eyebrow.js.
    const ruleName = frontMatterName(fmMatch[1], 'rule') || '';
    const ruleTokens = ruleClass(ruleName) ? [ruleClass(ruleName)] : [];
    const eyebrowName = frontMatterName(fmMatch[1], 'eyebrow') || '';
    const eyebrowTokens = eyebrowClass(eyebrowName) ? [eyebrowClass(eyebrowName)] : [];
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
    // Deck-wide CARD-ROW alignment (`cards: stretch|top|spread` → `cards-*`) — where a
    // card row puts the height it does not need, overridden per-slide (`_class: cards-*`).
    // See lib/core/resolve-cards.js. `center`/unknown map to no token, because centering is
    // the DEFAULT: with no variable set every rule falls back to its own value.
    const cardsName = frontMatterName(fmMatch[1], 'cards') || '';
    const cardsTokens = cardsClass(cardsName) ? [cardsClass(cardsName)] : [];
    const deckTokens = [...classTokens, ...colorModeTokens, ...finishTokens, ...modeTokens, ...claimTokens, ...stampTokens, ...toneStyleTokens, ...spectrumTokens, ...spectrumEdgeTokens, ...spectrumCardTokens, ...spectrumCardEdgeTokens, ...spectrumTrimTokens, ...cornersTokens, ...ruleTokens, ...eyebrowTokens, ...headlineTokens, ...liftTokens, ...cardsTokens];
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
  const logo = frontMatterValue(fm, 'logo');
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

/** Is this logo sitting in the top-right corner, where the marker tabs also live?
 *  Only when the author has NOT repositioned it — `logo-x`/`logo-y` move it anywhere
 *  on the slide (and switch it to left-anchoring), at which point the corner is free
 *  and the tabs must not reserve space for a logo that is no longer there. */
function deckLogoInCorner(cfg) {
  return !(cfg.x != null && cfg.y != null);
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
  const corner = deckLogoInCorner(cfg);
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
    // The marker stack reads this to reserve the logo's width (base.modifiers.css).
    // An attribute rather than a sentinel custom property, so it is greppable and a
    // CSS rule can select on it without a `:has()` scan.
    if (corner) open = setAttr(open, 'data-logo-corner', '');
    return `${open}${img}${p.inner}</section>`;
  }).join('');
}

/**
 * HTML-stage helper: inject the `.backdrop` wrapper as the FIRST child of every
 * `finish` section. The finish compositor lives on this wrapper (base.finish.css),
 * so one `opacity` (backdrop strength) and the `.backdrop-mask` overlay
 * (clearance / spotlight) can address the WHOLE finish as a single layer — and the
 * mark/edge pseudos move off the section, freeing `section::after` for the
 * paginator. Mirrors applyDeckLogoToHtml; the runtime (DOM) + emulator carry the
 * same injection so all three render paths agree.
 * (engineering/decisions/2026-07-01-finish-restraint-controls.md, slice 1.)
 */
function applyBackdropToHtml(html, markdown) {
  // Backdrop restraint (strength / clearance) is a BAKED layer of the finish now — it
  // rides the finish's generated CSS as `--fin-backdrop-*` (docs finish-generate), which
  // the compositor below reads. So the wrapper carries no deck-level inline style; the
  // deck author tunes it through the Studio's `finish-override:` map (regenerated CSS).
  void markdown;
  const el = `<div class="backdrop" aria-hidden="true"><i class="backdrop-mask"></i></div>`;
  // Idempotent: the negative lookahead skips a section whose backdrop is already
  // injected, so re-processing engine-rendered HTML (the emulator does) is a no-op.
  //
  // The optional `<img class="deck-logo">` in the lookahead is what keeps that true now
  // that `applyDeckLogoToHtml` runs AFTER this pass and puts the mark in front of the
  // wrapper (it is the section's first child on every render path, which is the contract
  // the CSS and the parity test are written against). Without it the guard would read
  // "no backdrop here" on every finish slide of a logo deck and inject a second one —
  // the same shape of positional-guard bug that shipped two stacked logos.
  return String(html || '').replace(/<section\b([^>]*)>(?!(?:<img\b[^>]*\sclass="[^"]*\bdeck-logo\b[^"]*"[^>]*>)?<div class="backdrop")/g, (match, attrs) => {
    const c = attrs.match(/\sclass="([^"]*)"/);
    const cls = c ? c[1].split(/\s+/).filter(Boolean) : [];
    if (!sectionIsFinish(cls)) return match;
    // A per-slide `finish-<name>` implies the bare `finish` compositor class — stamp
    // it into the class attr so `section.finish > .backdrop` (below) + the token rules
    // match, then inject the wrapper. Deck-wide finishes already carry `finish`.
    let tag = match;
    if (!cls.includes('finish')) {
      const normalized = normalizeSectionFinishClasses(cls).join(' ');
      tag = match.replace(/(\sclass=")[^"]*(")/, `$1${normalized}$2`);
    }
    return `${tag}${el}`;
  });
}

/* The meta, progress and watermark Tiles are self-contained Form Tiles (issue
 * #356): each owns its kernel (applyToHtml + applyToDom), CSS and manifest in
 * one folder under lib/forms/tile/<id>, so its logic is ONE shared
 * implementation across all three render paths instead of hand-copied here and
 * in a DOM mirror. The depth-aware <section> walker they share lives in
 * lib/core/split-sections.js. This file no longer owns any Form Tile injector.
 */

/* ── FORM deck-wide toggle (`form: off | standard | minimal`) ───────────────
 * The deck-level feature flag that enables the Form model across a whole
 * deck without tagging each slide. It resolves to the per-slide `form`
 * class on every ELIGIBLE section, so all the existing Form logic
 * (masthead-lift, meta / progress / watermark) works unchanged. Three modes:
 *   · standard (DEFAULT; also `true`/`on`/`yes`) — masthead band + bay + progress
 *                                               rail. Applied when `form:` is absent,
 *                                               so every deck composes as Form unless
 *                                               it opts out (graduated 2026-06-26).
 *   · minimal                                 — band + bay, but the progress rail is
 *                                               suppressed (adds `no-progress`), for a
 *                                               quieter deck.
 *   · off (also `false`/`no`)                  — disabled; the explicit opt-out.
 * Skipped on:
 *   · bookends (title / divider / closing) — their own centered chrome,
 *   · math / compare-code — they drive their own `> h2` title grid,
 *   · split-panel / split-compare — sovereign; the registry rewrites the h2
 *     before masthead-lift would see it,
 *   · image — imagery / full-bleed.
 * A per-slide `no-form` token opts a single slide out. Build-time only —
 * like the deck-wide `class:` and `logo:` directives it shares a limitation
 * with, it does NOT apply in the marp-vscode preview (which doesn't run these
 * config plugins); use a per-slide `form` token there. */
/**
 * The chrome-exempt (sovereign) Frames the deck-wide `form:` toggle must NOT
 * tag with the `form` class. This set is DERIVED from the Form frame manifests
 * (lib/forms/frame/<id>/<id>.manifest.json — the set of Frames with
 * `exemptFromChrome: true`), so adding a sovereign Frame folder auto-updates
 * the engine's skip behavior without editing this file (design/forms.md §11;
 * 2026-06-15-form-implementation.md §6 — the Open/Closed win).
 *
 * DUAL-CONSUMER CONTRACT (see this file's header): the Form loader reads the
 * filesystem, which the browser playground bundle (esbuild, platform:browser)
 * cannot do. So the derivation runs ONLY at Node load, behind a guard that
 * esbuild cannot statically resolve; the browser bundle falls back to the
 * baked literal below. A unit test asserts the two are identical, so the baked
 * fallback can never drift from the manifests.
 */
const FORM_TOGGLE_SKIP_FALLBACK = [
  'closing', 'compare-code', 'divider',
  'image', 'math', 'premise', 'scene',
  'split-compare', 'split-panel', 'title',
];

function deriveFormToggleSkip() {
  // `require` via a computed expression so esbuild leaves it as a runtime call
  // (unresolved in the browser bundle) instead of pulling node:fs into it.
  try {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      return FORM_TOGGLE_SKIP_FALLBACK;
    }
    const req = (typeof module !== 'undefined' && module.require)
      ? module.require.bind(module)
      : require;
    // Computed (non-literal) specifier so esbuild can't statically resolve and
    // bundle the fs-using loader into the browser IIFE — it stays a runtime
    // require that simply fails (caught) in the browser.
    const spec = ['..', '..', 'forms'].join('/');
    const forms = req(spec);
    const derived = forms.frameToggleSkip();
    return derived?.length ? derived : FORM_TOGGLE_SKIP_FALLBACK;
  } catch (_e) {
    return FORM_TOGGLE_SKIP_FALLBACK;
  }
}

const FORM_TOGGLE_SKIP = deriveFormToggleSkip();

/** The two values the `form:` toggle accepts. (`minimal` retired 2026-07-03 — see
 *  readFormMode; its exact "form, no rail" behavior is now `class: no-progress`.) */
const FORM_MODES = ['off', 'standard'];

/**
 * Read the deck-wide `form:` front-matter toggle → 'off' | 'standard'.
 *
 * Form is ON BY DEFAULT (graduated to the default composition model, 2026-06-26):
 * a deck with no `form:` key — or no front matter block at all — resolves to
 * `standard`. Authors opt OUT explicitly with `form: off` (also `false` / `no`).
 * Only a degenerate empty/non-string source resolves to `off` (nothing to render).
 * Per-slide `no-form` still exempts a single section; the sovereign Frames in
 * FORM_TOGGLE_SKIP are exempt regardless.
 *
 * `form: minimal` was RETIRED (2026-07-03): it only added `no-progress` (the "form,
 * no rail" look), which is now the deck-wide `class: no-progress` chrome control —
 * an exact equivalent. A lingering `form: minimal` resolves to `standard` (the lint
 * `retired-form-minimal` flags it and suggests `class: no-progress`).
 */
function readFormMode(src) {
  if (typeof src !== 'string' || !src.length) return 'off';
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return 'standard';
  const v = frontMatterValue(fmMatch[1], 'form');
  if (v === null) return 'standard';
  if (/^(off|false|no)$/.test(v.toLowerCase())) return 'off';
  return 'standard';
}

/**
 * Resolve one section's class list under the deck toggle (`mode` is the
 * deck-level Form mode). Appends `form` unless the section already opts in/out
 * (`form` / `no-form`) or its layout is in the skip set. Idempotent; returns the
 * class string.
 */
function formToggleClass(classAttr, mode = 'standard') {
  if (mode === 'off') return classAttr;
  const tokens = (classAttr || '').split(/\s+/).filter(Boolean);
  if (tokens.includes('form') || tokens.includes('no-form')) return classAttr;
  if (tokens.some((t) => FORM_TOGGLE_SKIP.includes(t))) return classAttr;
  tokens.push('form');
  return tokens.join(' ');
}

/**
 * HTML-stage helper: apply the deck-wide `form:` toggle to rendered HTML
 * by adding the `form` class to every eligible TOP-LEVEL `<section>`. Runs
 * FIRST, before the registry, so masthead-lift et al. see the class. Uses
 * the depth-aware splitSections walker, so it only
 * rewrites real slide sections — a raw `<section>` in slide content is nested
 * and left untouched. (lib/engine — which the emulator runs — applies this same
 * function in its renderHtml, before its registry pass.)
 */
function applyFormToggleToHtml(html, markdown) {
  const mode = readFormMode(markdown);
  if (mode === 'off') return html;
  return splitSections(html).map((p) => {
    if (p.type === 'gap') return p.text;
    const next = formToggleClass(p.cls, mode);
    if (next === p.cls) return p.openTag + p.inner + '</section>';
    const openTag = /\sclass="/.test(p.openTag)
      ? p.openTag.replace(/\sclass="[^"]*"/, ` class="${next}"`)
      : p.openTag.replace(/<section\b/, `<section class="${next}"`);
    return openTag + p.inner + '</section>';
  }).join('');
}

/**
 * Universal state-token marker decoder. Maps a single-char marker to the
 * semantic + shape classes the universal CSS recipe paints.
 *   [x] → pass + state-full · [-] → warn + state-half
 *   [ ] → fail + state-empty · [/] → skip + state-slashed
 */
function stateClassesFor(marker, neutralEmpty = false) {
  if (marker === 'x') return { sem: 'pass', shape: 'state-full' };
  if (marker === '-') return { sem: 'warn', shape: 'state-half' };
  if (marker === '/') return { sem: 'skip', shape: 'state-slashed' };
  // `[ ]` is overloaded: a NEUTRAL "todo / pending" in checklist (todo),
  // obligation-matrix (exempt) and roadmap (planned), but "not met" in
  // verdict-grid. neutralEmpty picks the neutral todo treatment (open ring);
  // the default keeps the not-met treatment (red ✕).
  return neutralEmpty
    ? { sem: 'todo', shape: 'state-todo' }
    : { sem: 'fail', shape: 'state-empty' };
}

/**
 * markdown-it plugin: wraps [x]/[-]/[ ]/[/] nested list items inside
 * `.verdict-grid` (and `.pricing`, which shares the nested-card-with-badges
 * shape — features per tier) sections in `<span class="badge {sem} {shape}">`.
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
      const text = token.children.map((c) => c.content || '').join('').trim();
      const m = /^\[([x\-/ ])\]\s*(.*)$/.exec(text);
      if (!m) continue;
      const { sem, shape } = stateClassesFor(m[1]);
      const htmlToken = new token.children[0].constructor('html_inline', '', 0);
      htmlToken.content = `<span class="badge ${sem} ${shape}">${m[2]}</span>`;
      token.children = [htmlToken];
    }
  });
}

/**
 * markdown-it plugin: wraps `[x]/[-]/[ ]/[/]` text inside <td> cells in
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
      const text = token.children.map((c) => c.content || '').join('').trim();
      const m = /^\[([x\-/ ])\]\s*(.*)$/.exec(text);
      if (!m) continue;
      const { sem, shape } = stateClassesFor(m[1], true); // obligation [ ] = exempt (neutral)
      const htmlToken = new token.children[0].constructor('html_inline', '', 0);
      htmlToken.content = `<span class="state ${sem} ${shape}">${m[2]}</span>`;
      token.children = [htmlToken];
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
 * text begins with `[x]/[-]/[ ]/[/]` with the state classes; strips the marker.
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
      const m = /^\[([x\-/ ])\]\s*/.exec(textChild.content);
      if (!m) {
        pendingItemOpen = null;
        continue;
      }
      const { sem, shape } = stateClassesFor(m[1], true); // checklist [ ] = todo (neutral)
      const stateClass = `state ${sem} ${shape}`;
      const cur = pendingItemOpen.attrGet('class');
      pendingItemOpen.attrSet('class', cur ? `${cur} ${stateClass}` : stateClass);
      textChild.content = textChild.content.slice(m[0].length);
      pendingItemOpen = null;
    }
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
  deckLogoInCorner,
  applyBackdropToHtml,
  FORM_MODES,
  FORM_TOGGLE_SKIP,
  FORM_TOGGLE_SKIP_FALLBACK,
  readFormMode,
  formToggleClass,
  applyFormToggleToHtml,
  stateClassesFor,
  verdictGridBadges,
  obligationMatrixBadges,
  matrixGridCells,
  checklistItemStates,
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
