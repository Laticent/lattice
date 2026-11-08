/** The tower chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened } = require('./shared');

/**
 * TOWER. Each layer's marks share its index (`data-mark`), bottom layer first, which is the order the
 * kernel sorts them into. A retention's rect carries its name and its size as written. A placed layer's
 * name and size print in its left column (`tower-name`, `tower-note`), and each share rect carries
 * `<layer> · <reinsurer>` and its share as printed. Past six reinsurers the kernel folds the rest into
 * one `Others` segment per layer, and only the layer's note template says who they are, so the reader
 * takes the members from there.
 *
 * Writing each layer's shares in slot order, bottom layer first, gives the kernel back the same slots:
 * a slot is a reinsurer's first appearance from the bottom up.
 */
const OTHERS = 'Others';

const round1 = (v) => Math.round(v * 10) / 10;
const pctOf = (s) => (/^\d+(?:\.\d+)?%$/.test(s) ? Number(s.slice(0, -1)) : null);

/** `Others 50% (Umbra Re 25%, Meridian Re 25%)` → the members, or null when the line does not read back whole. */
function membersOf(template, total) {
  const li = [...template.content.querySelectorAll('li')].map((l) => l.textContent)
    .find((t) => t.startsWith(`${OTHERS} ${total} (`) && t.endsWith(')'));
  if (!li) return null;
  const inner = li.slice(`${OTHERS} ${total} (`.length, -1);
  const members = [...inner.matchAll(/(.+?) (\d+(?:\.\d+)?%)(?:, |$)/g)].map((m) => ({ name: m[1], pct: m[2] }));
  // Joined again, the members must be the line exactly, or a name held a ", " or a figure we split on.
  return members.map((m) => `${m.name} ${m.pct}`).join(', ') === inner ? members : null;
}

function readTower(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg.tower-svg > desc');
  if (!desc) return null;
  const said = desc.textContent;
  const rects = [...body.querySelectorAll('rect[data-mark]')];
  const count = rects.reduce((n, r) => Math.max(n, Number(r.dataset.mark) + 1), 0);
  if (!count) return null;

  const items = [];
  for (let i = 0; i < count; i += 1) {
    const own = rects.filter((r) => Number(r.dataset.mark) === i);
    // A gap in the numbering is a layer the marks do not carry.
    if (!own.length) return null;
    // A retention, or a layer no reinsurer is on yet, is one rect carrying its name and its size as written.
    const whole = own.find((r) => r.classList.contains('tower-retention') || r.classList.contains('tower-layer'));
    if (whole) {
      if (own.length !== 1 || !whole.dataset.label || !whole.dataset.value) return null;
      if (shortened(whole.dataset.label)) return null;
      items.push(`<li>${esc(whole.dataset.label)} <code>${esc(whole.dataset.value)}</code></li>`);
      continue;
    }
    // A placed layer: its size prints in the left column, and its name both there and, in full, at the
    // head of every share rect's `<layer> · <reinsurer>`. The column's name settles where the layer's name
    // ends; a column that shortened it still has to agree with the rects up to its ellipsis.
    const nameEl = body.querySelector(`text.tower-name[data-mark-for="${i}"]`);
    const noteEl = body.querySelector(`text.tower-note[data-mark-for="${i}"]`);
    if (!nameEl || !noteEl) return null;
    const size = textOf(noteEl);
    if (!size || shortened(size)) return null;
    const shown = textOf(nameEl);
    const first = own[0].dataset.label || '';
    const cut = first.indexOf(' \u00b7 ');
    const label = shortened(shown) ? (cut > 0 ? first.slice(0, cut) : '') : shown;
    if (!label?.startsWith(shown.split('\u2026')[0].trimEnd())) return null;
    const prefix = `${label} \u00b7 `;
    const shares = [];
    let open = 0;
    for (const r of own) {
      const l = r.dataset.label || '';
      const pct = pctOf(r.dataset.value || '');
      if (!l.startsWith(prefix) || pct == null) return null;
      const name = l.slice(prefix.length);
      if (r.classList.contains('tower-open')) { open = pct; continue; }
      if (!r.classList.contains('tower-share') || !name || shortened(name)) return null;
      if (name !== OTHERS) { shares.push({ name, pct: r.dataset.value }); continue; }
      // A folded segment: its members, from the layer's note.
      const template = body.querySelector(`template.chart-detail[data-mark="${i}"]`);
      const members = template && membersOf(template, r.dataset.value);
      if (!members) return null;
      shares.push(...members);
    }
    // Shares print to one decimal. The open share and an over-placement are worked out from the exact
    // figures, so recomputing them from the printed ones must give what the export printed, or a share
    // carried more decimals than its label shows.
    const placed = shares.reduce((t, s) => t + pctOf(s.pct), 0);
    if (shares.length && Math.max(0, round1(100 - placed)) !== open) return null;
    if (round1(placed) > 100 && !said.includes(`, over-placed at ${round1(placed)}%`)) return null;
    const sub = shares.map((s) => `<li>${esc(s.name)} <code>${esc(s.pct)}</code></li>`).join('');
    items.push(`<li>${esc(label)} <code>${esc(size)}</code>${sub ? `<ul>${sub}</ul>` : ''}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'tower', read: readTower };
