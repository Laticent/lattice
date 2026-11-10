/**
 * The chart frame: the host's half of drawing a chart slide (engineering/decisions/2026-11-02-slide-facts-for-kinds.md
 * §4, §5).
 *
 * The chart family plugin draws each kind's figure; the host owns everything common to every chart, which used to
 * sit in the plugin's dispatch module: the section walk, the record bridging (the pill pass's stamps, read and
 * settled through lib/core/chart-rows.js), the chart-frame wrap (eyebrow, h2, subtitle, body, caption), the
 * idempotence guard, the render-scoped section index ids are minted under, and the kinds a render could not draw
 * yet. The plugin is reached only through the generated dispatch table, so nothing here names a chart.
 *
 * Operates on rendered HTML strings, so the engine, the CLI and the runtime share it. Pure: no DOM, no
 * markdown-it.
 */

const chart = require('../plugins/dispatch.generated.js').DISPATCH['chart-family'];
const { setRenderSection } = require('../core/render-ids');
const { peelCoda } = require('../core/coda');
const { PROSE_ATTR, isProse } = require('../core/prose-code');
const { bridgeRecordsHtml, unstamp, RECORD_ATTR } = require('../core/chart-rows');
const { findMatchingClose, mapSections } = require('@laticent/markup');
const { chartTextScale, chartTextCanvas, keepsEveryLabel } = require('./chart-text-venue');
const { venueOfTokens } = require('../core/resolve-venue');

const { CHART_LAYOUTS, FIGURE_CLASSES, KERNELS } = chart;
const PLUGIN = chart.CHART_PLUGIN;
const STAMP = `<code ${RECORD_ATTR}="">`; // the exact bytes the pill pass writes; the same bytes inside an author's own raw HTML attribute would be rewritten too (a deck holding that exact text is the only one affected)

