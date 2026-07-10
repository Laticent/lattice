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
 * Two baked sets (the kernel is bundled into the runtime, which can't fs-load the
 * manifests; a drift test in test/unit/transformers asserts they can't fall out of
 * sync with the manifest source of truth):
 *   · ALL_LAYOUTS — every component layout name. Used to tell a "bare" generic
 *     slide (no layout token → always wrap) from a component slide.
 *   · STAGE_MIGRATED — the layouts whose CSS has been codemodded to address the
 *     `.cell-stage` cell. `content` (generic prose) is migrated; each standard
 *     component JOINS this set as it is migrated. A component NOT in it keeps its
 *     direct-child `section.X > …` bodies and is left unwrapped — so an
 *     un-migrated (or brand-new) component is never silently broken.
 */
const ALL_LAYOUTS = new Set([
  'actors', 'agenda', 'authority-chain', 'big-number', 'cards-grid', 'cards-stack',
  'checklist', 'citation-card', 'closing', 'code', 'compare-code', 'compare-prose',
  'compare-table', 'contact', 'content', 'decision', 'diagram', 'divider', 'funnel', 'gantt',
  'glossary', 'image', 'inventory', 'journey', 'kanban', 'kpi', 'list', 'list-criteria',
  'list-steps', 'list-tabular', 'logo-wall', 'map', 'math', 'matrix-2x2',
  'obligation-matrix', 'piechart', 'pricing', 'progress', 'q-and-a', 'quadrant',
  'quote', 'radar', 'redline', 'regulatory-update', 'roadmap', 'split-compare',
  'split-panel', 'state-chart', 'stats', 'statute-stack', 'timeline-list', 'title',
  'verdict-grid', 'video', 'wifi', 'word-cloud',
]);

// Layouts whose CSS addresses the frame's `.cell-stage` cell (migrated). Grows
// one entry per component as the cell-tree migration lands (flex cell-tree §6).
const STAGE_MIGRATED = new Set([
  'content',     // generic prose
  'cards-grid',
  'list',
  'glossary',
  'matrix-2x2',
  'pricing',
  'agenda',
  'logo-wall',
  'regulatory-update',
  'compare-table',
  'list-tabular',
  'stats',
  'big-number',
  'quote',
  'decision',
  'q-and-a',
  'list-steps',
  'list-criteria',
  'obligation-matrix',
  'citation-card',
  'kpi',
  'cards-stack',
  'actors',
  'checklist',
  'authority-chain',
  'statute-stack',
  'verdict-grid',
  'compare-prose',
  'redline',       // the diff component (default + annotated/three-col/split/stacked variants)
  'code',
  'inventory',     // the inventory component (default ledger + cards/timeline/editorial variants)
]);

// Layouts that get the masthead band but INTENTIONALLY keep direct-child bodies
// (not wrapped into `.cell-stage`) — sized-media / own-grid components whose body
// is a single fit-to-frame canvas, not flowing prose that can overstuff. They
// don't need the stage clip: the body can't bleed past the slide edge the way an
// over-long list can, and an over-large canvas is already caught by the naive
// section-level overflow probe (it grows `section.scrollHeight`). This set is the
// third bucket of the migration taxonomy — every layout is in EXACTLY one of
// STAGE_MIGRATED (wrapped), STAGE_DEFERRED (band + direct-child body), or the
// chrome-exempt sovereign frames (no band; FORM_TOGGLE_SKIP in plugins.js). The
// drift test in test/unit/transformers asserts that partition is total, so a new
// component must be consciously placed — it can never sit silently unclassified.
//   · the 13 `chart` bucket layouts — each drives its own `.chart-body` grid.
//   · `diagram` — one pre-rendered Mermaid SVG sized to `100cqi − padding`
//     (diagram.styles.css); rewrapping would shift the container its cqi width +
//     Mermaid `useMaxWidth` resolve against, for no detection gain.
const STAGE_DEFERRED = new Set([
  'funnel', 'gantt', 'journey', 'kanban', 'map', 'piechart', 'progress',
  'quadrant', 'radar', 'roadmap', 'state-chart', 'timeline-list', 'word-cloud',
  'diagram',
  // connect — QR cards emit their own `.qr-card` grid; the body is a fixed
  // fit-to-frame card that can't overstuff, so it keeps a direct-child body.
  'wifi', 'contact',
  // video — a fixed fit-to-frame poster + QR figure (same QR kernel as the
  // cards); a direct-child body, not flowing prose that can overstuff.
  'video',
]);

/** Should this Form slide's body be wrapped into the `.cell-stage` cell? True for
 * generic prose (no layout token) and for any MIGRATED component; false for a
 * component still on direct-child bodies (STAGE_DEFERRED or chrome-exempt). */
function wrapsStageBody(cls) {
  return !cls.trim().split(/\s+/).some((t) => ALL_LAYOUTS.has(t) && !STAGE_MIGRATED.has(t));
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

// Capture (and remove) the first <h2> — the title.
function extractH2(html) {
  let el = '';
  const out = html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, (m) => { el = m; return ''; });
  return { el, html: out };
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
  const m = html.match(/^\s*<p[^>]*>\s*<code[^>]*>[\s\S]*?<\/code>\s*<\/p>/);
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

  // Build the masthead band IF the slide has a title. (math / compare-code drive
  // their own title grid and are chrome-exempt; a titleless prose slide just has
  // no band.)
  let band = '';
  let rest = r0;
  if (/<h2[^>]*>/.test(r0)) {
    const { el: eyebrow, html: r1 } = extractEyebrowP(r0);
    const { el: h2, html: r2 } = extractH2(r1);
    const { el: subtitle, html: r3 } = extractSubtitleP(r2);
    band =
      '<div class="cell-masthead">' +
        `<div class="masthead-lede">${eyebrow}${h2}${subtitle}</div>` +
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
  if (wrapsStageBody(cls)) {
    const fm = rest.match(/(\s*<footer[^>]*>[\s\S]*?<\/footer>\s*)$/);
    const footer = fm ? fm[1].trim() : '';
    const body = fm ? rest.slice(0, rest.length - fm[1].length) : rest;
    return `${header}${band}<div class="cell-stage">${body}</div>${buildFooterCell(footer, pagination)}`;
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
  wrapsStageBody,
  ALL_LAYOUTS,
  STAGE_MIGRATED,
  STAGE_DEFERRED,
  applyToRenderedHtml,
  transformMastheadSection,
};
