/**
 * Roadmap DOM transforms — shared between the build path
 * (lattice-emulator.js) and the owned engine (lib/engine).
 *
 * Two transforms live here, both keyed off the roadmap layout:
 *
 *   - `roadmap status`   : scan every <td> in the table; if it begins with
 *                          a state marker ([x], [-], [ ], [/]) strip the
 *                          marker and tag the cell with class="cell-state
 *                          state-shipped|state-wip|state-planned|state-skipped".
 *
 *   - `roadmap horizons` : transpose the table into a three-card (or N-card)
 *                          horizons board. Each phase column becomes a
 *                          .horizon-card containing the phase header at the
 *                          top and a stacked list of workstream rows beneath.
 *
 * Operates on rendered HTML strings so it can run in both contexts:
 *   - the emulator's per-slide HTML during PDF/HTML build
 *   - the marp-core engine's whole-render output for VS Code Marp preview
 *
 * Sibling implementations (must stay in sync — three-renderer parity):
 *   - lattice-emulator.js — calls applyToRenderedHtml per slide
 *   - lattice-runtime.js  — DOM mirror for marp-vscode preview / web export
 */

const { mapSections } = require('../../../core/section-walk');
const { findMatchingClose } = require('../../../core/find-matching-close');

const ROADMAP_MODIFIERS = ['status', 'horizons'];

function _escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// State marker → state class. Marker syntax mirrors checklist / verdict-grid:
//   [x] shipped, [-] in flight, [ ] planned, [/] skipped (out of scope).
function markerToState(marker) {
  switch (marker) {
    case 'x': return 'state-shipped';
    case '-': return 'state-wip';
    case ' ': return 'state-planned';
    case '/': return 'state-skipped';
    default:  return '';
  }
}

const STATE_LABEL = {
  'state-shipped':  'Shipped',
  'state-wip':      'In flight',
  'state-planned':  'Planned',
  'state-skipped':  'Out of scope',
};

// Canonical legend order — left-to-right reads as a lifecycle.
const STATE_ORDER = ['state-shipped', 'state-wip', 'state-planned', 'state-skipped'];

// Build the status-marker KEY for a roadmap. The cells encode meaning by
// SYMBOL (✓ shipped / – in flight / ○ planned / ╱ out of scope), which an
// emailed deck reader can't decode without a legend. Scans the (already
// state-tagged) html, emits one chip per state ACTUALLY present, in lifecycle
// order, reusing the exact disc+masked-glyph recipe the cells use (CSS in
// roadmap.styles.css). Returns '' when no states are present (a plain roadmap
// with no markers needs no key). Placed bottom-center under the grid by
// wrapRoadmapFigure — the best-practice spot for a wide, full-width chart.
function buildStatusLegend(html) {
  const present = STATE_ORDER.filter((s) => html.includes(s));
  if (present.length === 0) return '';
  const items = present.map((state) =>
    `<li class="roadmap-legend-item ${state}">` +
      `<span class="roadmap-legend-mark" aria-hidden="true"></span>` +
      `<span class="roadmap-legend-label">${STATE_LABEL[state]}</span>` +
    `</li>`,
  ).join('');
  return `<ul class="roadmap-legend" aria-label="Status key">${items}</ul>`;
}

// Walk a <tr>'s inner HTML, returning the contents of each <td> or <th>
// in document order. Tolerates attributes on the cell tags and any
// inline HTML inside the cells.
function parseRowCells(rowHtml) {
  const cells = [];
  const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = cellRe.exec(rowHtml)) !== null) {
    cells.push({ tag: m[1], inner: m[2], full: m[0] });
  }
  return cells;
}

// Extract <thead> and <tbody> blocks from a <table>.
function splitTable(tableHtml) {
  const theadMatch = tableHtml.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/);
  const tbodyMatch = tableHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/);
  return {
    theadInner: theadMatch ? theadMatch[1] : '',
    tbodyInner: tbodyMatch ? tbodyMatch[1] : '',
  };
}

