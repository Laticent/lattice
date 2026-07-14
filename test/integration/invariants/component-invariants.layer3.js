/**
 * Layer 3 — per-component SEMANTIC invariants, and the TRANSFORM set.
 *
 * Layers 1–2 (contract slots + universal contrast/overflow) cover every component
 * automatically. Layer 3 adds the per-component truth that those generic layers
 * can't see. Two flavours:
 *
 *   • TRANSFORM components rewrite their authored markup — a chart's `ul > li`
 *     source list is consumed into an SVG/HTML chart frame, glossary's list
 *     becomes a `<table>`, compare-code's fences become code panels. For those
 *     the manifest slot selector
 *     describes the AUTHORING input (gone from the rendered DOM), so layer 1's
 *     "slot resolves" check is skipped (TRANSFORM set) and the RENDERED-output
 *     contract is asserted here.
 *
 *   • PLAIN components render straight semantic HTML styled entirely off the
 *     section `_class` (no transform, no bespoke classes). Layer 1 only checks
 *     that each REQUIRED slot selector resolves ≥1; layer 3 locks the distinctive
 *     STRUCTURE that makes the component itself — the figure⇄caption pairing of a
 *     KPI tile, the two reasoned options of a decision, an ordered step sequence,
 *     a flat (non-nested) bullet list, the optional eyebrow kicker layer 1 skips.
 *     These are deliberately lighter than a transform check (Layers 1–2 already
 *     guarantee the contract) but still assert MEANING, not pixels.
 *
 * Coverage: every component carries a layer-3 rule. Each entry maps a label →
 * async `(page, assert, SLIDE) => {}` run against the rendered sample slide
 * (`SLIDE` = `section[data-lattice-slide="1"]`). Keep these about MEANING —
 * counts, presence of a computed relationship — not pixels.
 */

// Every chart-family component renders the same frame: a `.chart-body` (with a
// `.chart-header`), whether its body is an <svg> (funnel/piechart/radar/…) or
// HTML (gantt/kanban/progress/timeline-list/roadmap/state-chart). That frame
// existing == the chart-family transform ran and consumed the authored source.
const CHARTS = [
  'funnel', 'gantt', 'journey', 'kanban', 'map', 'piechart',
  'progress', 'quadrant', 'radar', 'roadmap', 'state-chart',
  'timeline-list', 'word-cloud',
];

/** Assert ≥`min` matches of `sel` inside the slide. */
function present(sel, min, msg) {
  return async (page, assert, SLIDE) => {
    const n = await page.$$eval(`${SLIDE} ${sel}`, (els) => els.length);
    assert.ok(n >= min, `${msg} (expected ≥${min} "${sel}", got ${n})`);
  };
}

/**
 * Assert ≥`min` `parentSel` elements EACH contain all of `childSels`. Locks a
 * structural pairing (e.g. each `ol > li` carries both a `strong` figure and a
 * nested `:scope > ul` caption) — the relationship layer 1's flat "slot resolves"
 * check can't express. `:scope` in a childSel refers to the parent element.
 */
function eachWith(parentSel, childSels, min, msg) {
  return async (page, assert, SLIDE) => {
    const n = await page.$$eval(`${SLIDE} ${parentSel}`, (els, kids) =>
      els.filter((el) => kids.every((k) => {
        try { return !!el.querySelector(k); } catch { return false; }
      })).length, childSels);
    assert.ok(n >= min, `${msg} (expected ≥${min} "${parentSel}" each with ${childSels.join(' + ')}, got ${n})`);
  };
}

function chartFrameRenders() {
  return {
    'renders the chart-family frame (.chart-body)': async (page, assert, SLIDE) => {
      const n = await page.$$eval(`${SLIDE} .chart-body`, (els) => els.length);
      assert.ok(n >= 1, 'chart-family transform did not render a .chart-body frame (authored list not consumed into a chart)');
    },
  };
}

