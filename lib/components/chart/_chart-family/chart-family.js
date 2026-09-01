/**
 * Chart-family DOM transform — shared between the build path
 * (lattice-emulator.js) and the owned engine (lib/engine).
 *
 * Operates on rendered HTML strings so it can run in both contexts:
 *   - the emulator's per-slide HTML during PDF/HTML build
 *   - the marp-core engine's whole-render output for VS Code Marp preview
 *
 * This module is pure: no DOM, no markdown-it dependency. Inputs and outputs
 * are HTML strings.
 *
 * Why not a markdown-it ruler? The transform is structural (extract eyebrow
 * before h2, subtitle after h2, caption italic at the tail, rewrite the list
 * into chart-specific markup) and easier to express on rendered HTML than
 * on the token stream. The owned engine wraps `render`
 * and post-processes the resulting `html` string.
 *
 * Why ship through the engine instead of relying on a runtime <script>?
 * VS Code Marp preview filters HTML elements through Marp's allowlist,
 * which excludes <script> by default. Even with `markdown.marp.html: "all"`,
 * relative-path resolution and webview CSP made the runtime path unreliable.
 * The engine wrapper bakes the transform into the rendered HTML, so the
 * preview and the export pipelines see the same DOM.
 *
 * WHAT THIS FILE OWNS, AND WHAT IT NO LONGER DOES. It owns what is common to
 * every chart: the section walk, the dispatch, the chart-frame wrap (eyebrow /
 * h2 / subtitle, body, caption) and the idempotence guard. It owns NO per-chart
 * knowledge at all — no layout list, no kernel `require`, no adapter, no
 * figure-class alternation. Each chart declares those in its own manifest's
 * `kernel` block, `tools/build-chart-registry.js` freezes them into
 * ./chart-registry.generated.js, and this file reads that. A chart's DISPATCH AND
 * FRAMING are therefore a folder-drop plus `npm run build`; nothing here changes.
 * It used to take four hand-edits to this one file, which is the lock-step problem
 * the outer transformer registry had already solved one level up. (Dispatch and
 * framing, not the whole component — several other rosters are still
 * hand-maintained; design/skills/chart-component.md step 9 lists them.)
 * See engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md and
 * 2026-06-14-plugin-extension-system.md § Rollout Phase 1.
 *
 * THE KERNEL CONTRACT (the family's ratified `transformSection` entrypoint):
 *
 *   transformSection(html, ctx) -> html | { html, cls } | null
 *
 *   html  — the section's inner HTML. The kernel splices its figure in and
 *           returns the whole section; it does not return the figure alone.
 *   ctx   — { cls, classTokens, orientation, utils }.
 *           `orientation` is the deck-wide stamp ('portrait' | 'square' |
 *           undefined for landscape) read off the section's `data-orientation`
 *           — the single source both render paths already carry. Charts whose
 *           layout is baked into an SVG/viewBox use it to emit a tall
 *           composition for a portrait box (2026-06-19-chart-adaptive-sizing.md
 *           §7). `utils` carries the shared section helpers so a dropped-in
 *           kernel takes them off its argument instead of guessing a relative
 *           path.
 *   return — the rewritten section HTML; `{ html, cls }` when the kernel must
 *           also change the section's class list (roadmap auto-selects
 *           `horizons` on a portrait deck, and the card CSS is gated on the
 *           section class); or the html unchanged / null to pass through.
 *
 *   Idempotence is the FAMILY's job, not the kernel's: transformChartSection
 *   early-returns on a section already carrying `chart-frame`.
 */

// The frozen dispatch table, generated from every chart manifest's `kernel`
// block. Generated rather than scanned because this module is bundled by
// esbuild into the runtime, the emulator and five docs-site bundles, and a
// bundler cannot follow `require(templateLiteral)` — a directory scan would
// leave every kernel out of every bundle. Discovery is an authoring-time
// convenience; it is never paid at render time (LPM § Performance).
const { LAYOUTS, FIGURE_CLASSES, KERNELS } = require('./chart-registry.generated');

