/** The bullet chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened, noteFor } = require('./shared');
// The kernel's own number reader, so `1,2M`, `(5)` and `−5` read back as the kernel read them.
const { parseValue } = require('../../core/chart-values');

/** The derived qualitative range, as fractions of the target (lib/core/bullet-facts.js BAND_FRACTIONS). */
const DERIVED = [0.6, 0.85];
/** Every coordinate is printed to two decimals, so a position read back is off by up to this much. */
const HALF_ULP = 0.005;
const num = (el, a) => Number(el.getAttribute(a));

/**
 * BULLET. Each row's `rect.bullet-measure` carries its name and its measure as written. Its TARGET is on
 * no mark as written: the readout prints it formatted (`vs 5M`), which can round. So the reader takes the
 * printed target and proves it against the drawing: the bar runs from zero, so the tick sits at
 * `target / measure` of the bar's length, and a rounded target lands its tick somewhere else.
 *
 * What the marks never carry refuses the chart: a `Floor` (its value is only in the desc), an authored
 * `Band` (the zones are geometry with no value on them; derived zones are proved by where they fall), and
 * a row whose target cannot be checked (no bar to measure it against, or a bar clipped at the edge).
 */
function readBullet(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg > desc')?.textContent || '';
  if (body.querySelector('.bullet-floor, .bullet-offscale') || desc.includes(', on a scale from ')) return null;
  const bars = [...body.querySelectorAll('rect.bullet-measure[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (!bars.length) return null;
  // A row's name, readout, tick and zones are drawn in its own band, top to bottom, so each row's
  // furniture is what lies between its bar and the next row's.
  const svg = bars[0].ownerSVGElement || bars[0].closest('svg');
  const all = [...svg.querySelectorAll('rect.bullet-band, rect.bullet-measure, line.bullet-target, text.bullet-plan, text.bullet-name')];
  const rows = [];
  let row = null;
  for (const el of all) {
    // A row draws its zones, then its bar: a zone or a bar arriving after a bar starts the next row.
    const opens = el.matches('rect.bullet-band, rect.bullet-measure');
    if (opens && (!row || row.bar)) rows.push(row = { bands: [] });
    if (!row) return null;
    if (el.matches('rect.bullet-band')) row.bands.push(el);
    else if (el.matches('rect.bullet-measure')) row.bar = el;
    else if (el.matches('line.bullet-target')) row.tick = el;
    else if (el.matches('text.bullet-plan')) row.plan = el;
  }
  // Every named row drew a bar, numbered 0..n-1 in order: a row with no measure has no mark to read.
  if (body.querySelectorAll('text.bullet-name').length > bars.length || rows.length !== bars.length) return null;
  if (rows.some((r, k) => r.bar?.dataset.mark !== String(k))) return null;

  const items = [];
  for (const [k, r] of rows.entries()) {
    const label = r.bar.dataset.label || '';
    const value = r.bar.dataset.value || '';
    if (shortened(label)) return null;
    let target = '';
    if (r.plan || r.tick || r.bands.length) {
      // A target prints as `vs <value>`, draws a tick, and derives three zones; any one alone is a row
      // the marks cannot account for (a target at or under zero, a hand-written band without a target).
      if (!r.plan || !r.tick || r.bands.length !== DERIVED.length + 1) return null;
      const printed = textOf(r.plan).replace(/^vs\s+/, '');
      if (shortened(printed) || !/\d/.test(printed)) return null;
      const x0 = num(r.bar, 'x');
      const w = num(r.bar, 'width');
      const t = num(r.tick, 'x1') - x0;
      const m = parseValue(value);
      const p = parseValue(printed);
      if (!(w > 1) || !(m > 0) || !Number.isFinite(p) || r.bar.dataset.clipped) return null;
      // The printed target must sit where the tick does, to within what two-decimal rounding allows.
      const slack = m * (HALF_ULP / w + (HALF_ULP * t) / (w * w)) * 2 + 1e-9;
      if (Math.abs(p - (m * t) / w) > slack) return null;
      // Derived zones break at 60 % and 85 % of the way to the tick; anything else was authored.
      const edges = r.bands.slice(0, DERIVED.length).map((b) => num(b, 'x') + num(b, 'width') - x0);
      if (edges.some((e, z) => Math.abs(e - DERIVED[z] * t) > 0.02)) return null;
      target = ` <code>${esc(printed)}</code>`;
    }
    items.push(`<li>${esc(label)} <code>${esc(value)}</code>${target}${noteFor(body, k)}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'bullet', read: readBullet };
