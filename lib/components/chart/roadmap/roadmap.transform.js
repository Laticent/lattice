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
// with no markers needs no key). Placed bottom-centre under the grid by
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
        const existingClass = /class="([^"]*)"/.exec(attrs);
        let newAttrs;
        const stateClasses = `cell-state ${state}`;
        if (existingClass) {
          newAttrs = attrs.replace(/class="([^"]*)"/, (_a, c) => `class="${c} ${stateClasses}"`);
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
//     <div class="horizon-card" style="--phase-accent:var(--cat-1-mark)">
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

const HORIZON_ACCENTS = [
  'var(--cat-1-mark)',   'var(--cat-2-mark)',  'var(--cat-3-mark)', 'var(--cat-4-mark)',
  'var(--cat-5-mark)',   'var(--cat-6-mark)',   'var(--cat-7-mark)',  'var(--cat-8-mark)',
];

// The parallel phase-rail border: the compiled 40%-into-border tint of each cat hue
// (--cat-K-phaseborder, roadmap.styles.css recipe). Set inline alongside --phase-accent
// so the horizon card's border-left reads a flat token — no color-mix in the paint,
// which an old engine would drop. Same rotation index as HORIZON_ACCENTS.
const HORIZON_PHASE_BORDERS = [
  'var(--cat-1-phaseborder)', 'var(--cat-2-phaseborder)', 'var(--cat-3-phaseborder)', 'var(--cat-4-phaseborder)',
  'var(--cat-5-phaseborder)', 'var(--cat-6-phaseborder)', 'var(--cat-7-phaseborder)', 'var(--cat-8-phaseborder)',
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
        const stateMatch = /class="[^"]*\b(state-shipped|state-wip|state-planned|state-skipped)\b/.exec(c.full);
        const state = stateMatch ? stateMatch[1] : '';
        const textMatch = /<span class="cell-state-text">([\s\S]*?)<\/span>/.exec(c.inner);
        const text = textMatch ? textMatch[1].trim() : c.inner.trim();
        return { text, state };
      }),
    }))
    .filter(r => r.label !== '');

  const cards = phaseHeaders.map((header, idx) => {
    const accent = HORIZON_ACCENTS[idx % HORIZON_ACCENTS.length];
    const phaseBorder = HORIZON_PHASE_BORDERS[idx % HORIZON_PHASE_BORDERS.length];
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
      `<div class="horizon-card" style="--phase-accent:${accent}; --phase-border:${phaseBorder}">` +
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
  // light treatment (state-coloured dot + skip strike-through).
  if (!/class="[^"]*cell-state/.test(html)) {
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

module.exports = {
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