function parseRows(sectionHtml) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(sectionHtml)) !== null) {
    rows.push(parseRowCells(m[1]));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// roadmap status: tag <td> cells whose content begins with a state marker.
// ---------------------------------------------------------------------------

function applyStatusMarkers(inner) {
  // Only touch <td> cells (header row is unaffected). Skip the leftmost
  // cell of each row (workstream label) by matching only inside <tbody>.
  return inner.replace(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/, (tbodyFull, tbodyInner) => {
    const newTbody = tbodyInner.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, (trFull) => {
      let cellIndex = -1;
      return trFull.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/g, (full, attrs, content) => {
        cellIndex++;
        if (cellIndex === 0) return full; // workstream label cell — leave alone
        const m = /^\s*(?:<[^>]+>\s*)?\[([x\-/ ])\]\s*/.exec(content);
        if (!m) return full;
        const state = markerToState(m[1]);
        if (!state) return full;
        const stripped = content.replace(/^\s*(<[^>]+>\s*)?\[[x\-/ ]\]\s*/, '$1');
        const label = STATE_LABEL[state];
        // `\sclass=` — an unguarded `class="` also matches `data-class="…"`, which
        // would merge the state tokens into a data attribute instead of the class
        // list (lib/core/section-walk.js readClassAttr, #1358).
        const existingClass = /\sclass="([^"]*)"/.exec(attrs);
        let newAttrs;
        const stateClasses = `cell-state ${state}`;
        if (existingClass) {
          newAttrs = attrs.replace(/\sclass="([^"]*)"/, (_a, c) => ` class="${c} ${stateClasses}"`);
        } else {
          newAttrs = `${attrs} class="${stateClasses}"`;
        }
        const eyebrow = `<span class="cell-state-label">${label}</span>`;
        return `<td${newAttrs}>${eyebrow}<span class="cell-state-text">${stripped.trim()}</span></td>`;
      });
    });
    return tbodyFull.replace(tbodyInner, newTbody);
  });
}

// ---------------------------------------------------------------------------
// roadmap horizons: rewrite the table into a horizons-card grid.
// ---------------------------------------------------------------------------
//
// Layout:
//   <div class="horizons">
//     <div class="horizon-card" style="--phase-accent:var(--cat-1-mark);--phase-ink:var(--cat-1-ink, var(--cat-1-mark))">
//       <div class="horizon-head">
//         <span class="horizon-eyebrow">Phase 01</span>
//         <span class="horizon-title">{ first phase header text }</span>
//       </div>
//       <ul class="horizon-rows">
//         <li><span class="row-label">{ workstream }</span>
//             <span class="row-text">{ commitment }</span></li>
//         …
//       </ul>
//     </div>
//     …
//   </div>
//
// Eight-step categorical rotation matches the rest of the layout system.

// Two tokens per horizon, for the two WCAG cases the card uses its hue in:
// --phase-accent paints the card's top rule and its meta pill (graphical, 3:1, the
// mark tier's guarantee), --phase-ink paints the "PHASE 01" eyebrow, which is small
// TEXT and needs 4.5:1. The table variants set both from CSS (see roadmap.styles.css);
// `.horizons` has no table, so the transform must emit both here — emitting only the
// accent left every eyebrow falling through to a flat `var(--accent)`, i.e. three
// differently-colored cards with identically-colored eyebrows. (#1263)
const HORIZON_ACCENTS = [
  'var(--cat-1-mark)',   'var(--cat-2-mark)',  'var(--cat-3-mark)', 'var(--cat-4-mark)',
  'var(--cat-5-mark)',   'var(--cat-6-mark)',   'var(--cat-7-mark)',  'var(--cat-8-mark)',
];
const HORIZON_INKS = [
  'var(--cat-1-ink, var(--cat-1-mark))',    'var(--cat-2-ink, var(--cat-2-mark))',   'var(--cat-3-ink, var(--cat-3-mark))',  'var(--cat-4-ink, var(--cat-4-mark))',
  'var(--cat-5-ink, var(--cat-5-mark))',    'var(--cat-6-ink, var(--cat-6-mark))',    'var(--cat-7-ink, var(--cat-7-mark))',   'var(--cat-8-ink, var(--cat-8-mark))',
];