/** An attribute value: the five entities, apostrophe included (the class rebuild below decodes them back). */
function escAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// The five entities escAttr writes, read back (applyToRenderedHtml's class rebuild).
const ATTR_DECODE = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" });

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
//
// A PANE has no h2 of its own — the host slide owns the only title — so with `headless` set
// (the section carries a pane canvas, `data-pane-view`) a missing h2 frames the figure against
// the section's start instead of refusing it. An ordinary chart slide with no heading still
// refuses, and renders untransformed exactly as before.
function extractChartBody(html, headless = false) {
  const found = /<h2[^>]*>[\s\S]*?<\/h2>/.exec(html);
  const h2Match = found || (headless ? { index: 0, 0: '' } : null);
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

// The `data-prose` mark (lib/core/prose-code.js, #2308) for a lifted paragraph. The
// lift REBUILDS the `<p>`, so the mark markdown-it stamped on the source is carried
// across; and the caption lift also unwraps a full-body `<em>`, which markdown-it
// never marked (an `em` child is "another element" to it), so the fact is decided
// again on the unwrapped content with the same predicate. Without it a caption that
// holds one code span and prose matched the eyebrow rule's `code:only-child` —
// `:only-child` cannot see text — and its chip set as an uppercase kicker.
function proseAttr(srcAttrs, inner) {
  if (new RegExp(`\\s${PROSE_ATTR}(?=[\\s=>]|$)`).test(srcAttrs)) return ` ${PROSE_ATTR}`;
  // The DOM adapter's population: text and code spans only. Any other element means
  // `code:only-child` cannot match, so there is nothing to mark.
  const parts = [];
  // A comment is matched whole BEFORE the generic tag, so a `>` inside it does not end it
  // early and leave its tail reading as prose (markTokens reads the comment as nothing).
  const re = /<!--[\s\S]*?-->|<code\b[^>]*>[\s\S]*?<\/code>|<[^>]+>|[^<]+/g;
  for (const m of inner.match(re) || []) {
    if (m.startsWith('<code')) parts.push({ code: true });
    else if (m.startsWith('<')) {
      if (m.startsWith('<!--')) continue;
      return '';
    } else parts.push({ code: false, text: m });
  }
  return isProse(parts) ? ` ${PROSE_ATTR}` : '';
}

// The HTML comments between the h2 and the chart body — a speaker note written under the
// title. Only the subtitle is lifted from that stretch, so everything else in it was
// dropped, and a note written there never reached the export's notes. Collected by
// scanning for the delimiters (as lib/core/pane-css.js `paneClasses` does), not by a
// pattern over them.
function commentsIn(html) {
  let out = '';
  for (let open = html.indexOf('<!--'); open >= 0; open = html.indexOf('<!--', open + 4)) {
    const close = html.indexOf('-->', open + 4);
    if (close < 0) break;
    out += html.slice(open, close + 3);
    open = close;
  }
  return out;
}

//
// Every LATER paragraph in that stretch is the chart's lead: it renders as written, in order,
// above the figure (`.chart-lead`). The wrap used to keep the first paragraph alone and drop
// the rest, on a chart slide and in a chart pane alike, with no warning.
//
// TOP-LEVEL blocks, found by depth, never by a bare `<p` pattern. A bare `<p[^>]*>`
// also matches `<pre>` (and `<path>`, `<picture>`), and with the global flag it lifted half a
// code block into a lead and left a stray `</pre>` (the checker's reproduction; masthead.
// transform.js extractSubtitleP documents the same trap). A paragraph inside a blockquote or a
// raw `<div>` belongs to that block and travels with it. The first top-level paragraph is the
// subtitle, as before.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Every OTHER top-level block in that stretch — a code block, a blockquote, a table, raw HTML —
// renders too, in the order it was written, inside a `div.chart-lead-block`. The wrap kept
// paragraphs only and dropped the rest without a word (2376-p2-size-chart-viewbox-to-the-pane.md);
// a census of the 309 shipped decks found none, so no committed slide changes. The block is kept
// whole — its own markup, not re-parsed — and the wrapper is the one hook styling and the
// carousel split (lib/core/carousel.js, which keeps it on the first page) need.
function topLevelBlocks(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let depth = 0;
  let open = null;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!m[2]) continue; // a comment: `commentsIn` keeps those
    const tag = m[2].toLowerCase();
    // A trailing `/` closes a VOID tag only. HTML has no self-closing `<div/>` or `<p/>`: the
    // parser opens the element there, so emitting one inside the wrapper left the wrapper open and
    // the chart body inside it (the checker's reproduction). An empty self-closed non-void tag is
    // skipped, as the wrap always did; it opens no depth, so it cannot swallow what follows.
    if (!VOID_TAGS.has(tag) && !m[1] && /\/\s*$/.test(m[3])) continue;
    const selfClosed = VOID_TAGS.has(tag);
    if (m[1]) {
      depth = Math.max(0, depth - 1);
      if (open && depth === 0 && tag === open.tag) {
        out.push({ tag, attrs: open.attrs, inner: html.slice(open.innerAt, m.index), outer: html.slice(open.at, m.index + m[0].length) });
        open = null;
      }
      continue;
    }
    if (selfClosed) {
      if (depth === 0) out.push({ tag, attrs: m[3] || '', inner: '', outer: m[0] });
      continue;
    }
    if (depth === 0) open = { tag, attrs: m[3] || '', at: m.index, innerAt: m.index + m[0].length };
    depth++;
  }
  return out;
}