const CHART_LAYOUTS = LAYOUTS;

const { setRenderSection } = require('../../../core/render-ids');
const { peelCoda } = require('../../../core/coda');

// The section walker + the depth-aware close scan the chart-frame wrap needs.
// (Both live in lib/core so core primitives never import a component kernel.)
const { mapSections } = require('../../../core/section-walk');
const { findMatchingClose } = require('../../../core/find-matching-close');
const { extractFirstList, parseTopLevelLis } = require('../../../core/html-lists');

// Handed to every kernel on `ctx.utils` — see the contract above.
const {
  escAttr, escHtml, plainText, spliceFirstList, stripTrailingPills, readsHandBody,
} = require('./transform-utils');

const KERNEL_UTILS = Object.freeze({
  escAttr, escHtml, plainText,
  spliceFirstList, stripTrailingPills, readsHandBody,
  extractFirstList, parseTopLevelLis, findMatchingClose,
});

// ── The chart-frame wrap (eyebrow / h2 / subtitle, body, caption) ──────────

// The figure the wrap looks for, as an alternation of every declared
// `kernel.figureClass`. This used to be a literal regex naming all fourteen —
// the fourth of the four hand-edits adding a chart cost, and the one whose
// omission failed silently: the kernel ran, the figure was built, and the
// section rendered it full-bleed with no frame. Built once at module load; the
// class names come from the schema's kebab-case pattern, so nothing here can
// smuggle regex metacharacters in.
const BODY_RE = new RegExp(
  `<div\\s+class="(?:${FIGURE_CLASSES.join('|')})"[^>]*>`);

// Locate the h2 and the figure div the kernel emitted, then find the
// figure's matching </div> by depth. Returns null when either is missing
// (the section wasn't a well-formed chart — caller falls back untransformed).
function extractChartBody(html) {
  const h2Match = /<h2[^>]*>[\s\S]*?<\/h2>/.exec(html);
  const bodyMatch = h2Match && BODY_RE.exec(html.slice(h2Match.index + h2Match[0].length));
  if (!h2Match || !bodyMatch) return null;

  const h2El = h2Match[0];
  const beforeH2 = html.slice(0, h2Match.index);
  const afterH2 = html.slice(h2Match.index + h2El.length);
  const bodyStart = bodyMatch.index;
  // Depth-aware close-tag scan to find the matching </div> for chart-body.
  const end = findMatchingClose(afterH2, 'div', bodyStart);
  if (end <= 0) return null;

  return {
    h2El,
    beforeH2,
    between: afterH2.slice(0, bodyStart),
    bodyHtml: afterH2.slice(bodyStart, end),
    afterBody: afterH2.slice(end),
  };
}

// A trailing single-pill paragraph right before the h2 becomes the eyebrow.
function liftChartEyebrow(beforeH2) {
  const eyeMatch = beforeH2.match(/<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>\s*$/);
  if (!eyeMatch) return { eyebrowEl: '', beforeRest: beforeH2 };
  return {
    eyebrowEl: `<p class="chart-eyebrow"><code>${eyeMatch[1]}</code></p>`,
    beforeRest: beforeH2.slice(0, eyeMatch.index),
  };
}

// The first paragraph between the h2 and the figure becomes the subtitle.
function liftChartSubtitle(between) {
  const subMatch = between.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  return subMatch ? `<p class="chart-subtitle">${subMatch[1]}</p>` : '';
}