function applyHorizons(inner) {
  // Find the first <table> inside the section.
  const tableMatch = inner.match(/<table\b[^>]*>[\s\S]*?<\/table>/);
  if (!tableMatch) return inner;
  const tableHtml = tableMatch[0];
  const { theadInner, tbodyInner } = splitTable(tableHtml);
  if (!theadInner || !tbodyInner) return inner;

  // Header row → phase columns. First header cell is the workstream-column
  // label (not used in horizons output — workstream identity moves inside
  // each card row).
  const headRows = parseRows(theadInner);
  if (headRows.length === 0) return inner;
  const headCells = headRows[0];
  if (headCells.length < 2) return inner;
  const phaseHeaders = headCells.slice(1).map(c => c.inner.trim());

  // Body rows. First cell of each row is the workstream label, the rest
  // are commitments — one per phase column, by index. Each commitment
  // cell may have already been tagged by applyStatusMarkers (state
  // class + .cell-state-text wrapper); extract the state class and the
  // plain text so the card row can carry the state forward.
  const bodyRows = parseRows(tbodyInner)
    .map(cells => ({
      label: cells[0] ? cells[0].inner.trim() : '',
      cells: cells.slice(1).map(c => {
        const stateMatch = /\sclass="[^"]*\b(state-shipped|state-wip|state-planned|state-skipped)\b/.exec(c.full);
        const state = stateMatch ? stateMatch[1] : '';
        const textMatch = /<span class="cell-state-text">([\s\S]*?)<\/span>/.exec(c.inner);
        const text = textMatch ? textMatch[1].trim() : c.inner.trim();
        return { text, state };
      }),
    }))
    .filter(r => r.label !== '');

  const cards = phaseHeaders.map((header, idx) => {
    const accent = HORIZON_ACCENTS[idx % HORIZON_ACCENTS.length];
    const ink = HORIZON_INKS[idx % HORIZON_INKS.length];
    const phaseNum = String(idx + 1).padStart(2, '0');
    // Lift a trailing <code> into a meta pill in the card head — same
    // contract as the universal trailing-code meta pill on phase
    // headers in the non-transposed roadmap layouts.
    let headerText = header;
    let metaPill = '';
    const trailingCode = header.match(/\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*$/);
    if (trailingCode) {
      headerText = header.slice(0, trailingCode.index).trim();
      metaPill = `<span class="horizon-meta">${trailingCode[1]}</span>`;
    }
    const rows = bodyRows.map(r => {
      const cell = r.cells[idx] || { text: '', state: '' };
      const text = cell.text;
      const isEmpty = !text || text === '—' || text === '-';
      const textHtml = isEmpty
        ? '<span class="row-text row-empty">—</span>'
        : `<span class="row-text">${text}</span>`;
      const stateClass = cell.state ? ` class="cell-state ${cell.state}"` : '';
      return `<li${stateClass}><span class="row-label">${r.label}</span>${textHtml}</li>`;
    }).join('');
    return (
      `<div class="horizon-card" style="--phase-accent:${accent};--phase-ink:${ink}">` +
        `<div class="horizon-head">` +
          `<span class="horizon-eyebrow">Phase ${phaseNum}</span>` +
          `<span class="horizon-title">${headerText}</span>` +
          metaPill +
        `</div>` +
        `<ul class="horizon-rows">${rows}</ul>` +
      `</div>`
    );
  }).join('');

  const horizonsBlock = `<div class="horizons">${cards}</div>`;
  return inner.replace(tableHtml, horizonsBlock);
}

// ---------------------------------------------------------------------------
// Section dispatcher
// ---------------------------------------------------------------------------

function transformRoadmapSection(inner, cls) {
  const tokens = cls.trim().split(/\s+/);
  if (!tokens.includes('roadmap')) return inner;
  let html = inner;
  // Cell state markers are universal — `[x]/[-]/[ ]/[/]` works in any
  // roadmap variant. The .status modifier adds the heavy treatment
  // (ribbon + tint + eyebrow) on top via CSS; other variants get the
  // light treatment (state-colored dot + skip strike-through).
  if (!/\sclass="[^"]*cell-state/.test(html)) {
    html = applyStatusMarkers(html);
  }
  // Then transpose if .horizons — the horizons transform reads the
  // state classes from the already-tagged cells and carries them onto
  // the card rows.
  if (tokens.includes('horizons')) {
    if (!/class="horizons"/.test(html)) {
      html = applyHorizons(html);
    }
  }
  return html;
}

function applyToRenderedHtml(html) {
  return mapSections(html, (_openTag, cls, inner) => {
    const tokens = cls.trim().split(/\s+/);
    return tokens.includes('roadmap') ? transformRoadmapSection(inner, cls) : null;
  });
}