function liftChartSubtitle(between) {
  const blocks = topLevelBlocks(between);
  const first = blocks.find((b) => b.tag === 'p');
  if (!first) {
    return { subtitleEl: '', leadEls: blocks.map((b) => `<div class="chart-lead-block">${b.outer}</div>`).join('') };
  }
  return {
    subtitleEl: `<p class="chart-subtitle"${proseAttr(first.attrs, first.inner)}>${first.inner}</p>`,
    leadEls: blocks.filter((b) => b !== first).map((b) => (b.tag === 'p'
      ? `<p class="chart-lead"${proseAttr(b.attrs, b.inner)}>${b.inner}</p>`
      : `<div class="chart-lead-block">${b.outer}</div>`)).join(''),
  };
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
  const capMatch = captionScope.match(/<p([^>]*)>([\s\S]*?)<\/p>\s*$/);
  if (!capMatch) return { captionEl: '', afterRest: afterBody };
  let cap = capMatch[2];
  // Unwrap only a caption that is ONE `<em>`. `*a* and *b*` also starts with `<em>` and
  // ends with `</em>`, and the greedy match used to strip the outer pair of two runs,
  // leaving `a</em> and <em>b`.
  const emM = cap.match(/^<em>([\s\S]*)<\/em>$/);
  if (emM && !/<\/?em\b/.test(emM[1])) cap = emM[1];
  return {
    captionEl: `<p class="chart-caption"${proseAttr(capMatch[1], cap)}>${cap}</p>`,
    afterRest: captionScope.slice(0, capMatch.index) + coda + trailingFooter,
  };
}

/**
 * What a chart slide carries around its figure, read BEFORE the kernel draws (the wrap below reads the same parts
 * after): characters in the title and the subtitle, and whether an eyebrow and a source line are present. These set
 * how much shorter the chart's box gets at a venue (lib/transformers/chart-text-venue.js `boxHeight`). The data block is the
 * first top-level list or table after the title; the subtitle is the first paragraph before it, the source line a
 * paragraph after it, the eyebrow a single-pill paragraph right before the title, as the lifts read them.
 */
function slideChrome(html) {
  // Found by index, not by pattern: these run on every chart slide, and the census holds this file's slow patterns.
  const open = html.indexOf('<h2');
  const start = open < 0 ? -1 : html.indexOf('>', open) + 1;
  const end = start > 0 ? html.indexOf('</h2>', start) : -1;
  if (end < 0) return null;
  // Characters as written: tags out, runs of space as one (an entity counts as its few characters, which errs long).
  const chars = (s) => {
    let n = 0;
    let inTag = false;
    let space = true;
    for (const c of s) {
      if (c === '<') inTag = true;
      else if (c === '>') inTag = false;
      else if (!inTag) {
        const ws = c === ' ' || c === '\n' || c === '\t' || c === '\r';
        if (!ws || !space) n += 1;
        space = ws;
      }
    }
    return space && n > 0 ? n - 1 : n;
  };
  const blocks = topLevelBlocks(html.slice(end + 5));
  const dataAt = blocks.findIndex((b) => b.tag === 'ul' || b.tag === 'ol' || b.tag === 'table');
  const subtitle = blocks.slice(0, dataAt < 0 ? 0 : dataAt).find((b) => b.tag === 'p');
  return {
    title: chars(html.slice(start, end)),
    eyebrow: !!liftChartEyebrow(html.slice(0, open)).eyebrowEl,
    subtitle: subtitle ? chars(subtitle.inner) : 0,
    caption: dataAt >= 0 && blocks.slice(dataAt + 1).some((b) => b.tag === 'p'),
  };
}

/**
 * Transform a single section's inner HTML for the given chart layout.
 *
 * @param {string} innerHtml — the section's inner HTML (between <section> tags)
 * @param {string} cls — the section's space-separated class list
 * @param {string} [orientation] — the deck-wide 'portrait' | 'square' stamp
 * @param {{w:number,h:number}} [paneView] — a pane's canvas in slide chart units
 * @param {Set<string>|null} [pluginsOff] — the plugins this deck did not load, for a kernel that
 *          asks a plugin's services (lib/core/plugin-services.js), as the flowchart asks `icons`
 * @param {number} [aspect] — the slide's width over height when it is not 16:9 (the section's
 *          `data-aspect`); absent means 16:9. A chart that picks a layout by the plot it leaves reads it
 * @returns {{ html: string, cls: string, transformed: boolean, bridged?: string }}
 *          transformed=false if the layout is not a chart layout, or the
 *          section is missing the required h2/list — the inputs are returned
 *          verbatim and the caller should not splice anything back, except `bridged`:
 *          the list with its `{…}` records rewritten to the spans a chart would have read,
 *          present only when that differs from the input.
 */