// A trailing paragraph after the figure becomes the caption (unwrapping a
// full-body <em>). A `_footer` directive makes Marpit append
// `<footer>…</footer>` after the user's trailing caption paragraph, so the
// caption is no longer at the end of afterBody — the `\s*$` anchor would
// miss it and the caption would fall through as a raw full-width <p> at the
// slide edge (engineering/gotchas.md "Chart caption swallowed when _footer
// is set"). Peel a trailing <footer> off first, match the caption against
// the remainder, then re-append the footer so its order is preserved.
function liftChartCaption(afterBody) {
  const footerM = afterBody.match(/\s*<footer\b[\s\S]*?<\/footer>\s*$/);
  const trailingFooter = footerM ? footerM[0] : '';
  const captionScope0 = footerM ? afterBody.slice(0, footerM.index) : afterBody;
  // The universal CODA cell is the SAME hazard as the footer above, for the same
  // reason: it sits after the author's caption paragraph, so the `\s*$` anchor
  // misses and the caption falls through as a raw full-width <p>. Peel it beside the
  // footer and re-append it. Latent before the coda existed (a bare trailing
  // blockquote defeated the anchor the same way), but a chart can now host a Key
  // Insight, so the combination is reachable rather than theoretical
  // (engineering/decisions/2026-08-24-universal-coda-cell.md).
  const { rest: captionScope, coda } = peelCoda(captionScope0);
  const capMatch = captionScope.match(/<p[^>]*>([\s\S]*?)<\/p>\s*$/);
  if (!capMatch) return { captionEl: '', afterRest: afterBody };
  let cap = capMatch[1];
  const emM = cap.match(/^<em>([\s\S]*)<\/em>$/);
  if (emM) cap = emM[1];
  return {
    captionEl: `<p class="chart-caption">${cap}</p>`,
    afterRest: captionScope.slice(0, capMatch.index) + coda + trailingFooter,
  };
}

/**
 * Transform a single section's inner HTML for the given chart layout.
 *
 * @param {string} innerHtml — the section's inner HTML (between <section> tags)
 * @param {string} cls — the section's space-separated class list
 * @param {string} [orientation] — the deck-wide 'portrait' | 'square' stamp
 * @returns {{ html: string, cls: string, transformed: boolean }}
 *          transformed=false if the layout is not a chart layout, or the
 *          section is missing the required h2/list — the inputs are returned
 *          verbatim and the caller should not splice anything back.
 */
function transformChartSection(innerHtml, cls, orientation) {
  const classTokens = String(cls).trim().split(/\s+/);
  const chartLayout = CHART_LAYOUTS.find(l => classTokens.includes(l));
  if (!chartLayout) return { html: innerHtml, cls, transformed: false };
  // Idempotency: a section already wrapped in chart-frame is a no-op.
  if (classTokens.includes('chart-frame')) return { html: innerHtml, cls, transformed: false };

  // The engine's renderer adds id="..." to headings and may add attributes
  // to <ul>/<ol>; the kernels' regexes all tolerate optional attributes on
  // the opening tag. Lattice's own emulator emits attribute-free tags so
  // the same patterns work for both render paths.
  const built = KERNELS[chartLayout].transformSection(
    innerHtml, { cls, classTokens, orientation, utils: KERNEL_UTILS });
  // The ratified return shape: a string, `{ html, cls }` when the kernel also
  // changes the section's class list (roadmap), or null to pass through.
  let html = built;
  if (built == null) return { html: innerHtml, cls, transformed: false };
  if (typeof built === 'object') { html = built.html; cls = built.cls; }

  // Wrap in chart-frame skeleton (eyebrow / h2 / subtitle, body, caption).
  const parts = extractChartBody(html);
  if (!parts) return { html: innerHtml, cls, transformed: false };

  const { eyebrowEl, beforeRest } = liftChartEyebrow(parts.beforeH2);
  const subtitleEl = liftChartSubtitle(parts.between);
  const { captionEl, afterRest } = liftChartCaption(parts.afterBody);

  // .viz-frame merge (2026-07-15-viz-frame-merge.md): emit eyebrow + h2 + subtitle as
  // TOP-LEVEL section chrome (no `.chart-header` wrapper) so the standard masthead
  // transform — which runs AFTER this and now treats `chart-frame` as a wrapping Form —
  // hoists them into `.cell-masthead > .masthead-lede` and wraps the figure + caption
  // into `.cell-stage`, the SAME Frame/Cell structure diagram uses. Charts are not
  // special: their header/eyebrow/subtitle are ordinary chrome. The `.chart-body`
  // wrapper is kept (canvas styling scopes to it, now nested inside `.cell-stage`); the
  // caption stays component-owned in the stage with the figure (§3, not hoisted).
  const newHtml = beforeRest +
    eyebrowEl + parts.h2El + subtitleEl +
    `<div class="chart-body">` + parts.bodyHtml + `</div>` +
    captionEl +
    afterRest;

  const newCls = classTokens.includes('chart-frame')
    ? cls
    : (cls + ' chart-frame').trim();

  return { html: newHtml, cls: newCls, transformed: true };
}

