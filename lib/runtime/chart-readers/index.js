/**
 * The chart READERS, one per kind whose drawing depends on its box and whose marks carry its whole
 * source (lib/runtime/chart-redraw.js). Each module exports `{ kind, read }`; `read(body)` returns the
 * source list the kind's kernel reads, or null to keep the exported drawing. A kind with no reader keeps
 * its exported drawing in every box. engineering/decisions/2026-11-03-responsive-tables.md
 * §"Charts redraw on demand" lists which kinds have one and why the others do not.
 */
// journey has a reader (./journey.js), tested round trip in test/unit/runtime/chart-readers.test.js, and
// is HELD: its portrait board clips in the fluid stage at 390px (labels overlap, "Content clipped"), so a
// redraw would be worse than the small exported board. followups.d/3021-p9-chart-narrow-forms.md.
const MODULES = [
  require('./bar'),
  require('./line'),
  require('./slope'),
  require('./ep-curve'),
  require('./tower'),
  require('./stacked-bar'),
  require('./waterfall'),
  require('./bullet'),
  require('./heatmap'),
  require('./funnel'),
  require('./piechart'),
  require('./map'),
  require('./hub-spoke'),
  require('./roadmap'),
];

/** kind → read(body). */
module.exports = Object.freeze(Object.fromEntries(MODULES.map((m) => [m.kind, m.read])));
