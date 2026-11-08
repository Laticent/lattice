/** The tower chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');

/**
 * TOWER. Each layer's rects share its index (`data-mark`), bottom layer first, which is the order the
 * kernel sorts them into. The kernel records the source on the rects (tower.transform.js `shareIdent`):
 * a retention, or a layer no reinsurer is on yet, is one rect carrying its name and size as written
 * (`data-label`, `data-value`). A placed layer's rects carry its name and size as written (`data-layer`,
 * `data-layer-size`); each share names its reinsurer (`data-series-name`) and lists its pills as written
 * (`data-raw`); an `Others` segment lists the reinsurers it folds, with their pills (`data-members`).
 * The `Open` rect carries only the layer, since the kernel works it out from the shares.
 *
 * Writing each layer's shares in slot order, then its folded ones, bottom layer first, gives the kernel
 * back the same slots: a slot is a reinsurer's first appearance from the bottom up, and every kept
 * reinsurer first appears before any folded one.
 */

/** A JSON list off an attribute, or null when it is missing or not the shape the kernel writes. */
function listOf(s) {
  if (s == null) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const isText = (v) => typeof v === 'string';
const pills = (raws) => (Array.isArray(raws) && raws.length && raws.every(isText) ? raws : null);
const shareItems = (name, raws) => raws.map((r) => `<li>${esc(name)} <code>${esc(r)}</code></li>`).join('');

function readTower(body) {
  if (uncarried(body)) return null;
  const rects = [...body.querySelectorAll('rect[data-mark]')];
  const count = rects.reduce((n, r) => Math.max(n, Number(r.dataset.mark) + 1), 0);
  if (!count) return null;

  const items = [];
  for (let i = 0; i < count; i += 1) {
    const own = rects.filter((r) => Number(r.dataset.mark) === i);
    // A gap in the numbering is a layer the marks do not carry.
    if (!own.length) return null;
    const whole = own.find((r) => r.classList.contains('tower-retention') || r.classList.contains('tower-layer'));
    if (whole) {
      if (own.length !== 1 || whole.dataset.label === undefined || !whole.dataset.value) return null;
      items.push(`<li>${esc(whole.dataset.label)} <code>${esc(whole.dataset.value)}</code></li>`);
      continue;
    }
    // A placed layer: every rect names the same layer.
    const label = own[0].dataset.layer;
    const size = own[0].dataset.layerSize;
    if (label === undefined || !size || own.some((r) => r.dataset.layer !== label || r.dataset.layerSize !== size)) return null;
    let sub = '';
    for (const r of own) {
      if (r.classList.contains('tower-open')) continue;
      if (!r.classList.contains('tower-share')) return null;
      const members = listOf(r.dataset.members);
      if (members) {
        for (const m of members) {
          if (!Array.isArray(m) || !isText(m[0]) || !m[0] || !pills(m[1])) return null;
          sub += shareItems(m[0], m[1]);
        }
        continue;
      }
      const name = r.dataset.seriesName;
      const raws = pills(listOf(r.dataset.raw));
      if (!name || !raws) return null;
      sub += shareItems(name, raws);
    }
    // A layer whose rects are all `Open` drew no share: there is nothing it was split by.
    if (!sub) return null;
    items.push(`<li>${esc(label)} <code>${esc(size)}</code><ul>${sub}</ul></li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'tower', read: readTower };
