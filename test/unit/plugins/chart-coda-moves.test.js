/**
 * Unit: a phone chart is drawn for the room its key insight leaves ONLY when the insight really leaves.
 *
 * On a square, tall or strip page the measured split moves a chart slide's key insight to the run's closing page
 * (owner, 2026-11-22; lib/core/fit-measure.js `insightCrowds`), and the chart is drawn for the room that frees
 * (lib/plugins/chart-family/shared/chart-phone.js `codaMoves`). The first version drew every phone chart that way, so
 * where the insight STAYS (a `fit: heal` or `fit: report` deck, a `fit-report` slide, the Studio's Present and slide
 * overview, which never split) the chart was laid out for the whole page and then squeezed into the room above the
 * insight, its labels a few pixels tall (red team, 2026-11-22). The engine now says whether the render is measured
 * (lib/engine/index.js `activeMeasured`): the deck's `fit:`, or the host's `measured` option.
 *
 *   MEASURED   the default deck draws its chart taller than the same deck with `fit: heal`, and stamps
 *              `data-coda-moves` for the runtime's rebuild; `fit: heal` does not
 *   REPORT     a `fit: report` deck and a `fit-report` slide in a measured deck draw as `fit: heal` does
 *   HOST       `measured: false` (a surface that never splits) draws as `fit: heal` does; `measured: true` (the CLI's
 *              `--fit-pack`) draws a `fit: heal` deck as the default does
 *   NO CODA    a chart with no key insight draws the same in every mode
 *
 * FALSIFIABLE: with `codaMoves: true` passed unconditionally (the first version) MEASURED's heal box and REPORT and HOST
 * all equal the measured box.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../../lib/engine');

const chart = (fit, cls = 'bar', insight = true) => `---
theme: indaco
size: portrait
${fit ? `fit: ${fit}\n` : ''}---

<!-- _class: ${cls} -->

## Support load sits with two teams.

- Platform \`412\`
- Billing \`388\`
- Mobile \`96\`
- Web \`71\`
${insight ? '\n> Two teams take four tickets in five, and the other two together take well under a fifth of the volume.\n' : ''}`;

/** The box the phone chart was drawn in, `[w, h]` in page px, and whether its section carries the stamp. */
function drawn(md, opts) {
  const html = engine.render(md, 'indaco', opts || {}).html;
  const at = html.indexOf(' data-form-box="');
  assert.ok(at > 0, 'the phone chart was drawn by the form kernel');
  const box = html.slice(at + 16, html.indexOf('"', at + 16)).split(' ').map(Number);
  const open = html.slice(html.lastIndexOf('<section', at), html.indexOf('>', html.lastIndexOf('<section', at)));
  return { h: box[1], stamped: open.includes(' data-coda-moves="true"') };
}

test('MEASURED: the default deck draws the chart for the room its insight leaves; fit: heal keeps the insight\'s room', () => {
  const pack = drawn(chart(''));
  const heal = drawn(chart('heal'));
  assert.ok(pack.h > heal.h, `measured box ${pack.h}px is taller than heal's ${heal.h}px`);
  assert.equal(pack.stamped, true, 'the measured render stamps data-coda-moves');
  assert.equal(heal.stamped, false, 'a heal render does not');
});

test('REPORT: a fit: report deck and a fit-report slide draw as fit: heal does', () => {
  const heal = drawn(chart('heal')).h;
  assert.equal(drawn(chart('report')).h, heal);
  assert.equal(drawn(chart('', 'bar fit-report')).h, heal);
});

test('HOST: measured: false draws as fit: heal does; measured: true draws a heal deck as the default does', () => {
  assert.equal(drawn(chart(''), { measured: false }).h, drawn(chart('heal')).h);
  assert.equal(drawn(chart(''), { measured: false }).stamped, false);
  assert.equal(drawn(chart('heal'), { measured: true }).h, drawn(chart('')).h);
});

test('NO CODA: a chart with no key insight draws the same in every mode', () => {
  const h = drawn(chart('', 'bar', false)).h;
  assert.equal(drawn(chart('heal', 'bar', false)).h, h);
  assert.equal(drawn(chart('', 'bar', false), { measured: false }).h, h);
});