/**
 * Transform every chart-family `<section>` in a Marpit `render()` HTML output.
 * Used by the owned engine (lib/engine) so the preview
 * renders the same DOM the export pipeline does, without any runtime script.
 *
 * The regex finds Marpit's slide sections — `<section id="N" ... class="..."
 * data-lattice-slide="N" ...>...</section>` — and rewrites those whose class
 * list contains a chart layout token. Sections that don't match a chart
 * layout pass through unchanged.
 */
function applyToRenderedHtml(html) {
  // SECTION ORDINAL, counted over EVERY top-level section — not just the chart-bearing ones. It
  // scopes the `<defs>` ids this transform mints to the shown slide's absolute deck position
  // (lib/core/render-ids.js), which is what makes a slide rendered ALONE emit the same ids as that
  // slide inside its deck. Counting only chart sections would number them 1,2,3… and a slice would
  // land on a different slide than the deck did.
  let sectionIndex = -1;
  try {
  const out = mapSections(html, (openTag, cls, inner) => {
    sectionIndex += 1;
    setRenderSection(sectionIndex);
    const classTokens = cls.trim().split(/\s+/);
    if (!CHART_LAYOUTS.some(l => classTokens.includes(l))) return null;
    // Deck-wide orientation stamp (absent → landscape, byte-identical). Read off
    // the same `data-orientation` the slide pipeline already wrote on the section.
    const orientMatch = openTag.match(/\sdata-orientation="([^"]*)"/);
    const orientation = orientMatch ? orientMatch[1] : undefined;
    const { html: newInner, cls: newCls, transformed } = transformChartSection(inner, cls, orientation);
    if (!transformed) return null;
    // Rebuild the open tag with the updated class attribute.
    const newOpenTag = /\sclass="[^"]*"/.test(openTag)
      ? openTag.replace(/\sclass="[^"]*"/, ` class="${escAttr(newCls)}"`)
      : openTag.replace(/<section/, `<section class="${escAttr(newCls)}"`);
    return { openTag: newOpenTag, inner: newInner };
  });
  return out;
  } finally {
  // LEAVE SLIDE SCOPE. `slide` is module state, and leaving it set means the NEXT mint in this
  // process — the browser runtime's DOM pass, which never calls `resetRenderIds` — would silently
  // inherit the last section number of whatever document was rendered before it, instead of the
  // bare document-start ordinal it is supposed to get. Measured before this line existed: a mint
  // straight after a two-section render returned `2-3`. The same class as this module's own
  // "renderHtml must not be RE-ENTERED" note: per-render state has to be released, not just set.
  // FINALLY, not a trailing statement. A throw anywhere in the walk would otherwise leave `slide`
  // set and re-open the exact leak this release exists to close — and the happy-path test would
  // still be green. No chart kernel was found that throws (25 layouts x 9 malformed bodies, 0
  // throws), so this guards a path nobody could reach today; that is when it is cheap to close.
  setRenderSection(null);
  }
}

// Per-chart builders are NOT re-exported here. They live in their own kernels
// now (`lib/components/chart/<name>/<name>.transform.js`), and a re-export would
// put the list of chart names back in this file — the exact coupling the
// registry removes. Tests import the kernel they are testing.
module.exports = {
  CHART_LAYOUTS,
  FIGURE_CLASSES,
  KERNELS,
  KERNEL_UTILS,
  transformChartSection,
  applyToRenderedHtml,
  // Exposed for unit tests
  parseTopLevelLis,
  extractFirstList,
};