function transformChartSection(innerHtml, cls, orientation, paneView, pluginsOff = null, aspect = undefined) {
  const classTokens = String(cls).trim().split(/\s+/);
  const chartLayout = CHART_LAYOUTS.find(l => classTokens.includes(l));
  if (!chartLayout) return { html: innerHtml, cls, transformed: false };
  // Idempotency: a section already wrapped in chart-frame is a no-op, except that a record claimed on it is still bridged
  // (an author can write the class by hand): no stamp may survive and no brace may show.
  if (classTokens.includes('chart-frame')) {
    const bridgedFrame = bridgeRecordsHtml(innerHtml, classTokens);
    return bridgedFrame === innerHtml ? { html: innerHtml, cls, transformed: false } : { html: innerHtml, cls, transformed: false, bridged: bridgedFrame };
  }
  // A kernel that is not here yet. Node and the single-file bundles carry every kernel, so this
  // never fires there. The docs site's ESM engine loads kernels on demand (engineering/decisions/
  // 2026-10-14-engine-spine.md §3.2): it loads the ones a deck names before rendering, and a miss
  // is recorded so the host loads it and renders again, instead of the render throwing.
  if (!KERNELS[chartLayout]) {
    missingKernels.add(chartLayout);
    return { html: innerHtml, cls, transformed: false };
  }

  // A data row written as ONE `{…}` record is rewritten to the spans every kernel below reads
  // (lib/core/chart-rows.js `bridgeRecordsHtml`). Here, so the engine and the runtime share it.
  // A native chart (`rows.native`) keeps its claimed record: its kernel reads the fields itself (`takeRecord`), and the
  // settled form below is what a declined slide shows.
  const rowsHtml = bridgeRecordsHtml(innerHtml, classTokens, { keep: true });
  const settled = () => { const out = bridgeRecordsHtml(innerHtml, classTokens); return out === innerHtml ? undefined : out; };

  // The engine's renderer adds id="..." to headings and may add attributes
  // to <ul>/<ol>; the kernels' regexes all tolerate optional attributes on
  // the opening tag. Lattice's own emulator emits attribute-free tags so
  // the same patterns work for both render paths.
  // The plugin's `run` brackets the label-drop record around the whole drawing (#2171,
  // chart-family.dispatch.js) and hands back its encoded drops; this frame writes them
  // as `data-label-drops`. The component name comes from here too: `buildCategoryLabels`
  // is shared by several kinds and does not know its caller; this frame does.
  // The venue's chart-text factor (lib/transformers/chart-text-venue.js): the kernel draws on a canvas this many times
  // smaller, so its labels print larger as the room grows instead of shrinking with the box. 1 at laptop. A slide's
  // own title, eyebrow, subtitle and source line set how much box the venue takes.
  // `textCanvas` is the slide's box in those smaller units, for a keyed chart's key fit (svg-legend.js `fitKeyToPane`).
  const chrome = paneView ? null : slideChrome(rowsHtml);
  // A pane, and any slide that is not landscape 16:9 (an orientation or aspect stamp), keeps 1 for now: the box model
  // is measured on a 1280-wide landscape slide, and the factor cut a pane's category names and overlapped text on
  // portrait, square and 4:3 slides (followups.d/3098-p1-chart-text-venue-remaining-kinds.md).
  const fullScale = paneView || orientation || aspect ? 1 : chartTextScale(classTokens, chrome);
  const drawAt = (k) => chart.run(chartLayout, rowsHtml, {
    cls, classTokens, orientation, aspect, paneView, pluginsOff,
    textScale: k, textCanvas: chartTextCanvas(k, { classTokens, chrome, orientation, aspect, paneView }),
  });
  // THE GUARD (chart-text-venue.js `keepsEveryLabel`): a venue drawing must cost nothing the factor-1 drawing printed,
  // no name cut to "…", no label dropped, no smaller unit. The factor steps down until one passes, else factor 1.
  let { built, drops } = drawAt(1);
  if (fullScale > 1 && built != null) {
    const htmlOf = (b) => (typeof b === 'object' ? b.html : b);
    const base = { html: htmlOf(built), drops };
    const venue = venueOfTokens(classTokens);
    for (const f of [1, 0.75, 0.5, 0.25]) {
      const k = Math.round((1 + (fullScale - 1) * f) * 100) / 100;
      if (k < 1.1) break;
      const cand = drawAt(k);
      if (cand.built != null && keepsEveryLabel(base, { html: htmlOf(cand.built), drops: cand.drops }, { venue, chrome })) {
        ({ built, drops } = cand);
        break;
      }
    }
  }
  // The ratified return shape: a string, `{ html, cls }` when the kernel also
  // changes the section's class list (roadmap), or null to pass through.
  let html = built;
  // A chart that declines the slide leaves the author's list on the page. A record row there shows the list
  // the old spans would have shown (`bridged`), not its braces: the pill pass left the record alone.
  if (built == null) return { html: innerHtml, cls, transformed: false, bridged: settled() };
  if (typeof built === 'object') { html = built.html; cls = built.cls; }

  // Wrap in chart-frame skeleton (eyebrow / h2 / subtitle, body, caption).
  const parts = extractChartBody(html, !!paneView);
  if (!parts) return { html: innerHtml, cls, transformed: false, bridged: settled() };

  // Heading-less (a pane) lifts exactly as a headed slide does: the eyebrow and subtitle keep
  // their chart-frame styling, with no h2 between them. A pane has no masthead, so the masthead
  // transform leaves them in the body, where the stand-in heading's masthead used to hand them back.
  const { eyebrowEl, beforeRest } = liftChartEyebrow(parts.beforeH2);
  const { subtitleEl, leadEls } = liftChartSubtitle(parts.between);
  const { captionEl, afterRest } = liftChartCaption(parts.afterBody);

  // .viz-frame merge (2026-07-15-viz-frame-merge.md): emit eyebrow + h2 + subtitle as
  // TOP-LEVEL section chrome (no `.chart-header` wrapper) so the standard masthead
  // transform — which runs AFTER this and now treats `chart-frame` as a wrapping Form —
  // hoists them into `.cell-masthead > .masthead-lede` and wraps the figure + caption
  // into `.cell-stage`, the SAME Frame/Cell structure diagram uses. Charts are not
  // special: their header/eyebrow/subtitle are ordinary chrome. The `.chart-body`
  // wrapper is kept (canvas styling scopes to it, now nested inside `.cell-stage`); the
  // caption stays component-owned in the stage with the figure (§3, not hoisted).
  // The drops ride the `.chart-body` as an attribute rather than a return field.
  // Two reasons. It survives the browser boundary for free — the CLI renders in a
  // puppeteer page and the Studio in an iframe, and both already read per-slide
  // facts off the DOM — and it costs a golden-file diff on exactly the slides that
  // drop something, which the corpus census says is none of ours.
  const dropAttr = drops
    ? ` data-label-drops="${drops}" data-label-drops-component="${chartLayout}"`
    : '';
  // A stamp the kernel did not take (a claimed record outside the rows it drew) must not reach the page.
  const newHtml = unstamp(beforeRest +
    eyebrowEl + parts.h2El + subtitleEl + commentsIn(parts.between) + leadEls +
    `<div class="chart-body"${dropAttr}>` + parts.bodyHtml + `</div>` +
    captionEl +
    afterRest);

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
 *
 * `off` — the plugin that offers the kernel slot (`PLUGIN`, the chart family) is
 * switched off for this render (plugin-system §5, phase F). Every chart section
 * then passes through as authored, its list or table in the ordinary slide frame,
 * and its open tag carries `data-lattice-off="<plugin>"` — the engine's marker for
 * "a plugin this deck did not load owns this" (spec/LPM.md §3.2.1) — so the
 * runtime's DOM pass, which would otherwise build it, leaves it alone too.
 */
function applyToRenderedHtml(html, { off = false, pluginsOff = null } = {}) {
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
    if (off) {
      // Once: a second pass over the same HTML must not stack the attribute (red team).
      if (/\sdata-lattice-off=/.test(openTag)) return null;
      // The chart is not drawn, so a row record the pill pass left alone shows as its rows, not as raw braces.
      return { openTag: openTag.replace(/<section/, `<section data-lattice-off="${PLUGIN}"`), inner: bridgeRecordsHtml(inner, classTokens) };
    }
    // Deck-wide orientation stamp (absent → landscape, byte-identical). Read off
    // the same `data-orientation` the slide pipeline already wrote on the section.
    const orientMatch = openTag.match(/\sdata-orientation="([^"]*)"/);
    const orientation = orientMatch ? orientMatch[1] : undefined;
    // A PANE's canvas in slide chart units (lib/engine/index.js `paneView`); absent on every
    // ordinary slide, so no kernel sees it and nothing there moves.
    const viewMatch = openTag.match(/\sdata-pane-view="([\d.]+) ([\d.]+)"/);
    const paneView = viewMatch ? { w: Number(viewMatch[1]), h: Number(viewMatch[2]) } : undefined;
    const aspectMatch = openTag.match(/\sdata-aspect="([\d.]+)"/);
    const aspect = aspectMatch ? Number(aspectMatch[1]) : undefined;
    const { html: newInner, cls: newCls, transformed, bridged } = transformChartSection(inner, cls, orientation, paneView, pluginsOff, aspect);
    if (!transformed) return bridged ? { openTag, inner: bridged } : null;
    // Rebuild the open tag with the updated class attribute. The class arrives as the attribute's
    // ESCAPED text, so it is decoded once before it is escaped again; escaping it as it came wrote
    // an author's `x&y` as `x&amp;amp;y`.
    const cls2 = escAttr(String(newCls).replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ATTR_DECODE[e]));
    const newOpenTag = /\sclass="[^"]*"/.test(openTag)
      // Functions: the class list carries the author's `_class:` tokens, and a `$\`` in one
      // would paste the tag's own prefix into the attribute.
      ? openTag.replace(/\sclass="[^"]*"/, () => ` class="${cls2}"`)
      : openTag.replace(/<section/, () => `<section class="${cls2}"`);
    return { openTag: newOpenTag, inner: newInner };
  });
  // A claimed record never reaches the page as a stamp, whatever path left it: the bridge strips it where it runs,
  // and this strips one on a section the chart family never reached (a layout it does not draw).
  return out.includes(STAMP) ? out.split(STAMP).join('<code>') : out;
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
// The chart layouts a render dispatched with no kernel loaded, since the last take. Only the docs
// site's ESM engine can fill it (see transformChartSection).
const missingKernels = new Set();
/** The layouts that were missing a kernel since the last call, and clear the record. */
function takeMissingKernels() {
  const out = [...missingKernels];
  missingKernels.clear();
  return out;
}


module.exports = {
  CHART_LAYOUTS,
  CHART_PLUGIN: PLUGIN,
  FIGURE_CLASSES,
  KERNELS,
  transformChartSection,
  takeMissingKernels,
  applyToRenderedHtml,
};