// Roadmap's body is a <table> (default / status) or a transposed
// `<div class="horizons">` grid (horizons variant) — not a single labeled
// figure div like the list-based members. Wrap whichever is present in a
// `.roadmap-figure` div so the (div-based) chart-frame body matcher and its
// depth-aware close scan treat it as the body. Idempotent.
function wrapRoadmapFigure(html, legend = '') {
  if (/class="roadmap-figure"/.test(html)) return html;
  // The status-marker key (or '') rides INSIDE the figure, after the grid, so
  // the chart-frame body wrap treats [grid + legend] as one body unit and the
  // legend sits bottom-center within the body (never spilling to the footer).
  const inject = legend || '';
  // Horizons variant: wrap the .horizons grid (depth-aware, it nests
  // .horizon-card divs).
  const hz = html.indexOf('<div class="horizons">');
  if (hz >= 0) {
    const end = findMatchingClose(html, 'div', hz);
    if (end > 0) {
      return html.slice(0, hz) + '<div class="roadmap-figure">' +
        html.slice(hz, end) + inject + '</div>' + html.slice(end);
    }
    return html;
  }
  // Default / status: wrap the <table> (roadmap tables never nest a table).
  const t = html.indexOf('<table');
  if (t >= 0) {
    const close = html.indexOf('</table>', t);
    if (close >= 0) {
      const end = close + '</table>'.length;
      return html.slice(0, t) + '<div class="roadmap-figure">' +
        html.slice(t, end) + inject + '</div>' + html.slice(end);
    }
  }
  return html;
}


/**
 * The chart-family entrypoint (see the `kernel` block in roadmap.manifest.json).
 *
 * The one kernel that returns a CLASS as well as HTML: on a portrait deck it
 * auto-selects the `horizons` card form, and the token has to ride back onto
 * the live section for the section-class-gated card CSS to apply.
 */
function transformSection(html, ctx) {
  let cls = ctx.cls;
  // On a NON-LANDSCAPE deck, auto-select the horizons card form: the wide table
  // letterboxes in a tall box (5+ columns crushed, header collisions), while
  // the phase cards lay out as a clean grid. Adding the token to
  // `cls` drives BOTH the transpose (transformRoadmapSection reads it) AND the
  // section-class-gated card CSS (`section.roadmap.horizons`) — and it rides
  // into the returned cls, so the live section carries the class. The CSS then
  // fits the cards to the box. 2026-06-19-chart-adaptive-sizing §10.
  //
  // PORTRAIT ONLY, deliberately — #1209 asked whether square should select
  // horizons too, since `orientationFor` classifies 0.9–1.05 as its own family
  // and a square deck keeps the wide table (which clips 26px). Tried and
  // REJECTED on measurement: horizons at square lays out 3 columns of ~197px,
  // the one-line workstream rows wrap, and cards balloon to 721px for a 956px
  // grid in a 728px stage — 74px, nearly three times the clip it was meant to
  // cure. The square table's 26px is an overflow in the figure's own chrome and
  // is fixed there instead. Selecting a different FORM is not the cheaper fix
  // when the form's content does not fit either.
  if (ctx.orientation === 'portrait' && !ctx.classTokens.includes('horizons')) {
    cls = (cls + ' horizons').trim();
  }
  // The kernel tags the table's cells (and transposes to .horizons under the
  // `horizons` variant) in place. Unlike the list-based members, roadmap's
  // body is a <table> / .horizons grid, so wrap it in a `.roadmap-figure`
  // div for the (div-based) chart-frame body matcher.
  html = transformRoadmapSection(html, cls);
  // Build the status-marker key from the now-tagged cells and tuck it inside
  // the figure (bottom-center under the grid). Empty when no markers exist.
  // Only `status` opts out: its heavy treatment already prints SHIPPED /
  // IN FLIGHT / … on every cell, so a key is redundant. (`horizons` once
  // opted out too — its cards filled the body — but the horizons grid now
  // sizes to content and centers, freeing a key row; see roadmap.styles.css.)
  const skipKey = /\bstatus\b/.test(cls);
  const roadmapKey = skipKey ? '' : buildStatusLegend(html);
  return { html: wrapRoadmapFigure(html, roadmapKey), cls };
}

module.exports = {
  transformSection,
  wrapRoadmapFigure,
  ROADMAP_MODIFIERS,
  HORIZON_ACCENTS,
  STATE_LABEL,
  applyToRenderedHtml,
  transformRoadmapSection,
  buildStatusLegend,
  applyStatusMarkers,
  applyHorizons,
  // exposed for unit tests
  parseRowCells,
  parseRows,
  splitTable,
  markerToState,
};