// Anchor slides (title / divider / closing) are minimal centred statements: a
// single heading + a kicker eyebrow (`p > code`, an OPTIONAL slot layer 1 skips)
// and — definitionally — NO list body. That last fact is what separates an
// anchor from every content component, so we lock it.
function anchorMinimal(headingTag) {
  return {
    [`renders a minimal anchor: ${headingTag} + kicker eyebrow, no list body`]: async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel, tag) => {
        const s = document.querySelector(sel);
        return {
          head: s.querySelectorAll(tag).length,
          kicker: s.querySelectorAll('p > code').length,
          lists: s.querySelectorAll('ol, ul').length,
        };
      }, SLIDE, headingTag);
      assert.ok(f.head >= 1, `anchor missing its ${headingTag} heading`);
      assert.ok(f.kicker >= 1, 'anchor missing its eyebrow kicker (p > code)');
      assert.equal(f.lists, 0, `anchor unexpectedly rendered ${f.lists} list(s) — not a minimal statement`);
    },
  };
}

const LAYER3 = {
  ...Object.fromEntries(CHARTS.map((c) => [c, chartFrameRenders()])),

  glossary: {
    'authored list becomes a definition table': async (page, assert, SLIDE) => {
      const rows = await page.$$eval(`${SLIDE} table tr`, (els) => els.length);
      assert.ok(rows >= 1, `glossary list did not render as table rows (got ${rows})`);
    },
  },

  'compare-code': {
    'renders two code panels': async (page, assert, SLIDE) => {
      const n = await page.$$eval(`${SLIDE} pre`, (els) => els.length);
      assert.ok(n >= 2, `expected ≥2 <pre> code panels, got ${n}`);
    },
  },


  // ── anchor ──
  title: anchorMinimal('h1'),
  divider: anchorMinimal('h2'),
  closing: anchorMinimal('h2'),

  // ── code ──
  code: {
    'renders a syntax-highlighted code block (pre > code)':
      present('pre code', 1, 'code did not render a highlighted code panel'),
  },

  // ── comparison ──
  'compare-table': {
    'authored rows render as a table':
      present('table tr', 2, 'compare-table did not render table rows'),
  },
  'compare-prose': {
    'renders two labelled prose options (strong + nested point)':
      eachWith('ul > li', ['strong', ':scope > ul'], 2, 'compare-prose did not render two labelled options'),
  },
  decision: {
    'renders two labelled options, each with its reasoning':
      eachWith('ul > li', ['strong', ':scope > ul'], 2, 'decision did not render two reasoned options'),
    // NOTE: the flush-corner badge's ABSOLUTE positioning is a Form-ON property
    // (the treatment reaches the label through `> .cell-stage >`), but this
    // harness pins `form: off` for component isolation — so that guard lives in
    // the dedicated Form-on test test/integration/parity/decision-corner-tag-cell-stage.test.js.
  },
  'matrix-2x2': {
    'renders four quadrant cells (li carrying a nested ul)': async (page, assert, SLIDE) => {
      const n = await page.$$eval(`${SLIDE} li`, (els) =>
        els.filter((li) => li.querySelector(':scope > ul')).length);
      assert.ok(n >= 4, `expected 4 quadrant cells, got ${n}`);
    },
  },
  pricing: {
    'renders pricing state badges (.badge)':
      present('.badge', 1, 'pricing did not render state badges'),
  },
  'split-compare': {
    'renders left + right compare panels and a verdict': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        return {
          l: !!s.querySelector('.compare-left'),
          r: !!s.querySelector('.compare-right'),
          v: !!s.querySelector('.verdict'),
        };
      }, SLIDE);
      assert.ok(f.l && f.r, `split-compare missing a panel (left=${f.l} right=${f.r})`);
      assert.ok(f.v, 'split-compare missing its .verdict');
    },
  },
  'verdict-grid': {
    'renders verdict badges (.badge)':
      present('.badge', 1, 'verdict-grid did not render verdict badges'),
  },
  redline: {
    'renders the redlined quote (blockquote)':
      present('blockquote', 1, 'redline did not render its blockquote'),
  },

  // ── evidence ──
  diagram: {
    'mermaid source compiled to a rendered SVG with nodes': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        return { svg: s.querySelectorAll('svg').length, nodes: s.querySelectorAll('svg .node, svg g.node').length };
      }, SLIDE);
      assert.ok(f.svg >= 1, 'diagram did not render a compiled <svg> (mermaid source not transformed)');
      assert.ok(f.nodes >= 1, 'diagram svg has no rendered nodes (mermaid compile produced an empty/error frame)');
    },
  },
  kpi: {
    'each KPI tile pairs a figure (strong) with a caption':
      eachWith('ol > li', ['strong', ':scope > ul'], 2, 'kpi did not render figure+caption tiles'),
  },
  stats: {
    'each stat tile pairs a figure (strong) with a label':
      eachWith('ol > li', ['strong', ':scope > ul'], 2, 'stats did not render figure+label tiles'),
  },

  // ── imagery ──
  image: {
    // The image rides as a CSS background-image on .lattice-bg (no <img>) —
    // see engineering/decisions/2026-06-17-image-rearchitecture.md.
    'renders a CSS-background image panel (.lattice-bg with background-image)':
      async (page, assert, SLIDE) => {
        const bg = await page.$$eval(`${SLIDE} .lattice-bg`, (els) =>
          els.map((el) => getComputedStyle(el).backgroundImage));
        assert.ok(bg.length >= 1, `image did not render a .lattice-bg panel (got ${bg.length})`);
        assert.ok(bg.some((b) => b && b !== 'none'),
          `image .lattice-bg has no background-image (${bg.join(', ')})`);
      },
  },

  // ── inventory ──
  actors: {
    'renders actor role pills (.lat-pill)':
      present('.lat-pill', 1, 'actors did not render role pills'),
  },
  agenda: {
    'renders ordered agenda items, each with a page locator':
      eachWith('ol > li', ['code'], 3, 'agenda did not render ordered items with page locators'),
  },
  'cards-grid': {
    'renders multiple cards, each a title with a body':
      eachWith('ul > li', [':scope > ul'], 3, 'cards-grid did not render title+body cards'),
  },
  'cards-stack': {
    'renders stacked cards, each a title with a body':
      eachWith('ul > li', [':scope > ul'], 2, 'cards-stack did not render title+body cards'),
  },
  checklist: {
    'renders status markers (.state)':
      present('.state', 1, 'checklist did not render status markers'),
  },
  list: {
    'renders a flat bullet list (no nested cards)': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        const lis = [...s.querySelectorAll('ul > li')];
        return { n: lis.length, nested: lis.filter((li) => li.querySelector(':scope > ul')).length };
      }, SLIDE);
      assert.ok(f.n >= 3, `list rendered ${f.n} items, expected ≥3`);
      assert.equal(f.nested, 0, `list is meant to be flat but ${f.nested} item(s) nest a sub-list`);
    },
  },
  'list-tabular': {
    'each row carries a body and an emphasised meta column':
      eachWith('ol > li', ['em', ':scope > ul'], 3, 'list-tabular did not render rows with meta columns'),
  },
  'logo-wall': {
    'renders multiple token-coloured mark spans':
      present('.logo-mark', 2, 'logo-wall did not render multiple .logo-mark spans (logo-marks transform)'),
    'marks can carry a name + pill caption below the mark':
      eachWith('ul > li', [':scope > .logo-mark', ':scope > ul > li > code'], 2,
        'logo-wall did not render captioned marks (mark + nested name/pill list)'),
  },
  'q-and-a': {
    'each question pairs with its answer':
      eachWith('ul > li', [':scope > ul'], 2, 'q-and-a did not pair questions with answers'),
  },

  // ── legal ──
  'authority-chain': {
    'each tier renders a label and a citation':
      eachWith('ol > li', ['strong', 'code'], 3, 'authority-chain did not render labelled tiers with citations'),
  },
  'citation-card': {
    'renders the citation (blockquote)':
      present('blockquote', 1, 'citation-card did not render its blockquote'),
  },
  'obligation-matrix': {
    'renders an obligation table with status markers': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        return { rows: s.querySelectorAll('table tr').length, states: s.querySelectorAll('.state').length };
      }, SLIDE);
      assert.ok(f.rows >= 2, `obligation-matrix table rows ${f.rows} < 2`);
      assert.ok(f.states >= 1, 'obligation-matrix missing status markers (.state)');
    },
  },
  'regulatory-update': {
    'each update renders a citation and an effective-date badge':
      eachWith('ol > li', ['strong', 'code'], 3, 'regulatory-update did not render cited, dated updates'),
  },
  'statute-stack': {
    'each jurisdiction renders a label and a statutory citation':
      eachWith('ul > li', ['strong', 'code'], 3, 'statute-stack did not render labelled rows with citations'),
  },

  // ── math ──
  math: {
    'renders KaTeX math (.katex)':
      present('.katex', 1, 'math did not render any KaTeX (authored $…$ not transformed)'),
  },

  // ── progression ──
  'list-criteria': {
    'each criterion renders a label and its rationale':
      eachWith('ol > li', ['strong', ':scope > ul'], 3, 'list-criteria did not render labelled criteria'),
  },
  'list-steps': {
    'renders an ordered sequence of steps, each with detail': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        const ol = s.querySelector('ol');
        return { ordered: !!ol, steps: ol ? [...ol.children].filter((li) => li.querySelector(':scope > ul')).length : 0 };
      }, SLIDE);
      assert.ok(f.ordered, 'list-steps is not an ordered (numbered) sequence');
      assert.ok(f.steps >= 3, `list-steps rendered ${f.steps} detailed steps, expected ≥3`);
    },
  },

  // ── statement ──
  'big-number': {
    'renders the figure with its caption and an eyebrow': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        return {
          fig: [...s.querySelectorAll('ul > li')].filter((li) => li.querySelector(':scope > ul')).length,
          eyebrow: s.querySelectorAll('p > code').length,
        };
      }, SLIDE);
      assert.ok(f.fig >= 1, 'big-number missing its figure+caption (li with a nested caption list)');
      assert.ok(f.eyebrow >= 1, 'big-number missing its eyebrow kicker');
    },
  },
  content: {
    'renders a heading over a prose paragraph body, with an eyebrow': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        const ps = [...s.children].filter((e) => e.tagName === 'P');
        return {
          h: s.querySelectorAll('h2').length,
          eyebrow: s.querySelectorAll('p > code').length,
          prose: ps.filter((p) => !p.querySelector('code') && p.textContent.trim().length > 40).length,
        };
      }, SLIDE);
      assert.ok(f.h >= 1, 'content missing its h2 heading');
      assert.ok(f.eyebrow >= 1, 'content missing its eyebrow kicker');
      assert.ok(f.prose >= 1, 'content missing its prose body paragraph');
    },
  },
  quote: {
    'renders the quotation (blockquote)':
      present('blockquote', 1, 'quote did not render a blockquote'),
  },
  'split-panel': {
    'renders left + right panels': async (page, assert, SLIDE) => {
      const f = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        return { l: !!s.querySelector('.panel-left'), r: !!s.querySelector('.panel-right') };
      }, SLIDE);
      assert.ok(f.l && f.r, `split-panel missing a panel (left=${f.l} right=${f.r})`);
    },
  },
  // connect — the postfix-key list is consumed into a `.qr-card` with an embedded
  // QR tile; assert the rendered card + code, not the authored `ul > li`.
  wifi: {
    'renders a scannable QR tile':
      present('.qr-card .qr-tile svg[role="img"]', 1, 'wifi did not render a QR tile'),
    'renders the readable credential rows':
      present('.qr-fields .qr-row', 2, 'wifi did not render credential rows'),
  },
  contact: {
    'renders a scannable QR tile':
      present('.qr-card .qr-tile svg[role="img"]', 1, 'contact did not render a QR tile'),
    'renders the identity name':
      present('.qr-identity .qr-name', 1, 'contact did not render the identity name'),
  },
};

// Components whose authored slot markup is consumed by a transform — layer 1's
// "slot selector resolves" is meaningless for them, so it's skipped and the
// rendered contract above stands in.
const TRANSFORM = new Set([...CHARTS, 'glossary', 'compare-code', 'wifi', 'contact']);

module.exports = { LAYER3, TRANSFORM };
